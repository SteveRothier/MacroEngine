//! Convert library items between macro / clicker / script (lossy, non-destructive).

use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::clicker::{ClickMode, ClickTarget, ClickerConfig, InputKind, LimitMode};
use crate::clicker_presets::load_preset;
use crate::library_index::{get_library_index, move_library_item, LibraryKind};
use crate::macro_library::{create_macro, list_macros, load_macro, save_macro};
use crate::schema::{
    ActionNode, MacroValue, SCHEMA_VERSION_CURRENT, Trigger,
};
use crate::script_library::{list_scripts, load_script, save_script, ScriptDoc};

#[derive(Debug, Error)]
pub enum ConvertError {
    #[error("{0}")]
    Message(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ConvertMode {
    Transpile,
    Wrap,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConvertReport {
    pub kept: Vec<String>,
    pub dropped: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConvertResult {
    pub new_id: String,
    pub new_name: String,
    pub to_kind: String,
    pub report: ConvertReport,
}

fn new_script_id() -> String {
    let ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("s{ms:x}")
}

fn unique_macro_name(config_dir: &Path, base: &str) -> Result<String, ConvertError> {
    let existing = list_macros(config_dir).map_err(|e| ConvertError::Message(e.to_string()))?;
    if !existing.iter().any(|n| n == base) {
        return Ok(base.to_string());
    }
    for i in 2..200 {
        let candidate = format!("{base} ({i})");
        if !existing.iter().any(|n| n == &candidate) {
            return Ok(candidate);
        }
    }
    Err(ConvertError::Message("no free macro name".into()))
}

fn unique_script_name(config_dir: &Path, base: &str) -> Result<String, ConvertError> {
    let scripts = list_scripts(config_dir).map_err(|e| ConvertError::Message(e.to_string()))?;
    if !scripts.iter().any(|s| s.name == base) {
        return Ok(base.to_string());
    }
    for i in 2..200 {
        let candidate = format!("{base} ({i})");
        if !scripts.iter().any(|s| s.name == candidate) {
            return Ok(candidate);
        }
    }
    Err(ConvertError::Message("no free script name".into()))
}

fn source_folder_id(
    config_dir: &Path,
    kind: LibraryKind,
    id: &str,
) -> Result<Option<String>, ConvertError> {
    let dto = get_library_index(config_dir, kind).map_err(|e| ConvertError::Message(e.to_string()))?;
    Ok(dto
        .items
        .into_iter()
        .find(|i| i.id == id)
        .and_then(|i| i.folder_id))
}

fn assign_folder(
    config_dir: &Path,
    kind: LibraryKind,
    id: &str,
    folder_id: Option<String>,
) -> Result<(), ConvertError> {
    if folder_id.is_none() {
        return Ok(());
    }
    move_library_item(config_dir, kind, id.to_string(), folder_id, None)
        .map_err(|e| ConvertError::Message(e.to_string()))
}

fn js_string_literal(s: &str) -> String {
    serde_json::to_string(s).unwrap_or_else(|_| "\"\"".into())
}

fn macro_value_js(v: &MacroValue) -> String {
    match v {
        MacroValue::String(s) => js_string_literal(s),
        MacroValue::Number(n) => {
            if n.fract() == 0.0 && n.abs() < 1e15 {
                format!("{}", *n as i64)
            } else {
                format!("{n}")
            }
        }
        MacroValue::Bool(b) => if *b { "true" } else { "false" }.into(),
    }
}

fn action_blocks_transpile(a: &ActionNode) -> Option<&'static str> {
    match a {
        ActionNode::MouseClick { .. }
        | ActionNode::MouseMove { .. }
        | ActionNode::MouseDown { .. }
        | ActionNode::MouseUp { .. }
        | ActionNode::MouseWheel { .. } => Some("mouse.*"),
        ActionNode::Delay { .. } => Some("delay"),
        ActionNode::KeyTap { .. } | ActionNode::KeyDown { .. } | ActionNode::KeyUp { .. } => {
            Some("key.*")
        }
        ActionNode::ProcessRun { .. } => Some("process.run"),
        ActionNode::ControlIf { .. } => Some("control.if"),
        ActionNode::ControlWhile { .. } => Some("control.while"),
        _ => None,
    }
}

fn transpile_action(a: &ActionNode, out: &mut String, report: &mut ConvertReport) {
    match a {
        ActionNode::VarSet { name, value, .. } => {
            out.push_str(&format!(
                "caster.set({}, {});\n",
                js_string_literal(name),
                macro_value_js(value)
            ));
            report.kept.push(format!("var.set:{name}"));
        }
        ActionNode::ClipboardSet { text, .. } => {
            out.push_str(&format!("caster.clipboardWrite({});\n", js_string_literal(text)));
            report.kept.push("clipboard.set".into());
        }
        ActionNode::ClipboardGet { name, .. } => {
            out.push_str(&format!(
                "caster.set({}, caster.clipboardRead());\n",
                js_string_literal(name)
            ));
            report.kept.push("clipboard.get".into());
        }
        ActionNode::HttpRequest {
            method,
            url,
            body,
            body_var,
            ..
        } => {
            let body_js = body
                .as_ref()
                .map(|b| js_string_literal(b))
                .unwrap_or_else(|| "undefined".into());
            if let Some(bv) = body_var {
                out.push_str(&format!(
                    "caster.set({}, caster.fetch({{ method: {}, url: {}, body: {} }}));\n",
                    js_string_literal(bv),
                    js_string_literal(method),
                    js_string_literal(url),
                    body_js
                ));
            } else {
                out.push_str(&format!(
                    "caster.fetch({{ method: {}, url: {}, body: {} }});\n",
                    js_string_literal(method),
                    js_string_literal(url),
                    body_js
                ));
            }
            report.kept.push("http.request".into());
            report.warnings.push(
                "http.request → caster.fetch (headers/timeout/failOnStatus not fully mapped)"
                    .into(),
            );
        }
        ActionNode::JsonPath {
            source_var,
            path,
            dest_var,
            ..
        } => {
            out.push_str(&format!(
                "// json.path {source_var} → {dest_var} ({path}) — approximate\n"
            ));
            out.push_str(&format!(
                "(function(){{ var s=caster.get({src}); var o=(typeof s==='string')?JSON.parse(s):s; var p={path}.split('.'); for (var i=0;i<p.length;i++){{ if(o==null) break; o=o[p[i]]; }} caster.set({dest}, o); }})();\n",
                src = js_string_literal(source_var),
                path = js_string_literal(path),
                dest = js_string_literal(dest_var),
            ));
            report.kept.push("json.path".into());
        }
        ActionNode::ScriptRun {
            source,
            script_id,
            ..
        } => {
            if let Some(sid) = script_id {
                out.push_str(&format!(
                    "// nested script.run scriptId={sid} — not inlined\n"
                ));
                report.dropped.push(format!("script.run:{sid}"));
            } else if !source.trim().is_empty() {
                out.push_str(source);
                if !source.ends_with('\n') {
                    out.push('\n');
                }
                report.kept.push("script.run:inline".into());
            }
        }
        other => {
            if let Some(label) = action_blocks_transpile(other) {
                report.dropped.push(label.into());
            } else {
                report.dropped.push("unknown".into());
            }
        }
    }
}

fn macro_has_input_actions(actions: &[ActionNode]) -> Vec<String> {
    let mut out = Vec::new();
    for a in actions {
        if let Some(l) = action_blocks_transpile(a) {
            out.push(l.into());
        }
        match a {
            ActionNode::ControlIf {
                then, else_branch, ..
            } => {
                out.extend(macro_has_input_actions(then));
                out.extend(macro_has_input_actions(else_branch));
            }
            ActionNode::ControlWhile { body, .. } => {
                out.extend(macro_has_input_actions(body));
            }
            _ => {}
        }
    }
    out
}

fn clicker_is_trivial(cfg: &ClickerConfig) -> Result<(), Vec<String>> {
    let mut reasons = Vec::new();
    if cfg.points_enabled || !cfg.points.is_empty() {
        reasons.push("points".into());
    }
    if !cfg.stop_zones.is_empty() {
        reasons.push("stopZones".into());
    }
    if cfg.pixel_condition.is_some() {
        reasons.push("pixelCondition".into());
    }
    if cfg.random_enabled || cfg.cps_jitter > 0.0 {
        reasons.push("jitter/random".into());
    }
    if cfg.duty_cycle < 0.999 {
        reasons.push("dutyCycle".into());
    }
    if matches!(cfg.mode, ClickMode::Hold) {
        reasons.push("hold mode".into());
    }
    if matches!(cfg.input_kind, InputKind::Keyboard) {
        reasons.push("keyboard input".into());
    }
    if cfg
        .on_complete_macro
        .as_ref()
        .is_some_and(|s| !s.trim().is_empty())
    {
        reasons.push("onCompleteMacro".into());
    }
    match &cfg.target {
        ClickTarget::CurrentCursor | ClickTarget::Fixed { .. } => {}
    }
    if !cfg.limits_enabled {
        reasons.push("unlimited run (need maxClicks or maxDuration)".into());
    } else if !matches!(cfg.limit_mode, LimitMode::Clicks | LimitMode::Time | LimitMode::Both)
    {
        reasons.push("unsupported limitMode".into());
    }
    if reasons.is_empty() {
        Ok(())
    } else {
        Err(reasons)
    }
}

fn clicker_to_macro_actions(cfg: &ClickerConfig) -> (Vec<ActionNode>, ConvertReport) {
    let mut report = ConvertReport {
        kept: vec!["mouse.click".into(), "delay".into()],
        dropped: Vec::new(),
        warnings: vec!["Clicker features beyond fixed clicks+delay are not converted".into()],
    };
    let (x, y) = match &cfg.target {
        ClickTarget::Fixed { x, y } => (Some(*x), Some(*y)),
        ClickTarget::CurrentCursor => (None, None),
    };
    let interval_ms = if cfg.cps > 0.0 {
        (1000.0 / cfg.cps).round().max(1.0) as u64
    } else {
        100
    };
    let clicks = if cfg.limits_enabled {
        if let Some(n) = cfg.max_clicks.filter(|n| *n > 0) {
            n.min(10_000) as u32
        } else if let Some(ms) = cfg.max_duration_ms.filter(|n| *n > 0) {
            ((ms as f64) / (interval_ms as f64)).ceil() as u32
        } else {
            1
        }
    } else {
        1
    };
    report.warnings.push(format!("Generated {clicks} click(s) at ~{interval_ms} ms"));
    let mut actions = Vec::new();
    for i in 0..clicks {
        actions.push(ActionNode::MouseClick {
            id: format!("c{i}"),
            button: "left".into(),
            x,
            y,
        });
        if i + 1 < clicks {
            actions.push(ActionNode::Delay {
                id: format!("d{i}"),
                ms: interval_ms,
            });
        }
    }
    (actions, report)
}

/// Convert a library item to another kind. Creates a **new** item; source is kept.
pub fn convert_library_item(
    config_dir: &Path,
    from_kind: LibraryKind,
    id: &str,
    to_kind: LibraryKind,
    mode: ConvertMode,
) -> Result<ConvertResult, ConvertError> {
    if from_kind == to_kind {
        return Err(ConvertError::Message("same kind".into()));
    }

    match (from_kind, to_kind) {
        (LibraryKind::Script, LibraryKind::Macro) => {
            script_to_macro(config_dir, id)
        }
        (LibraryKind::Macro, LibraryKind::Script) => {
            macro_to_script(config_dir, id, mode)
        }
        (LibraryKind::Clicker, LibraryKind::Macro) => {
            clicker_to_macro(config_dir, id)
        }
        (LibraryKind::Clicker, LibraryKind::Script) => {
            // Via macro intermediate in-memory then wrap/transpile.
            let mid = clicker_to_macro(config_dir, id)?;
            let r = macro_to_script(config_dir, &mid.new_id, mode)?;
            // Leave intermediate macro; user can delete. Warn.
            let mut report = r.report;
            report.warnings.push(format!(
                "Intermediate macro « {} » was also created",
                mid.new_name
            ));
            Ok(ConvertResult {
                new_id: r.new_id,
                new_name: r.new_name,
                to_kind: "script".into(),
                report,
            })
        }
        (LibraryKind::Macro, LibraryKind::Clicker) => {
            Err(ConvertError::Message(
                "macro→clicker only for trivial CPS patterns — not supported yet; convert refused"
                    .into(),
            ))
        }
        (LibraryKind::Script, LibraryKind::Clicker) => Err(ConvertError::Message(
            "script→clicker is not supported (orthogonal models)".into(),
        )),
        _ => Err(ConvertError::Message("unsupported conversion".into())),
    }
}

fn script_to_macro(config_dir: &Path, id: &str) -> Result<ConvertResult, ConvertError> {
    let doc = load_script(config_dir, id).map_err(|e| ConvertError::Message(e.to_string()))?;
    let folder = source_folder_id(config_dir, LibraryKind::Script, id)?;
    let name = unique_macro_name(config_dir, &format!("{} (macro)", doc.name))?;
    let mut macro_doc = create_macro(config_dir, Some(&name))
        .map_err(|e| ConvertError::Message(e.to_string()))?;
    macro_doc.name = name.clone();
    macro_doc.schema_version = SCHEMA_VERSION_CURRENT;
    macro_doc.trigger = Trigger::Manual;
    macro_doc.actions = vec![ActionNode::ScriptRun {
        id: "s1".into(),
        source: String::new(),
        script_id: Some(doc.id.clone()),
        timeout_ms: 30_000,
        params: doc.param_values.clone(),
        result_var: None,
    }];
    save_macro(config_dir, &name, &macro_doc).map_err(|e| ConvertError::Message(e.to_string()))?;
    assign_folder(config_dir, LibraryKind::Macro, &name, folder)?;
    Ok(ConvertResult {
        new_id: name.clone(),
        new_name: name,
        to_kind: "macro".into(),
        report: ConvertReport {
            kept: vec!["script.run wrap".into()],
            dropped: Vec::new(),
            warnings: vec!["Macro wraps the original script via script.run".into()],
        },
    })
}

fn macro_to_script(
    config_dir: &Path,
    id: &str,
    mode: ConvertMode,
) -> Result<ConvertResult, ConvertError> {
    let doc = load_macro(config_dir, id).map_err(|e| ConvertError::Message(e.to_string()))?;
    let folder = source_folder_id(config_dir, LibraryKind::Macro, id)?;
    let blockers = macro_has_input_actions(&doc.actions);

    if mode == ConvertMode::Transpile && !blockers.is_empty() {
        return Err(ConvertError::Message(format!(
            "transpile blocked by: {}",
            blockers.join(", ")
        )));
    }

    let name = unique_script_name(config_dir, &format!("{} (script)", doc.name))?;
    let (source, report, allow_network, allow_clipboard, allow_macro) =
        if mode == ConvertMode::Wrap || !blockers.is_empty() {
            let src = format!(
                "// Reference wrap — runs the original macro\ncaster.runMacro({});\n",
                js_string_literal(&doc.name)
            );
            (
                src,
                ConvertReport {
                    kept: vec!["runMacro wrap".into()],
                    dropped: blockers,
                    warnings: vec![
                        "Script calls caster.runMacro; enable macro control permission".into(),
                    ],
                },
                false,
                false,
                true,
            )
        } else {
            let mut src = String::from("// Transpiled from macro (data actions)\n");
            let mut report = ConvertReport {
                kept: Vec::new(),
                dropped: Vec::new(),
                warnings: Vec::new(),
            };
            let mut allow_net = false;
            let mut allow_clip = false;
            for a in &doc.actions {
                if matches!(a, ActionNode::HttpRequest { .. }) {
                    allow_net = true;
                }
                if matches!(
                    a,
                    ActionNode::ClipboardSet { .. } | ActionNode::ClipboardGet { .. }
                ) {
                    allow_clip = true;
                }
                transpile_action(a, &mut src, &mut report);
            }
            (src, report, allow_net, allow_clip, false)
        };

    let script = ScriptDoc {
        id: new_script_id(),
        name: name.clone(),
        source,
        allow_network,
        allow_clipboard,
        allow_fs: false,
        allow_macro_control: allow_macro,
        allow_input: false,
        param_values: Default::default(),
    };
    save_script(config_dir, &script).map_err(|e| ConvertError::Message(e.to_string()))?;
    assign_folder(config_dir, LibraryKind::Script, &script.id, folder)?;

    Ok(ConvertResult {
        new_id: script.id,
        new_name: name,
        to_kind: "script".into(),
        report,
    })
}

fn clicker_to_macro(config_dir: &Path, id: &str) -> Result<ConvertResult, ConvertError> {
    let preset = load_preset(config_dir, id).map_err(|e| ConvertError::Message(e.to_string()))?;
    if let Err(reasons) = clicker_is_trivial(&preset.config) {
        return Err(ConvertError::Message(format!(
            "clicker too complex: {}",
            reasons.join(", ")
        )));
    }
    let folder = source_folder_id(config_dir, LibraryKind::Clicker, id)?;
    let name = unique_macro_name(config_dir, &format!("{} (macro)", preset.name))?;
    let (actions, report) = clicker_to_macro_actions(&preset.config);
    let mut macro_doc = create_macro(config_dir, Some(&name))
        .map_err(|e| ConvertError::Message(e.to_string()))?;
    macro_doc.name = name.clone();
    macro_doc.actions = actions;
    macro_doc.trigger = preset.trigger.clone();
    save_macro(config_dir, &name, &macro_doc).map_err(|e| ConvertError::Message(e.to_string()))?;
    assign_folder(config_dir, LibraryKind::Macro, &name, folder)?;
    Ok(ConvertResult {
        new_id: name.clone(),
        new_name: name,
        to_kind: "macro".into(),
        report,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_dir() -> std::path::PathBuf {
        let p = std::env::temp_dir().join(format!(
            "caster-convert-{}-{}",
            std::process::id(),
            new_script_id()
        ));
        let _ = fs::create_dir_all(&p);
        p
    }

    #[test]
    fn script_to_macro_wrap() {
        let dir = temp_dir();
        let doc = ScriptDoc {
            id: "s1".into(),
            name: "Hello".into(),
            source: "caster.log('hi');".into(),
            allow_network: true,
            allow_clipboard: false,
            allow_fs: false,
            allow_macro_control: false,
            allow_input: false,
            param_values: Default::default(),
        };
        save_script(&dir, &doc).unwrap();
        let r = convert_library_item(
            &dir,
            LibraryKind::Script,
            "s1",
            LibraryKind::Macro,
            ConvertMode::Wrap,
        )
        .unwrap();
        assert_eq!(r.to_kind, "macro");
        let m = load_macro(&dir, &r.new_id).unwrap();
        assert!(matches!(
            &m.actions[0],
            ActionNode::ScriptRun {
                script_id: Some(id),
                ..
            } if id == "s1"
        ));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn macro_data_to_script_transpile() {
        let dir = temp_dir();
        let mut m = create_macro(&dir, Some("Data")).unwrap();
        m.actions = vec![ActionNode::VarSet {
            id: "v1".into(),
            name: "n".into(),
            value: MacroValue::Number(1.0),
        }];
        save_macro(&dir, "Data", &m).unwrap();
        let r = convert_library_item(
            &dir,
            LibraryKind::Macro,
            "Data",
            LibraryKind::Script,
            ConvertMode::Transpile,
        )
        .unwrap();
        let s = load_script(&dir, &r.new_id).unwrap();
        assert!(s.source.contains("caster.set"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn script_to_clicker_refused() {
        let dir = temp_dir();
        let doc = ScriptDoc {
            id: "s2".into(),
            name: "X".into(),
            source: "".into(),
            allow_network: true,
            allow_clipboard: false,
            allow_fs: false,
            allow_macro_control: false,
            allow_input: false,
            param_values: Default::default(),
        };
        save_script(&dir, &doc).unwrap();
        let err = convert_library_item(
            &dir,
            LibraryKind::Script,
            "s2",
            LibraryKind::Clicker,
            ConvertMode::Wrap,
        )
        .unwrap_err();
        assert!(err.to_string().contains("not supported"));
        let _ = fs::remove_dir_all(&dir);
    }
}
