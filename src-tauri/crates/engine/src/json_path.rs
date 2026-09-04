//! Simple dotted JSON path extraction for macro variables.

use serde_json::Value;

use crate::actions::registry::ActionError;
use crate::schema::MacroValue;

/// Resolve `a.b.0.c` against a JSON value.
pub fn value_at_path<'a>(root: &'a Value, path: &str) -> Result<&'a Value, ActionError> {
    let path = path.trim();
    if path.is_empty() {
        return Ok(root);
    }
    let mut cur = root;
    for seg in path.split('.') {
        if seg.is_empty() {
            continue;
        }
        cur = match cur {
            Value::Object(map) => map.get(seg).ok_or_else(|| {
                ActionError::Message(format!("json.path: missing key '{seg}'"))
            })?,
            Value::Array(arr) => {
                let idx: usize = seg.parse().map_err(|_| {
                    ActionError::Message(format!("json.path: expected array index, got '{seg}'"))
                })?;
                arr.get(idx).ok_or_else(|| {
                    ActionError::Message(format!("json.path: index {idx} out of range"))
                })?
            }
            _ => {
                return Err(ActionError::Message(format!(
                    "json.path: cannot traverse into {cur} at '{seg}'"
                )));
            }
        };
    }
    Ok(cur)
}

pub fn json_to_macro_value(v: &Value) -> MacroValue {
    match v {
        Value::Null => MacroValue::String(String::new()),
        Value::Bool(b) => MacroValue::Bool(*b),
        Value::Number(n) => MacroValue::Number(n.as_f64().unwrap_or(0.0)),
        Value::String(s) => MacroValue::String(s.clone()),
        other => MacroValue::String(other.to_string()),
    }
}

pub fn extract_path_from_string(source: &str, path: &str) -> Result<MacroValue, ActionError> {
    let root: Value = serde_json::from_str(source)
        .map_err(|e| ActionError::Message(format!("json.path: invalid JSON: {e}")))?;
    let v = value_at_path(&root, path)?;
    Ok(json_to_macro_value(v))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_nested_fields() {
        let v = extract_path_from_string(
            r#"{"user":{"name":"Ada"},"items":[{"id":7}]}"#,
            "user.name",
        )
        .unwrap();
        assert_eq!(v, MacroValue::String("Ada".into()));
        let id = extract_path_from_string(
            r#"{"items":[{"id":7}]}"#,
            "items.0.id",
        )
        .unwrap();
        assert_eq!(id, MacroValue::Number(7.0));
    }
}
