use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MacroDocument {
    pub schema_version: u32,
    pub name: String,
    pub trigger: Trigger,
    pub actions: Vec<ActionNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Trigger {
    Hotkey { key: String },
    Manual,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type")]
pub enum ActionNode {
    #[serde(rename = "mouse.click")]
    MouseClick {
        id: String,
        #[serde(default = "default_button")]
        button: String,
    },
    #[serde(rename = "delay")]
    Delay {
        id: String,
        ms: u64,
    },
}

fn default_button() -> String {
    "left".into()
}

#[derive(Debug, Error)]
pub enum SchemaError {
    #[error("unsupported schemaVersion: {0}")]
    UnsupportedVersion(u32),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
}

pub fn parse_macro_json(json: &str) -> Result<MacroDocument, SchemaError> {
    let doc: MacroDocument = serde_json::from_str(json)?;
    if doc.schema_version != 1 {
        return Err(SchemaError::UnsupportedVersion(doc.schema_version));
    }
    Ok(doc)
}

#[cfg(test)]
mod tests {
    use super::*;

    const EXAMPLE: &str = r#"{
      "schemaVersion": 1,
      "name": "Example",
      "trigger": { "type": "hotkey", "key": "F6" },
      "actions": [
        { "id": "a1", "type": "mouse.click", "button": "left" },
        { "id": "a2", "type": "delay", "ms": 100 }
      ]
    }"#;

    #[test]
    fn parses_minimal_example() {
        let doc = parse_macro_json(EXAMPLE).unwrap();
        assert_eq!(doc.schema_version, 1);
        assert_eq!(doc.name, "Example");
        assert_eq!(doc.actions.len(), 2);
        assert!(matches!(
            &doc.actions[0],
            ActionNode::MouseClick { id, button } if id == "a1" && button == "left"
        ));
        assert!(matches!(
            &doc.actions[1],
            ActionNode::Delay { id, ms: 100 } if id == "a2"
        ));
    }

    #[test]
    fn rejects_unknown_schema_version() {
        let json = r#"{
          "schemaVersion": 99,
          "name": "X",
          "trigger": { "type": "manual" },
          "actions": []
        }"#;
        let err = parse_macro_json(json).unwrap_err();
        assert!(matches!(err, SchemaError::UnsupportedVersion(99)));
    }
}
