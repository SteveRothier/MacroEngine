//! Convert library items between macro / clicker / script (lossy, non-destructive).

use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::clicker::{
    ClickMode, ClickPoint, ClickTarget, ClickZoneOrder, ClickerConfig, InputKind, LimitMode,
};
use crate::clicker_presets::{list_presets, load_preset, save_preset};
use crate::library_index::{get_library_index, move_library_item, LibraryKind};
use crate::macro_library::{create_macro, list_macros, load_macro, save_macro};
use crate::schema::{
    ActionNode, CompareOp, Condition, MacroValue, Operand, SCHEMA_VERSION_CURRENT, Trigger,
};
use crate::script_library::{
    list_scripts, load_script, save_script, ScriptDoc, ScriptLanguage,
};

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

fn unique_clicker_name(config_dir: &Path, base: &str) -> Result<String, ConvertError> {
    let existing = list_presets(config_dir).map_err(|e| ConvertError::Message(e.to_string()))?;
    if !existing.iter().any(|n| n == base) {
        return Ok(base.to_string());
    }
    for i in 2..200 {
        let candidate = format!("{base} ({i})");
        if !existing.iter().any(|n| n == &candidate) {
            return Ok(candidate);
        }
    }
    Err(ConvertError::Message("no free clicker name".into()))
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

fn operand_js(op: &Operand) -> String {
    match op {
        Operand::Literal(v) => macro_value_js(v),
        Operand::Var { var } => format!("caster.get({})", js_string_literal(var)),
    }
}

fn compare_op_js(op: CompareOp) -> &'static str {
    match op {
        CompareOp::Eq => "===",
        CompareOp::Ne => "!==",
        CompareOp::Gt => ">",
        CompareOp::Lt => "<",
        CompareOp::Gte => ">=",
        CompareOp::Lte => "<=",
    }
}

/// Classic left/op/right → JS expression. `None` when predicate-based (process.*) or unsupported.
fn condition_js(cond: &Condition) -> Option<String> {
    if cond.predicate.is_some() {
        return None;
    }
    Some(format!(
        "{} {} {}",
        operand_js(&cond.left),
        compare_op_js(cond.op),
        operand_js(&cond.right)
    ))
}

fn action_blocks_transpile(a: &ActionNode) -> Option<&'static str> {
    match a {
        ActionNode::ControlIf { condition, .. } => {
            if condition_js(condition).is_none() {
                Some("control.if")
            } else {
                None
            }
        }
        ActionNode::ControlWhile { condition, .. } => {
            if condition_js(condition).is_none() {
                Some("control.while")
            } else {
                None
            }
        }
        _ => None,
    }
}

fn action_needs_input(a: &ActionNode) -> bool {
    matches!(
        a,
        ActionNode::MouseClick { .. }
            | ActionNode::MouseMove { .. }
            | ActionNode::MouseDown { .. }
            | ActionNode::MouseUp { .. }
            | ActionNode::MouseWheel { .. }
            | ActionNode::Delay { .. }
            | ActionNode::KeyTap { .. }
            | ActionNode::KeyDown { .. }
            | ActionNode::KeyUp { .. }
    )
}

fn action_tree_needs_input(a: &ActionNode) -> bool {
    if action_needs_input(a) {
        return true;
    }
    match a {
        ActionNode::ControlIf {
            then, else_branch, ..
        } => then.iter().any(action_tree_needs_input)
            || else_branch.iter().any(action_tree_needs_input),
        ActionNode::ControlWhile { body, .. } => body.iter().any(action_tree_needs_input),
        _ => false,
    }
}

fn action_tree_needs_network(a: &ActionNode) -> bool {
    match a {
        ActionNode::HttpRequest { .. } => true,
        ActionNode::ControlIf {
            then, else_branch, ..
        } => then.iter().any(action_tree_needs_network)
            || else_branch.iter().any(action_tree_needs_network),
        ActionNode::ControlWhile { body, .. } => body.iter().any(action_tree_needs_network),
        _ => false,
    }
}

fn action_tree_needs_clipboard(a: &ActionNode) -> bool {
    match a {
        ActionNode::ClipboardSet { .. } | ActionNode::ClipboardGet { .. } => true,
        ActionNode::ControlIf {
            then, else_branch, ..
        } => then.iter().any(action_tree_needs_clipboard)
            || else_branch.iter().any(action_tree_needs_clipboard),
        ActionNode::ControlWhile { body, .. } => body.iter().any(action_tree_needs_clipboard),
        _ => false,
    }
}

fn action_tree_needs_process(a: &ActionNode) -> bool {
    match a {
        ActionNode::ProcessRun { .. } => true,
        ActionNode::ControlIf {
            then, else_branch, ..
        } => then.iter().any(action_tree_needs_process)
            || else_branch.iter().any(action_tree_needs_process),
        ActionNode::ControlWhile { body, .. } => body.iter().any(action_tree_needs_process),
        _ => false,
    }
}

fn action_tree_needs_macro_control(a: &ActionNode) -> bool {
    match a {
        ActionNode::ScriptRun {
            script_id: Some(_), ..
        } => true,
        ActionNode::ControlIf {
            then, else_branch, ..
        } => then.iter().any(action_tree_needs_macro_control)
            || else_branch.iter().any(action_tree_needs_macro_control),
        ActionNode::ControlWhile { body, .. } => body.iter().any(action_tree_needs_macro_control),
        _ => false,
    }
}

fn mouse_opts_js(button: &str, x: Option<i32>, y: Option<i32>) -> String {
    let mut parts = vec![format!("button: {}", js_string_literal(button))];
    if let Some(x) = x {
        parts.push(format!("x: {x}"));
    }
    if let Some(y) = y {
        parts.push(format!("y: {y}"));
    }
    format!("{{ {} }}", parts.join(", "))
}

fn key_mods_js(mods: &crate::schema::KeyMods) -> String {
    format!(
        "{{ ctrl: {}, alt: {}, shift: {} }}",
        if mods.ctrl { "true" } else { "false" },
        if mods.alt { "true" } else { "false" },
        if mods.shift { "true" } else { "false" },
    )
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
                    "caster.runScript({});\n",
                    js_string_literal(sid)
                ));
                report.kept.push(format!("script.run:{sid}"));
            } else if !source.trim().is_empty() {
                out.push_str(source);
                if !source.ends_with('\n') {
                    out.push('\n');
                }
                report.kept.push("script.run:inline".into());
            }
        }
        ActionNode::ProcessRun {
            command,
            args,
            wait,
            timeout_ms,
            ..
        } => {
            let args_js = args
                .iter()
                .map(|a| js_string_literal(a))
                .collect::<Vec<_>>()
                .join(", ");
            let timeout = timeout_ms
                .map(|ms| format!(", timeoutMs: {ms}"))
                .unwrap_or_default();
            out.push_str(&format!(
                "caster.runProcess({{ command: {}, args: [{args_js}], wait: {}{timeout} }});\n",
                js_string_literal(command),
                if *wait { "true" } else { "false" },
            ));
            report.kept.push("process.run".into());
        }
        ActionNode::Delay { ms, .. } => {
            out.push_str(&format!("caster.sleep({ms});\n"));
            report.kept.push("delay".into());
        }
        ActionNode::MouseClick { button, x, y, .. } => {
            out.push_str(&format!(
                "caster.click({});\n",
                mouse_opts_js(button, *x, *y)
            ));
            report.kept.push("mouse.click".into());
        }
        ActionNode::MouseMove { x, y, .. } => {
            out.push_str(&format!("caster.moveTo({x}, {y});\n"));
            report.kept.push("mouse.move".into());
        }
        ActionNode::MouseDown { button, x, y, .. } => {
            out.push_str(&format!(
                "caster.mouseDown({});\n",
                mouse_opts_js(button, *x, *y)
            ));
            report.kept.push("mouse.down".into());
        }
        ActionNode::MouseUp { button, x, y, .. } => {
            out.push_str(&format!(
                "caster.mouseUp({});\n",
                mouse_opts_js(button, *x, *y)
            ));
            report.kept.push("mouse.up".into());
        }
        ActionNode::MouseWheel { delta, x, y, .. } => {
            let opts = match (*x, *y) {
                (Some(x), Some(y)) => format!(", {{ x: {x}, y: {y} }}"),
                _ => String::new(),
            };
            out.push_str(&format!("caster.wheel({delta}{opts});\n"));
            report.kept.push("mouse.wheel".into());
        }
        ActionNode::KeyTap { key, mods, .. } => {
            out.push_str(&format!(
                "caster.keyTap({}, {});\n",
                js_string_literal(key),
                key_mods_js(mods)
            ));
            report.kept.push("key.tap".into());
        }
        ActionNode::KeyDown { key, mods, .. } => {
            out.push_str(&format!(
                "caster.keyDown({}, {});\n",
                js_string_literal(key),
                key_mods_js(mods)
            ));
            report.kept.push("key.down".into());
        }
        ActionNode::KeyUp { key, mods, .. } => {
            out.push_str(&format!(
                "caster.keyUp({}, {});\n",
                js_string_literal(key),
                key_mods_js(mods)
            ));
            report.kept.push("key.up".into());
        }
        ActionNode::ControlIf {
            condition,
            then,
            else_branch,
            ..
        } => {
            let Some(cond) = condition_js(condition) else {
                report.dropped.push("control.if".into());
                return;
            };
            out.push_str(&format!("if ({cond}) {{\n"));
            for child in then {
                transpile_action(child, out, report);
            }
            if !else_branch.is_empty() {
                out.push_str("} else {\n");
                for child in else_branch {
                    transpile_action(child, out, report);
                }
            }
            out.push_str("}\n");
            report.kept.push("control.if".into());
        }
        ActionNode::ControlWhile {
            id,
            condition,
            body,
            max_iterations,
            ..
        } => {
            let Some(cond) = condition_js(condition) else {
                report.dropped.push("control.while".into());
                return;
            };
            let var_name = format!(
                "__w_{}",
                id.chars()
                    .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
                    .collect::<String>()
            );
            out.push_str(&format!(
                "for (var {var_name} = 0; {var_name} < {max_iterations} && ({cond}); {var_name}++) {{\n"
            ));
            for child in body {
                transpile_action(child, out, report);
            }
            out.push_str("}\n");
            report.kept.push("control.while".into());
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

fn clicker_complexity_drops(cfg: &ClickerConfig) -> Vec<String> {
    let mut reasons = Vec::new();
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
    if !cfg.limits_enabled {
        reasons.push("unlimited run (need maxClicks or maxDuration)".into());
    } else if !matches!(
        cfg.limit_mode,
        LimitMode::Clicks | LimitMode::Time | LimitMode::Both
    ) {
        reasons.push("unsupported limitMode".into());
    }
    reasons
}

fn clicker_to_macro_actions(cfg: &ClickerConfig) -> (Vec<ActionNode>, ConvertReport) {
    let mut dropped = clicker_complexity_drops(cfg);
    if cfg.points_enabled && !cfg.points.is_empty() {
        let mut report = ConvertReport {
            kept: vec!["mouse.click".into(), "delay".into(), "points".into()],
            dropped: dropped.clone(),
            warnings: vec![format!(
                "Converted {} clicker point(s) to click+delay sequence",
                cfg.points.len()
            )],
        };
        if !dropped.is_empty() {
            report.warnings.push(
                "Clicker features beyond fixed clicks+delay are not converted".into(),
            );
        }
        let mut actions = Vec::new();
        for (i, p) in cfg.points.iter().enumerate() {
            let clicks = p.clicks.max(1);
            for c in 0..clicks {
                actions.push(ActionNode::MouseClick {
                    id: format!("p{i}c{c}"),
                    button: "left".into(),
                    x: Some(p.x),
                    y: Some(p.y),
                });
                if c + 1 < clicks {
                    let gap = if cfg.cps > 0.0 {
                        (1000.0 / cfg.cps).round().max(1.0) as u64
                    } else {
                        100
                    };
                    actions.push(ActionNode::Delay {
                        id: format!("p{i}d{c}"),
                        ms: gap,
                    });
                }
            }
            if p.pause_after_ms > 0 && i + 1 < cfg.points.len() {
                actions.push(ActionNode::Delay {
                    id: format!("p{i}pause"),
                    ms: p.pause_after_ms,
                });
            }
        }
        return (actions, report);
    }

    // Fixed / cursor burst path — reuse existing logic below via original body.
    let (actions, mut report) = clicker_to_macro_actions_burst(cfg);
    report.dropped.append(&mut dropped);
    if !report.dropped.is_empty() {
        report.warnings.push(
            "Clicker features beyond fixed clicks+delay are not converted".into(),
        );
    }
    (actions, report)
}

/// Burst conversion for non-points clicker.
fn clicker_to_macro_actions_burst(cfg: &ClickerConfig) -> (Vec<ActionNode>, ConvertReport) {
    let mut report = ConvertReport {
        kept: vec!["mouse.click".into(), "delay".into()],
        dropped: Vec::new(),
        warnings: Vec::new(),
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
    report
        .warnings
        .push(format!("Generated {clicks} click(s) at ~{interval_ms} ms"));
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
    convert_library_item_lang(
        config_dir,
        from_kind,
        id,
        to_kind,
        mode,
        ScriptLanguage::Javascript,
    )
}

/// Like [`convert_library_item`] with explicit target script language.
pub fn convert_library_item_lang(
    config_dir: &Path,
    from_kind: LibraryKind,
    id: &str,
    to_kind: LibraryKind,
    mode: ConvertMode,
    language: ScriptLanguage,
) -> Result<ConvertResult, ConvertError> {
    if from_kind == to_kind {
        return Err(ConvertError::Message("same kind".into()));
    }

    match (from_kind, to_kind) {
        (LibraryKind::Script, LibraryKind::Macro) => {
            script_to_macro(config_dir, id)
        }
        (LibraryKind::Macro, LibraryKind::Script) => {
            macro_to_script(config_dir, id, mode, language)
        }
        (LibraryKind::Clicker, LibraryKind::Macro) => {
            clicker_to_macro(config_dir, id)
        }
        (LibraryKind::Clicker, LibraryKind::Script) => {
            let mid = clicker_to_macro(config_dir, id)?;
            let r = macro_to_script(config_dir, &mid.new_id, mode, language)?;
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
        (LibraryKind::Macro, LibraryKind::Clicker) => macro_to_clicker(config_dir, id),
        (LibraryKind::Script, LibraryKind::Clicker) => {
            let mid = script_to_macro(config_dir, id)?;
            let r = match macro_to_clicker(config_dir, &mid.new_id) {
                Ok(r) => r,
                Err(_) => script_to_clicker_stub(config_dir, id)?,
            };
            let mut report = r.report;
            report.warnings.push(format!(
                "Intermediate macro « {} » was also created",
                mid.new_name
            ));
            Ok(ConvertResult {
                new_id: r.new_id,
                new_name: r.new_name,
                to_kind: "clicker".into(),
                report,
            })
        }
        _ => Err(ConvertError::Message("unsupported conversion".into())),
    }
}

/// When the intermediate macro is only a `script.run` wrap (no clicks), ship a stub clicker.
fn script_to_clicker_stub(
    config_dir: &Path,
    id: &str,
) -> Result<ConvertResult, ConvertError> {
    let doc = load_script(config_dir, id).map_err(|e| ConvertError::Message(e.to_string()))?;
    let folder = source_folder_id(config_dir, LibraryKind::Script, id)?;
    let name = unique_clicker_name(config_dir, &format!("{} (clicker)", doc.name))?;
    let mut cfg = ClickerConfig::default();
    cfg.mode = ClickMode::Toggle;
    cfg.input_kind = InputKind::Mouse;
    cfg.target = ClickTarget::CurrentCursor;
    cfg.cps = 5.0;
    cfg.interval_ms = 200.0;
    cfg.duty_cycle = 1.0;
    save_preset(config_dir, &name, &cfg).map_err(|e| ConvertError::Message(e.to_string()))?;
    assign_folder(config_dir, LibraryKind::Clicker, &name, folder)?;
    Ok(ConvertResult {
        new_id: name.clone(),
        new_name: name,
        to_kind: "clicker".into(),
        report: ConvertReport {
            kept: Vec::new(),
            dropped: vec!["script body".into()],
            warnings: vec![
                "Clicker stub: script body cannot be transcribed to clicks".into(),
            ],
        },
    })
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
    language: ScriptLanguage,
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
    let (
        mut source,
        report,
        allow_network,
        allow_clipboard,
        allow_macro,
        allow_input,
        allow_process,
    ) = if mode == ConvertMode::Wrap || !blockers.is_empty() {
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
            false,
            false,
        )
    } else {
        let mut src = String::from("// Transpiled from macro\n");
        let mut report = ConvertReport {
            kept: Vec::new(),
            dropped: Vec::new(),
            warnings: Vec::new(),
        };
        let mut allow_net = false;
        let mut allow_clip = false;
        let mut allow_inp = false;
        let mut allow_proc = false;
        let mut allow_mac = false;
        for a in &doc.actions {
            if action_tree_needs_network(a) {
                allow_net = true;
            }
            if action_tree_needs_clipboard(a) {
                allow_clip = true;
            }
            if action_tree_needs_input(a) {
                allow_inp = true;
            }
            if action_tree_needs_process(a) {
                allow_proc = true;
            }
            if action_tree_needs_macro_control(a) {
                allow_mac = true;
            }
            transpile_action(a, &mut src, &mut report);
        }
        (
            src,
            report,
            allow_net,
            allow_clip,
            allow_mac,
            allow_inp,
            allow_proc,
        )
    };

    if language == ScriptLanguage::Typescript && !source.trim_start().starts_with("// @ts") {
        source = format!("// @ts-check\n{source}");
    }

    let script = ScriptDoc {
        id: new_script_id(),
        name: name.clone(),
        source,
        language,
        is_module: false,
        allow_network,
        allow_clipboard,
        allow_fs: false,
        allow_macro_control: allow_macro,
        allow_input,
        allow_process,
        param_values: Default::default(),
        process_filter: Default::default(),
        local_process_filter: Default::default(),
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
    let folder = source_folder_id(config_dir, LibraryKind::Clicker, id)?;
    let name = unique_macro_name(config_dir, &format!("{} (macro)", preset.name))?;
    let (actions, report) = clicker_to_macro_actions(&preset.config);
    if actions.is_empty() {
        return Err(ConvertError::Message(
            "clicker→macro: no convertible clicks".into(),
        ));
    }
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

fn action_drop_label(action: &ActionNode) -> &'static str {
    match action {
        ActionNode::Delay { .. } => "orphan delay",
        ActionNode::KeyTap { .. } | ActionNode::KeyDown { .. } | ActionNode::KeyUp { .. } => {
            "keyboard"
        }
        ActionNode::MouseMove { .. }
        | ActionNode::MouseDown { .. }
        | ActionNode::MouseUp { .. }
        | ActionNode::MouseWheel { .. } => "mouse non-click",
        ActionNode::ControlIf { .. } => "control.if",
        ActionNode::ControlWhile { .. } => "control.while",
        ActionNode::ScriptRun { .. } => "script.run",
        ActionNode::ProcessRun { .. } => "process.run",
        ActionNode::MouseClick { .. } => "mouse.click",
        ActionNode::HttpRequest { .. } => "http",
        ActionNode::ClipboardSet { .. } | ActionNode::ClipboardGet { .. } => "clipboard",
        ActionNode::VarSet { .. } | ActionNode::JsonPath { .. } => "variables",
        _ => "unsupported",
    }
}

fn macro_to_clicker_config(
    actions: &[ActionNode],
) -> Result<(ClickerConfig, ConvertReport), ConvertError> {
    let mut clicks: Vec<(Option<i32>, Option<i32>)> = Vec::new();
    let mut delays: Vec<u64> = Vec::new();
    let mut dropped: Vec<String> = Vec::new();
    let mut i = 0;
    while i < actions.len() {
        match &actions[i] {
            ActionNode::MouseClick { button, x, y, .. } => {
                if button != "left" {
                    dropped.push(format!("mouse.click ({button})"));
                    i += 1;
                    continue;
                }
                clicks.push((*x, *y));
                if i + 1 < actions.len() {
                    if let ActionNode::Delay { ms, .. } = &actions[i + 1] {
                        delays.push(*ms);
                        i += 2;
                        continue;
                    }
                }
                i += 1;
            }
            ActionNode::Delay { .. } => {
                dropped.push("orphan delay".into());
                i += 1;
            }
            other => {
                let label = action_drop_label(other);
                if !dropped.iter().any(|d| d == label) {
                    dropped.push(label.into());
                }
                i += 1;
            }
        }
    }
    if clicks.is_empty() {
        return Err(ConvertError::Message(
            "macro→clicker: no mouse.click actions".into(),
        ));
    }

    // Prefer fixed clicks when mixed; drop the minority mode.
    let all_cursor = clicks.iter().all(|(x, y)| x.is_none() && y.is_none());
    let all_fixed = clicks.iter().all(|(x, y)| x.is_some() && y.is_some());
    let (clicks, delays) = if !all_cursor && !all_fixed {
        dropped.push("mixed cursor/fixed clicks".into());
        let fixed_n = clicks
            .iter()
            .filter(|(x, y)| x.is_some() && y.is_some())
            .count();
        let cursor_n = clicks.len() - fixed_n;
        let keep_fixed = fixed_n >= cursor_n;
        let mut next_clicks = Vec::new();
        let mut next_delays = Vec::new();
        for (idx, c) in clicks.iter().enumerate() {
            let is_fixed = c.0.is_some() && c.1.is_some();
            if is_fixed == keep_fixed {
                next_clicks.push(*c);
                if let Some(d) = delays.get(idx) {
                    next_delays.push(*d);
                }
            }
        }
        (next_clicks, next_delays)
    } else {
        (clicks, delays)
    };
    if clicks.is_empty() {
        return Err(ConvertError::Message(
            "macro→clicker: no usable mouse.click actions after filtering".into(),
        ));
    }
    let all_cursor = clicks.iter().all(|(x, y)| x.is_none() && y.is_none());
    let all_fixed = clicks.iter().all(|(x, y)| x.is_some() && y.is_some());

    let distinct: Vec<(i32, i32)> = if all_fixed {
        let mut seen = Vec::new();
        for (x, y) in &clicks {
            let pt = (x.unwrap(), y.unwrap());
            if !seen.contains(&pt) {
                seen.push(pt);
            }
        }
        seen
    } else {
        Vec::new()
    };

    // Multi-point sequence when fixed coords differ.
    if all_fixed && distinct.len() > 1 {
        let mut points = Vec::new();
        let mut idx = 0usize;
        while idx < clicks.len() {
            let (x, y) = (clicks[idx].0.unwrap(), clicks[idx].1.unwrap());
            let mut count = 1u32;
            while (idx + count as usize) < clicks.len() {
                let (nx, ny) = (
                    clicks[idx + count as usize].0.unwrap(),
                    clicks[idx + count as usize].1.unwrap(),
                );
                if nx == x && ny == y {
                    count += 1;
                } else {
                    break;
                }
            }
            let pause = delays
                .get(idx + count as usize - 1)
                .copied()
                .unwrap_or(0);
            let pause_after = if (idx + count as usize) < clicks.len() {
                pause
            } else {
                0
            };
            points.push(ClickPoint {
                x,
                y,
                clicks: count,
                radius: 0,
                pause_after_ms: pause_after,
            });
            idx += count as usize;
        }
        let mut cfg = ClickerConfig::default();
        cfg.points_enabled = true;
        cfg.points = points;
        cfg.click_zone_order = ClickZoneOrder::Sequence;
        cfg.mode = ClickMode::Toggle;
        cfg.input_kind = InputKind::Mouse;
        cfg.duty_cycle = 1.0;
        cfg.limits_enabled = true;
        cfg.limit_mode = LimitMode::Clicks;
        cfg.max_clicks = Some(clicks.len() as u64);
        cfg.cps = 10.0;
        cfg.interval_ms = 100.0;
        cfg.target = ClickTarget::Fixed {
            x: cfg.points[0].x,
            y: cfg.points[0].y,
        };
        let mut report = ConvertReport {
            kept: vec!["mouse.click".into(), "delay".into(), "points".into()],
            dropped,
            warnings: vec![format!(
                "Clicker preset: {} point sequence ({} click(s))",
                cfg.points.len(),
                clicks.len()
            )],
        };
        if !report.dropped.is_empty() {
            report.warnings.push(
                "Some macro actions were skipped during clicker conversion".into(),
            );
        }
        return Ok((cfg, report));
    }

    let first = clicks[0];
    let interval_ms = if delays.is_empty() {
        100
    } else {
        let sum: u64 = delays.iter().sum();
        (sum / delays.len() as u64).max(1)
    };
    let count = clicks.len() as u64;
    let cps = 1000.0 / (interval_ms as f64);
    let mut cfg = ClickerConfig::default();
    cfg.cps = cps;
    cfg.interval_ms = interval_ms as f64;
    cfg.limits_enabled = true;
    cfg.limit_mode = LimitMode::Clicks;
    cfg.max_clicks = Some(count);
    cfg.mode = ClickMode::Toggle;
    cfg.input_kind = InputKind::Mouse;
    cfg.duty_cycle = 1.0;
    cfg.target = match first {
        (Some(x), Some(y)) => ClickTarget::Fixed { x, y },
        _ => {
            let _ = all_cursor;
            ClickTarget::CurrentCursor
        }
    };
    let mut report = ConvertReport {
        kept: vec!["mouse.click".into(), "delay".into()],
        dropped,
        warnings: vec![format!(
            "Clicker preset: {count} click(s) @ ~{cps:.1} CPS ({interval_ms} ms)"
        )],
    };
    if !report.dropped.is_empty() {
        report.warnings.push(
            "Some macro actions were skipped during clicker conversion".into(),
        );
    }
    Ok((cfg, report))
}

fn macro_to_clicker(config_dir: &Path, id: &str) -> Result<ConvertResult, ConvertError> {
    let doc = load_macro(config_dir, id).map_err(|e| ConvertError::Message(e.to_string()))?;
    let (cfg, report) = macro_to_clicker_config(&doc.actions)?;
    let folder = source_folder_id(config_dir, LibraryKind::Macro, id)?;
    let name = unique_clicker_name(config_dir, &format!("{} (clicker)", doc.name))?;
    save_preset(config_dir, &name, &cfg).map_err(|e| ConvertError::Message(e.to_string()))?;
    assign_folder(config_dir, LibraryKind::Clicker, &name, folder)?;
    Ok(ConvertResult {
        new_id: name.clone(),
        new_name: name,
        to_kind: "clicker".into(),
        report,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_dir() -> std::path::PathBuf {
        use std::sync::atomic::{AtomicU64, Ordering};
        static N: AtomicU64 = AtomicU64::new(0);
        let n = N.fetch_add(1, Ordering::Relaxed);
        let p = std::env::temp_dir().join(format!(
            "caster-convert-{}-{}-{}",
            std::process::id(),
            new_script_id(),
            n
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
            language: Default::default(),
            is_module: false,
            allow_network: true,
            allow_clipboard: false,
            allow_fs: false,
            allow_macro_control: false,
            allow_input: false,
            allow_process: false,
            param_values: Default::default(),
            process_filter: Default::default(),
            local_process_filter: Default::default(),
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
        let id = m.name.clone();
        m.actions = vec![ActionNode::VarSet {
            id: "v1".into(),
            name: "n".into(),
            value: MacroValue::Number(1.0),
        }];
        save_macro(&dir, &id, &m).unwrap();
        let r = convert_library_item(
            &dir,
            LibraryKind::Macro,
            &id,
            LibraryKind::Script,
            ConvertMode::Transpile,
        )
        .unwrap();
        let s = load_script(&dir, &r.new_id).unwrap();
        assert!(s.source.contains("caster.set"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn macro_input_to_script_transpile() {
        let dir = temp_dir();
        let mut m = create_macro(&dir, Some("Click")).unwrap();
        let id = m.name.clone();
        m.actions = vec![
            ActionNode::MouseClick {
                id: "c1".into(),
                button: "left".into(),
                x: Some(10),
                y: Some(20),
            },
            ActionNode::Delay {
                id: "d1".into(),
                ms: 100,
            },
            ActionNode::KeyTap {
                id: "k1".into(),
                key: "A".into(),
                mods: crate::schema::KeyMods {
                    ctrl: false,
                    alt: false,
                    shift: true,
                },
            },
        ];
        save_macro(&dir, &id, &m).unwrap();
        let r = convert_library_item(
            &dir,
            LibraryKind::Macro,
            &id,
            LibraryKind::Script,
            ConvertMode::Transpile,
        )
        .unwrap();
        let s = load_script(&dir, &r.new_id).unwrap();
        assert!(s.source.contains("caster.click"));
        assert!(s.source.contains("caster.sleep(100)"));
        assert!(s.source.contains("caster.keyTap"));
        assert!(s.allow_input);
        assert!(!s.source.contains("runMacro"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn macro_if_click_to_script_transpile() {
        let dir = temp_dir();
        let mut m = create_macro(&dir, Some("IfClick")).unwrap();
        let id = m.name.clone();
        m.actions = vec![ActionNode::ControlIf {
            id: "if1".into(),
            condition: Condition {
                predicate: None,
                value: None,
                left: Operand::Var {
                    var: "ready".into(),
                },
                op: CompareOp::Eq,
                right: Operand::Literal(MacroValue::Bool(true)),
            },
            then: vec![
                ActionNode::MouseClick {
                    id: "c1".into(),
                    button: "left".into(),
                    x: Some(5),
                    y: Some(6),
                },
                ActionNode::Delay {
                    id: "d1".into(),
                    ms: 50,
                },
            ],
            else_branch: vec![],
        }];
        save_macro(&dir, &id, &m).unwrap();
        let r = convert_library_item(
            &dir,
            LibraryKind::Macro,
            &id,
            LibraryKind::Script,
            ConvertMode::Transpile,
        )
        .unwrap();
        let s = load_script(&dir, &r.new_id).unwrap();
        assert!(s.source.contains("if ("));
        assert!(s.source.contains("caster.get(\"ready\")"));
        assert!(s.source.contains("caster.click"));
        assert!(s.source.contains("caster.sleep(50)"));
        assert!(s.allow_input);
        assert!(!s.source.contains("runMacro"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn macro_trivial_to_clicker() {
        let dir = temp_dir();
        let mut m = create_macro(&dir, Some("Burst")).unwrap();
        let id = m.name.clone();
        m.actions = vec![
            ActionNode::MouseClick {
                id: "c0".into(),
                button: "left".into(),
                x: Some(100),
                y: Some(200),
            },
            ActionNode::Delay {
                id: "d0".into(),
                ms: 50,
            },
            ActionNode::MouseClick {
                id: "c1".into(),
                button: "left".into(),
                x: Some(100),
                y: Some(200),
            },
        ];
        save_macro(&dir, &id, &m).unwrap();
        let r = convert_library_item(
            &dir,
            LibraryKind::Macro,
            &id,
            LibraryKind::Clicker,
            ConvertMode::Wrap,
        )
        .unwrap();
        assert_eq!(r.to_kind, "clicker");
        let preset = load_preset(&dir, &r.new_id).unwrap();
        assert!(preset.config.limits_enabled);
        assert_eq!(preset.config.max_clicks, Some(2));
        assert!(matches!(
            preset.config.target,
            ClickTarget::Fixed { x: 100, y: 200 }
        ));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn macro_complex_to_clicker_skips_non_clicks() {
        let dir = temp_dir();
        let mut m = create_macro(&dir, Some("Mixed")).unwrap();
        let id = m.name.clone();
        m.actions = vec![
            ActionNode::KeyTap {
                id: "k1".into(),
                key: "A".into(),
                mods: crate::schema::KeyMods::default(),
            },
            ActionNode::MouseClick {
                id: "c1".into(),
                button: "left".into(),
                x: Some(10),
                y: Some(20),
            },
            ActionNode::Delay {
                id: "d1".into(),
                ms: 50,
            },
            ActionNode::MouseClick {
                id: "c2".into(),
                button: "left".into(),
                x: Some(10),
                y: Some(20),
            },
        ];
        save_macro(&dir, &id, &m).unwrap();
        let r = convert_library_item(
            &dir,
            LibraryKind::Macro,
            &id,
            LibraryKind::Clicker,
            ConvertMode::Wrap,
        )
        .unwrap();
        assert_eq!(r.to_kind, "clicker");
        assert!(r.report.dropped.iter().any(|d| d.contains("keyboard")));
        let preset = load_preset(&dir, &r.new_id).unwrap();
        assert_eq!(preset.config.max_clicks, Some(2));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn macro_only_non_clicks_still_refused() {
        let dir = temp_dir();
        let mut m = create_macro(&dir, Some("Complex")).unwrap();
        let id = m.name.clone();
        m.actions = vec![ActionNode::KeyTap {
            id: "k1".into(),
            key: "A".into(),
            mods: crate::schema::KeyMods::default(),
        }];
        save_macro(&dir, &id, &m).unwrap();
        let err = convert_library_item(
            &dir,
            LibraryKind::Macro,
            &id,
            LibraryKind::Clicker,
            ConvertMode::Wrap,
        )
        .unwrap_err();
        assert!(err.to_string().contains("macro→clicker"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn macro_cursor_clicks_to_clicker() {
        let dir = temp_dir();
        let mut m = create_macro(&dir, Some("CursorBurst")).unwrap();
        let id = m.name.clone();
        m.actions = vec![
            ActionNode::MouseClick {
                id: "c0".into(),
                button: "left".into(),
                x: None,
                y: None,
            },
            ActionNode::Delay {
                id: "d0".into(),
                ms: 100,
            },
            ActionNode::MouseClick {
                id: "c1".into(),
                button: "left".into(),
                x: None,
                y: None,
            },
        ];
        save_macro(&dir, &id, &m).unwrap();
        let r = convert_library_item(
            &dir,
            LibraryKind::Macro,
            &id,
            LibraryKind::Clicker,
            ConvertMode::Wrap,
        )
        .unwrap();
        let preset = load_preset(&dir, &r.new_id).unwrap();
        assert_eq!(preset.config.max_clicks, Some(2));
        assert!(matches!(
            preset.config.target,
            ClickTarget::CurrentCursor
        ));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn script_to_clicker_via_intermediate_macro() {
        let dir = temp_dir();
        let doc = ScriptDoc {
            id: "s1".into(),
            name: "Hello".into(),
            source: "caster.log('hi');".into(),
            language: Default::default(),
            is_module: false,
            allow_network: false,
            allow_clipboard: false,
            allow_fs: false,
            allow_macro_control: false,
            allow_input: false,
            allow_process: false,
            param_values: Default::default(),
            process_filter: Default::default(),
            local_process_filter: Default::default(),
        };
        save_script(&dir, &doc).unwrap();
        let r = convert_library_item(
            &dir,
            LibraryKind::Script,
            "s1",
            LibraryKind::Clicker,
            ConvertMode::Wrap,
        )
        .unwrap();
        assert_eq!(r.to_kind, "clicker");
        assert!(
            r.report
                .warnings
                .iter()
                .any(|w| w.contains("Intermediate macro")),
            "expected intermediate macro warning: {:?}",
            r.report.warnings
        );
        let _ = load_preset(&dir, &r.new_id).unwrap();
        let _ = fs::remove_dir_all(&dir);
    }
}
