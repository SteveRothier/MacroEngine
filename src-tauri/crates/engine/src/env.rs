//! Runtime environment for macro variables and condition evaluation.

use std::collections::HashMap;

use crate::actions::registry::ActionError;
use crate::schema::{CompareOp, Condition, MacroValue, Operand};
use crate::settings::normalize_exe_name;

#[derive(Debug, Default, Clone)]
pub struct MacroEnv {
    vars: HashMap<String, MacroValue>,
    foreground_exe: Option<String>,
}

impl MacroEnv {
    pub fn new() -> Self {
        Self::default()
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
            let needle = cond.value.as_deref().unwrap_or("");
            let exe = normalize_exe_name(
                self.foreground_exe
                    .as_deref()
                    .unwrap_or(""),
            );
            return match pred {
                "process.eq" => Ok(exe == normalize_exe_name(needle)),
                "process.contains" => {
                    let n = normalize_exe_name(needle);
                    Ok(!n.is_empty() && exe.contains(&n))
                }
                other => Err(ActionError::Message(format!(
                    "unknown condition predicate: {other}"
                ))),
            };
        }
        let left = self.resolve(&cond.left)?;
        let right = self.resolve(&cond.right)?;
        compare(&left, cond.op, &right)
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
    }
}

fn values_equal(a: &MacroValue, b: &MacroValue) -> bool {
    match (a, b) {
        (MacroValue::Bool(x), MacroValue::Bool(y)) => x == y,
        (MacroValue::Number(x), MacroValue::Number(y)) => (x - y).abs() < f64::EPSILON,
        (MacroValue::String(x), MacroValue::String(y)) => x == y,
        (MacroValue::Number(x), MacroValue::String(y)) | (MacroValue::String(y), MacroValue::Number(x)) => {
            y.parse::<f64>()
                .map(|n| (n - x).abs() < f64::EPSILON)
                .unwrap_or(false)
        }
        _ => value_to_string(a) == value_to_string(b),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::schema::Operand;

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
        let cond = Condition {
            predicate: None,
            value: None,
            left: Operand::Var { var: "n".into() },
            op: CompareOp::Gt,
            right: Operand::Literal(MacroValue::Number(1.0)),
        };
        assert!(env.eval_condition(&cond).unwrap());
    }

    #[test]
    fn process_eq_matches_foreground() {
        let mut env = MacroEnv::new();
        env.set_foreground_exe(Some("C:\\Games\\Notepad.exe".into()));
        let cond = Condition {
            predicate: Some("process.eq".into()),
            value: Some("notepad.exe".into()),
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
            left: Operand::Literal(MacroValue::Bool(false)),
            op: CompareOp::Eq,
            right: Operand::Literal(MacroValue::Bool(false)),
        };
        assert!(env.eval_condition(&cond).unwrap());
    }
}
