//! Parse `//@param name type [default]` from script source.

use serde::{Deserialize, Serialize};

use crate::schema::MacroValue;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ScriptParamDef {
    pub name: String,
    /// "number" | "string" | "boolean"
    #[serde(rename = "type")]
    pub param_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default: Option<MacroValue>,
}

/// Parse lines like `//@param clicks number 10`, `// @param label string hello`,
/// or Python `#@param` / `# @param`.
pub fn parse_param_defs(source: &str) -> Vec<ScriptParamDef> {
    let mut out = Vec::new();
    for line in source.lines() {
        let trimmed = line.trim();
        let rest = if let Some(r) = trimmed.strip_prefix("//@param") {
            r
        } else if let Some(r) = trimmed.strip_prefix("// @param") {
            r
        } else if let Some(r) = trimmed.strip_prefix("#@param") {
            r
        } else if let Some(r) = trimmed.strip_prefix("# @param") {
            r
        } else {
            continue;
        };
        let rest = rest.trim();
        let mut parts = rest.splitn(3, char::is_whitespace).filter(|s| !s.is_empty());
        let Some(name) = parts.next() else { continue };
        let Some(ty) = parts.next() else { continue };
        let ty = ty.to_ascii_lowercase();
        if ty != "number" && ty != "string" && ty != "boolean" {
            continue;
        }
        let default = parts.next().map(|raw| parse_default(&ty, raw.trim()));
        out.push(ScriptParamDef {
            name: name.to_string(),
            param_type: ty,
            default,
        });
    }
    out
}

fn parse_default(ty: &str, raw: &str) -> MacroValue {
    match ty {
        "boolean" => MacroValue::Bool(raw.eq_ignore_ascii_case("true") || raw == "1"),
        "number" => MacroValue::Number(raw.parse::<f64>().unwrap_or(0.0)),
        _ => MacroValue::String(raw.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_param_lines() {
        let src = r#"
//@param clicks number 10
// @param label string hi
//@param enabled boolean true
#@param pycount number 3
# @param pylabel string hello
caster.log('x');
"#;
        let defs = parse_param_defs(src);
        assert_eq!(defs.len(), 5);
        assert_eq!(defs[0].name, "clicks");
        assert_eq!(defs[0].default, Some(MacroValue::Number(10.0)));
        assert_eq!(defs[1].default, Some(MacroValue::String("hi".into())));
        assert_eq!(defs[2].default, Some(MacroValue::Bool(true)));
        assert_eq!(defs[3].name, "pycount");
        assert_eq!(defs[3].default, Some(MacroValue::Number(3.0)));
        assert_eq!(defs[4].default, Some(MacroValue::String("hello".into())));
    }
}
