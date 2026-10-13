//! Runtime environment for macro variables and condition evaluation.

use std::collections::HashMap;
use std::sync::Arc;

use crate::actions::registry::ActionError;
use crate::condition_probe::ConditionProbe;
use crate::schema::{CompareOp, Condition, MacroValue, Operand};
use crate::settings::normalize_exe_name;

#[derive(Default)]
pub struct MacroEnv {
    vars: HashMap<String, MacroValue>,
    foreground_exe: Option<String>,
    probe: Option<Arc<dyn ConditionProbe>>,
}

impl Clone for MacroEnv {
    fn clone(&self) -> Self {
        Self {
            vars: self.vars.clone(),
            foreground_exe: self.foreground_exe.clone(),
            probe: self.probe.clone(),
        }
    }
}

impl std::fmt::Debug for MacroEnv {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("MacroEnv")
            .field("vars", &self.vars)
            .field("foreground_exe", &self.foreground_exe)
            .field("probe", &self.probe.is_some())
            .finish()
    }
}

impl MacroEnv {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn set_probe(&mut self, probe: Option<Arc<dyn ConditionProbe>>) {
        self.probe = probe;
    }

    pub fn set_foreground_exe(&mut self, exe: Option<String>) {
        self.foreground_exe = exe;
    }

    pub fn set(&mut self, name: impl Into<String>, value: MacroValue) {
        self.vars.insert(name.into(), value);
    }

    pub fn get(&self, name: &str) -> Option<&MacroValue> {
        self.vars.get(name)
    }

    pub fn snapshot(&self) -> Vec<(String, MacroValue)> {
        self.vars
            .iter()
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect()
    }

    pub fn resolve(&self, op: &Operand) -> Result<MacroValue, ActionError> {
        match op {
            Operand::Literal(v) => Ok(v.clone()),
            Operand::Var { var } => self
                .get(var)
                .cloned()
                .ok_or_else(|| ActionError::Message(format!("undefined variable: {var}"))),
        }
    }

    pub fn eval_condition(&self, cond: &Condition) -> Result<bool, ActionError> {
        if let Some(pred) = cond.predicate.as_deref() {
            return self.eval_predicate(pred, cond);
        }
        let left = self.resolve(&cond.left)?;
        if matches!(cond.op, CompareOp::Empty) {
            return Ok(value_to_string(&left).trim().is_empty());
        }
        let right = self.resolve(&cond.right)?;
        compare(&left, cond.op, &right)
    }

    fn eval_predicate(&self, pred: &str, cond: &Condition) -> Result<bool, ActionError> {
        let params = cond.params.as_ref();
        match pred {
            "process.eq" => {
                let needle = cond.value.as_deref().unwrap_or("");
                let exe = normalize_exe_name(self.current_foreground_exe().as_deref().unwrap_or(""));
                Ok(exe == normalize_exe_name(needle))
            }
            "process.contains" => {
                let needle = normalize_exe_name(cond.value.as_deref().unwrap_or(""));
                let exe = normalize_exe_name(self.current_foreground_exe().as_deref().unwrap_or(""));
                Ok(!needle.is_empty() && exe.contains(&needle))
            }
            "process.running" => {
                let needle = cond
                    .value
                    .as_deref()
                    .or_else(|| params.and_then(|p| p.get("exe").and_then(|v| v.as_str())))
                    .unwrap_or("");
                let needle = normalize_exe_name(needle);
                if needle.is_empty() {
                    return Ok(false);
                }
                Ok(self
                    .probe
                    .as_ref()
                    .map(|p| p.is_process_running(&needle))
                    .unwrap_or(false))
            }
            "window.title.eq" | "window.title.contains" => {
                let needle = cond.value.as_deref().unwrap_or("").trim();
                let title = self
                    .probe
                    .as_ref()
                    .and_then(|p| p.foreground_title())
                    .unwrap_or_default();
                if let Some(exe_filter) = params
                    .and_then(|p| p.get("exe").and_then(|v| v.as_str()))
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                {
                    let fg = normalize_exe_name(
                        self.current_foreground_exe().as_deref().unwrap_or(""),
                    );
                    if fg != normalize_exe_name(exe_filter) {
                        return Ok(false);
                    }
                }
                if pred.ends_with(".eq") {
                    Ok(title.eq_ignore_ascii_case(needle))
                } else {
                    Ok(!needle.is_empty()
                        && title.to_ascii_lowercase().contains(&needle.to_ascii_lowercase()))
                }
            }
            "pixel.color" => self.eval_pixel_color(params),
            "mouse.inRect" => self.eval_mouse_in_rect(params),
            "mouse.button.down" => self.eval_mouse_button_down(params),
            "key.down" => self.eval_key_down(params),
            "time.compare" => self.eval_time_compare(params),
            "clipboard.eq" | "clipboard.contains" | "clipboard.empty" => {
                self.eval_clipboard(pred, cond)
            }
            "var.defined" => {
                let name = cond
                    .value
                    .as_deref()
                    .or_else(|| params.and_then(|p| p.get("name").and_then(|v| v.as_str())))
                    .unwrap_or("")
                    .trim();
                if name.is_empty() {
                    return Ok(false);
                }
                Ok(self.get(name).is_some())
            }
            other => Err(ActionError::Message(format!(
                "unknown condition predicate: {other}"
            ))),
        }
    }

    fn current_foreground_exe(&self) -> Option<String> {
        self.foreground_exe
            .clone()
            .or_else(|| self.probe.as_ref().and_then(|p| p.foreground_exe()))
    }

    fn eval_pixel_color(&self, params: Option<&serde_json::Value>) -> Result<bool, ActionError> {
        let p = params.ok_or_else(|| {
            ActionError::Message("pixel.color: params manquants".into())
        })?;
        let x = json_i32(p, "x")?;
        let y = json_i32(p, "y")?;
        let tolerance = p
            .get("tolerance")
            .and_then(|v| v.as_u64())
            .unwrap_or(10)
            .min(255) as u8;
        let expected = parse_color(p.get("color"))?;
        let Some(probe) = self.probe.as_ref() else {
            return Err(ActionError::Message(
                "pixel.color: probe indisponible".into(),
            ));
        };
        let Some((r, g, b)) = probe.pixel_rgb(x, y) else {
            return Ok(false);
        };
        let dr = r.abs_diff(expected.0);
        let dg = g.abs_diff(expected.1);
        let db = b.abs_diff(expected.2);
        Ok(dr <= tolerance && dg <= tolerance && db <= tolerance)
    }

    fn eval_mouse_in_rect(&self, params: Option<&serde_json::Value>) -> Result<bool, ActionError> {
        let p = params.ok_or_else(|| {
            ActionError::Message("mouse.inRect: params manquants".into())
        })?;
        let x1 = json_i32(p, "x1")?;
        let y1 = json_i32(p, "y1")?;
        let x2 = json_i32(p, "x2")?;
        let y2 = json_i32(p, "y2")?;
        let (min_x, max_x) = if x1 <= x2 { (x1, x2) } else { (x2, x1) };
        let (min_y, max_y) = if y1 <= y2 { (y1, y2) } else { (y2, y1) };
        let Some((cx, cy)) = self.probe.as_ref().and_then(|pr| pr.cursor_xy()) else {
            return Ok(false);
        };
        Ok(cx >= min_x && cx <= max_x && cy >= min_y && cy <= max_y)
    }

    fn eval_mouse_button_down(
        &self,
        params: Option<&serde_json::Value>,
    ) -> Result<bool, ActionError> {
        let button = params
            .and_then(|p| p.get("button").and_then(|v| v.as_str()))
            .unwrap_or("left")
            .trim();
        Ok(self
            .probe
            .as_ref()
            .map(|pr| pr.is_mouse_button_down(button))
            .unwrap_or(false))
    }

    fn eval_clipboard(&self, pred: &str, cond: &Condition) -> Result<bool, ActionError> {
        let text = self
            .probe
            .as_ref()
            .and_then(|pr| pr.clipboard_text())
            .unwrap_or_default();
        match pred {
            "clipboard.empty" => Ok(text.trim().is_empty()),
            "clipboard.eq" => {
                let needle = cond.value.as_deref().unwrap_or("");
                Ok(text == needle)
            }
            "clipboard.contains" => {
                let needle = cond.value.as_deref().unwrap_or("");
                Ok(!needle.is_empty() && text.contains(needle))
            }
            _ => Ok(false),
        }
    }

    fn eval_key_down(&self, params: Option<&serde_json::Value>) -> Result<bool, ActionError> {
        let p = params.ok_or_else(|| {
            ActionError::Message("key.down: params manquants".into())
        })?;
        let key = p
            .get("key")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim();
        if key.is_empty() {
            return Ok(false);
        }
        let Some(probe) = self.probe.as_ref() else {
            return Ok(false);
        };
        if !probe.is_key_down(key) {
            return Ok(false);
        }
        let mods = p.get("mods");
        let need_ctrl = mods
            .and_then(|m| m.get("ctrl"))
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let need_alt = mods
            .and_then(|m| m.get("alt"))
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let need_shift = mods
            .and_then(|m| m.get("shift"))
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        if need_ctrl && !probe.is_mod_down("ctrl") {
            return Ok(false);
        }
        if need_alt && !probe.is_mod_down("alt") {
            return Ok(false);
        }
        if need_shift && !probe.is_mod_down("shift") {
            return Ok(false);
        }
        Ok(true)
    }

    fn eval_time_compare(&self, params: Option<&serde_json::Value>) -> Result<bool, ActionError> {
        let p = params.ok_or_else(|| {
            ActionError::Message("time.compare: params manquants".into())
        })?;
        let unit = p
            .get("unit")
            .and_then(|v| v.as_str())
            .unwrap_or("hour");
        let op = parse_compare_op(
            p.get("op")
                .and_then(|v| v.as_str())
                .unwrap_or("eq"),
        )?;
        let expected = p
            .get("value")
            .and_then(|v| {
                v.as_f64()
                    .or_else(|| v.as_i64().map(|n| n as f64))
                    .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
            })
            .ok_or_else(|| ActionError::Message("time.compare: value manquant".into()))?;
        let clock = self
            .probe
            .as_ref()
            .map(|pr| pr.local_clock())
            .unwrap_or_default();
        let actual = match unit {
            "hour" => clock.hour as f64,
            "minute" => clock.minute as f64,
            "weekday" => clock.weekday as f64,
            "day" => clock.day as f64,
            "month" => clock.month as f64,
            "year" => clock.year as f64,
            other => {
                return Err(ActionError::Message(format!(
                    "time.compare: unit inconnue '{other}'"
                )))
            }
        };
        compare(
            &MacroValue::Number(actual),
            op,
            &MacroValue::Number(expected),
        )
    }

    /// Replace `{{name}}` placeholders with stringified variable values.
    pub fn interpolate(&self, input: &str) -> String {
        let mut out = input.to_string();
        for (name, value) in &self.vars {
            let needle = format!("{{{{{name}}}}}");
            if out.contains(&needle) {
                out = out.replace(&needle, &value_to_string(value));
            }
        }
        out
    }
}

fn json_i32(obj: &serde_json::Value, key: &str) -> Result<i32, ActionError> {
    obj.get(key)
        .and_then(|v| {
            v.as_i64()
                .map(|n| n as i32)
                .or_else(|| v.as_f64().map(|n| n as i32))
                .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
        })
        .ok_or_else(|| ActionError::Message(format!("params.{key} manquant")))
}

fn parse_color(v: Option<&serde_json::Value>) -> Result<(u8, u8, u8), ActionError> {
    let Some(v) = v else {
        return Err(ActionError::Message("pixel.color: color manquant".into()));
    };
    if let Some(s) = v.as_str() {
        return parse_hex_color(s);
    }
    if let Some(obj) = v.as_object() {
        let r = obj.get("r").and_then(|x| x.as_u64()).unwrap_or(0) as u8;
        let g = obj.get("g").and_then(|x| x.as_u64()).unwrap_or(0) as u8;
        let b = obj.get("b").and_then(|x| x.as_u64()).unwrap_or(0) as u8;
        return Ok((r, g, b));
    }
    Err(ActionError::Message(
        "pixel.color: color invalide (attendu #RRGGBB)".into(),
    ))
}

fn parse_hex_color(raw: &str) -> Result<(u8, u8, u8), ActionError> {
    let s = raw.trim().trim_start_matches('#');
    if s.len() != 6 {
        return Err(ActionError::Message(format!(
            "pixel.color: couleur invalide '{raw}'"
        )));
    }
    let r = u8::from_str_radix(&s[0..2], 16).map_err(|_| {
        ActionError::Message(format!("pixel.color: couleur invalide '{raw}'"))
    })?;
    let g = u8::from_str_radix(&s[2..4], 16).map_err(|_| {
        ActionError::Message(format!("pixel.color: couleur invalide '{raw}'"))
    })?;
    let b = u8::from_str_radix(&s[4..6], 16).map_err(|_| {
        ActionError::Message(format!("pixel.color: couleur invalide '{raw}'"))
    })?;
    Ok((r, g, b))
}

fn parse_compare_op(raw: &str) -> Result<CompareOp, ActionError> {
    match raw {
        "eq" => Ok(CompareOp::Eq),
        "ne" => Ok(CompareOp::Ne),
        "gt" => Ok(CompareOp::Gt),
        "lt" => Ok(CompareOp::Lt),
        "gte" => Ok(CompareOp::Gte),
        "lte" => Ok(CompareOp::Lte),
        "contains" => Ok(CompareOp::Contains),
        "startsWith" => Ok(CompareOp::StartsWith),
        "endsWith" => Ok(CompareOp::EndsWith),
        "empty" => Ok(CompareOp::Empty),
        other => Err(ActionError::Message(format!(
            "time.compare: op inconnue '{other}'"
        ))),
    }
}

fn value_to_string(v: &MacroValue) -> String {
    match v {
        MacroValue::Bool(b) => b.to_string(),
        MacroValue::Number(n) => {
            if n.fract() == 0.0 && n.abs() < 1e15 {
                format!("{}", *n as i64)
            } else {
                n.to_string()
            }
        }
        MacroValue::String(s) => s.clone(),
    }
}

pub fn value_to_string_pub(v: &MacroValue) -> String {
    value_to_string(v)
}

fn as_number(v: &MacroValue) -> Option<f64> {
    match v {
        MacroValue::Number(n) => Some(*n),
        MacroValue::Bool(b) => Some(if *b { 1.0 } else { 0.0 }),
        MacroValue::String(s) => s.parse().ok(),
    }
}

fn compare(left: &MacroValue, op: CompareOp, right: &MacroValue) -> Result<bool, ActionError> {
    match op {
        CompareOp::Eq => Ok(values_equal(left, right)),
        CompareOp::Ne => Ok(!values_equal(left, right)),
        CompareOp::Gt | CompareOp::Lt | CompareOp::Gte | CompareOp::Lte => {
            let l = as_number(left).ok_or_else(|| {
                ActionError::Message("numeric comparison requires numbers".into())
            })?;
            let r = as_number(right).ok_or_else(|| {
                ActionError::Message("numeric comparison requires numbers".into())
            })?;
            Ok(match op {
                CompareOp::Gt => l > r,
                CompareOp::Lt => l < r,
                CompareOp::Gte => l >= r,
                CompareOp::Lte => l <= r,
                _ => unreachable!(),
            })
        }
        CompareOp::Contains => {
            let l = value_to_string(left);
            let r = value_to_string(right);
            Ok(!r.is_empty() && l.contains(&r))
        }
        CompareOp::StartsWith => {
            let l = value_to_string(left);
            let r = value_to_string(right);
            Ok(l.starts_with(&r))
        }
        CompareOp::EndsWith => {
            let l = value_to_string(left);
            let r = value_to_string(right);
            Ok(l.ends_with(&r))
        }
        CompareOp::Empty => Ok(value_to_string(left).trim().is_empty()),
    }
}

fn values_equal(a: &MacroValue, b: &MacroValue) -> bool {
    match (a, b) {
        (MacroValue::Bool(x), MacroValue::Bool(y)) => x == y,
        (MacroValue::Number(x), MacroValue::Number(y)) => (x - y).abs() < f64::EPSILON,
        (MacroValue::String(x), MacroValue::String(y)) => x == y,
        (MacroValue::Number(x), MacroValue::String(y))
        | (MacroValue::String(y), MacroValue::Number(x)) => y
            .parse::<f64>()
            .map(|n| (n - x).abs() < f64::EPSILON)
            .unwrap_or(false),
        _ => value_to_string(a) == value_to_string(b),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::condition_probe::MockConditionProbe;
    use crate::schema::Operand;
    use serde_json::json;

    fn cond_compare(left: Operand, op: CompareOp, right: Operand) -> Condition {
        Condition {
            predicate: None,
            value: None,
            params: None,
            left,
            op,
            right,
        }
    }

    #[test]
    fn interpolate_replaces_vars() {
        let mut env = MacroEnv::new();
        env.set("x", MacroValue::String("hello".into()));
        env.set("n", MacroValue::Number(3.0));
        assert_eq!(env.interpolate("{{x}}-{{n}}"), "hello-3");
    }

    #[test]
    fn eval_gt() {
        let mut env = MacroEnv::new();
        env.set("n", MacroValue::Number(2.0));
        assert!(env
            .eval_condition(&cond_compare(
                Operand::Var { var: "n".into() },
                CompareOp::Gt,
                Operand::Literal(MacroValue::Number(1.0)),
            ))
            .unwrap());
    }

    #[test]
    fn eval_string_ops() {
        let mut env = MacroEnv::new();
        env.set("msg", MacroValue::String("hello world".into()));
        assert!(env
            .eval_condition(&cond_compare(
                Operand::Var { var: "msg".into() },
                CompareOp::Contains,
                Operand::Literal(MacroValue::String("lo w".into())),
            ))
            .unwrap());
        assert!(env
            .eval_condition(&cond_compare(
                Operand::Var { var: "msg".into() },
                CompareOp::StartsWith,
                Operand::Literal(MacroValue::String("hello".into())),
            ))
            .unwrap());
        assert!(env
            .eval_condition(&cond_compare(
                Operand::Var { var: "msg".into() },
                CompareOp::EndsWith,
                Operand::Literal(MacroValue::String("world".into())),
            ))
            .unwrap());
        env.set("empty", MacroValue::String("  ".into()));
        assert!(env
            .eval_condition(&cond_compare(
                Operand::Var {
                    var: "empty".into()
                },
                CompareOp::Empty,
                Operand::Literal(MacroValue::String("".into())),
            ))
            .unwrap());
    }

    #[test]
    fn process_eq_matches_foreground() {
        let mut env = MacroEnv::new();
        env.set_foreground_exe(Some("C:\\Games\\Notepad.exe".into()));
        let cond = Condition {
            predicate: Some("process.eq".into()),
            value: Some("notepad.exe".into()),
            params: None,
            left: Operand::Literal(MacroValue::Bool(false)),
            op: CompareOp::Eq,
            right: Operand::Literal(MacroValue::Bool(false)),
        };
        assert!(env.eval_condition(&cond).unwrap());
    }

    #[test]
    fn process_contains_substring() {
        let mut env = MacroEnv::new();
        env.set_foreground_exe(Some("game_x64.exe".into()));
        let cond = Condition {
            predicate: Some("process.contains".into()),
            value: Some("game".into()),
            params: None,
            left: Operand::Literal(MacroValue::Bool(false)),
            op: CompareOp::Eq,
            right: Operand::Literal(MacroValue::Bool(false)),
        };
        assert!(env.eval_condition(&cond).unwrap());
    }

    #[test]
    fn process_running_via_probe() {
        let mut env = MacroEnv::new();
        env.set_probe(Some(Arc::new(MockConditionProbe {
            running: vec!["chrome.exe".into()],
            ..Default::default()
        })));
        let cond = Condition {
            predicate: Some("process.running".into()),
            value: Some("chrome.exe".into()),
            params: None,
            left: Operand::default(),
            op: CompareOp::Eq,
            right: Operand::default(),
        };
        assert!(env.eval_condition(&cond).unwrap());
    }

    #[test]
    fn window_title_contains() {
        let mut env = MacroEnv::new();
        env.set_probe(Some(Arc::new(MockConditionProbe {
            foreground_title: Some("Document - Notepad".into()),
            foreground_exe: Some("notepad.exe".into()),
            ..Default::default()
        })));
        let cond = Condition {
            predicate: Some("window.title.contains".into()),
            value: Some("notepad".into()),
            params: None,
            left: Operand::default(),
            op: CompareOp::Eq,
            right: Operand::default(),
        };
        assert!(env.eval_condition(&cond).unwrap());
    }

    #[test]
    fn pixel_color_tolerance() {
        let mut env = MacroEnv::new();
        env.set_probe(Some(Arc::new(MockConditionProbe {
            pixel: Some((255, 0, 0)),
            ..Default::default()
        })));
        let cond = Condition {
            predicate: Some("pixel.color".into()),
            value: None,
            params: Some(json!({
                "x": 10,
                "y": 20,
                "color": "#fe0000",
                "tolerance": 5
            })),
            left: Operand::default(),
            op: CompareOp::Eq,
            right: Operand::default(),
        };
        assert!(env.eval_condition(&cond).unwrap());
    }

    #[test]
    fn mouse_in_rect() {
        let mut env = MacroEnv::new();
        env.set_probe(Some(Arc::new(MockConditionProbe {
            cursor: Some((50, 60)),
            ..Default::default()
        })));
        let cond = Condition {
            predicate: Some("mouse.inRect".into()),
            value: None,
            params: Some(json!({ "x1": 0, "y1": 0, "x2": 100, "y2": 100 })),
            left: Operand::default(),
            op: CompareOp::Eq,
            right: Operand::default(),
        };
        assert!(env.eval_condition(&cond).unwrap());
    }

    #[test]
    fn key_down_with_mods() {
        let mut env = MacroEnv::new();
        env.set_probe(Some(Arc::new(MockConditionProbe {
            keys_down: vec!["F1".into(), "CTRL".into()],
            ..Default::default()
        })));
        let cond = Condition {
            predicate: Some("key.down".into()),
            value: None,
            params: Some(json!({ "key": "F1", "mods": { "ctrl": true } })),
            left: Operand::default(),
            op: CompareOp::Eq,
            right: Operand::default(),
        };
        assert!(env.eval_condition(&cond).unwrap());
    }

    #[test]
    fn time_compare_hour() {
        let mut env = MacroEnv::new();
        env.set_probe(Some(Arc::new(MockConditionProbe {
            clock: crate::condition_probe::LocalClock {
                hour: 14,
                minute: 30,
                weekday: 3,
                day: 12,
                month: 10,
                year: 2026,
            },
            ..Default::default()
        })));
        let cond = Condition {
            predicate: Some("time.compare".into()),
            value: None,
            params: Some(json!({ "unit": "hour", "op": "gte", "value": 14 })),
            left: Operand::default(),
            op: CompareOp::Eq,
            right: Operand::default(),
        };
        assert!(env.eval_condition(&cond).unwrap());
    }

    #[test]
    fn time_compare_month_year() {
        let mut env = MacroEnv::new();
        env.set_probe(Some(Arc::new(MockConditionProbe {
            clock: crate::condition_probe::LocalClock {
                hour: 0,
                minute: 0,
                weekday: 1,
                day: 15,
                month: 10,
                year: 2026,
            },
            ..Default::default()
        })));
        assert!(env
            .eval_condition(&Condition {
                predicate: Some("time.compare".into()),
                value: None,
                params: Some(json!({ "unit": "month", "op": "eq", "value": 10 })),
                left: Operand::default(),
                op: CompareOp::Eq,
                right: Operand::default(),
            })
            .unwrap());
        assert!(env
            .eval_condition(&Condition {
                predicate: Some("time.compare".into()),
                value: None,
                params: Some(json!({ "unit": "year", "op": "gte", "value": 2026 })),
                left: Operand::default(),
                op: CompareOp::Eq,
                right: Operand::default(),
            })
            .unwrap());
    }

    #[test]
    fn clipboard_and_var_defined() {
        let mut env = MacroEnv::new();
        env.set("score", MacroValue::Number(1.0));
        env.set_probe(Some(Arc::new(MockConditionProbe {
            clipboard: Some("hello world".into()),
            ..Default::default()
        })));
        assert!(env
            .eval_condition(&Condition {
                predicate: Some("clipboard.contains".into()),
                value: Some("world".into()),
                params: None,
                left: Operand::default(),
                op: CompareOp::Eq,
                right: Operand::default(),
            })
            .unwrap());
        assert!(env
            .eval_condition(&Condition {
                predicate: Some("var.defined".into()),
                value: Some("score".into()),
                params: None,
                left: Operand::default(),
                op: CompareOp::Eq,
                right: Operand::default(),
            })
            .unwrap());
        assert!(!env
            .eval_condition(&Condition {
                predicate: Some("var.defined".into()),
                value: Some("missing".into()),
                params: None,
                left: Operand::default(),
                op: CompareOp::Eq,
                right: Operand::default(),
            })
            .unwrap());
    }

    #[test]
    fn mouse_button_down() {
        let mut env = MacroEnv::new();
        env.set_probe(Some(Arc::new(MockConditionProbe {
            mouse_buttons_down: vec!["right".into()],
            ..Default::default()
        })));
        assert!(env
            .eval_condition(&Condition {
                predicate: Some("mouse.button.down".into()),
                value: None,
                params: Some(json!({ "button": "right" })),
                left: Operand::default(),
                op: CompareOp::Eq,
                right: Operand::default(),
            })
            .unwrap());
    }
}
