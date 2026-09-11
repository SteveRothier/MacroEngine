use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::settings::ProcessFilter;

/// Current document format (json.path, http failOnStatus, script.run).
pub const SCHEMA_VERSION_CURRENT: u32 = 8;
pub const SCHEMA_VERSION_V8: u32 = 8;
pub const SCHEMA_VERSION_V6: u32 = 6;
pub const SCHEMA_VERSION_V7: u32 = 7;
pub const SCHEMA_VERSION_V5: u32 = 5;
pub const SCHEMA_VERSION_V4: u32 = 4;
pub const SCHEMA_VERSION_V3: u32 = 3;
pub const SCHEMA_VERSION_V2: u32 = 2;
pub const SCHEMA_VERSION_V1: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MacroDocument {
    pub schema_version: u32,
    pub name: String,
    pub trigger: Trigger,
    /// How many times to run the action list. `0` = until cancelled.
    #[serde(default = "default_repeat")]
    pub repeat_count: u32,
    /// Per-macro override of the global process filter from settings.
    #[serde(default, rename = "processFilter")]
    pub process_filter: MacroProcessFilterMode,
    #[serde(default, rename = "localProcessFilter")]
    pub local_process_filter: ProcessFilter,
    pub actions: Vec<ActionNode>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum MacroProcessFilterMode {
    #[default]
    Inherit,
    Off,
    Local,
}

fn default_repeat() -> u32 {
    1
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct KeyMods {
    #[serde(default)]
    pub ctrl: bool,
    #[serde(default)]
    pub alt: bool,
    #[serde(default)]
    pub shift: bool,
}

impl KeyMods {
    pub fn any(self) -> bool {
        self.ctrl || self.alt || self.shift
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Trigger {
    Hotkey {
        key: String,
        #[serde(default)]
        mods: KeyMods,
    },
    Manual,
}

/// Scalar value stored in the macro environment.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(untagged)]
pub enum MacroValue {
    Bool(bool),
    Number(f64),
    String(String),
}

/// Left/right side of a condition: literal or `{ "var": "name" }`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(untagged)]
pub enum Operand {
    Var { var: String },
    Literal(MacroValue),
}

impl Default for Operand {
    fn default() -> Self {
        Self::Literal(MacroValue::Number(0.0))
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum CompareOp {
    #[default]
    Eq,
    Ne,
    Gt,
    Lt,
    Gte,
    Lte,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Condition {
    /// When set (`process.eq`, `process.contains`), `left`/`op`/`right` are ignored.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub predicate: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value: Option<String>,
    #[serde(default)]
    pub left: Operand,
    #[serde(default)]
    pub op: CompareOp,
    #[serde(default)]
    pub right: Operand,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HttpHeader {
    pub name: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type")]
pub enum ActionNode {
    #[serde(rename = "mouse.click")]
    MouseClick {
        id: String,
        #[serde(default = "default_button")]
        button: String,
        #[serde(default)]
        x: Option<i32>,
        #[serde(default)]
        y: Option<i32>,
    },
    #[serde(rename = "mouse.move")]
    MouseMove { id: String, x: i32, y: i32 },
    #[serde(rename = "mouse.down")]
    MouseDown {
        id: String,
        #[serde(default = "default_button")]
        button: String,
        #[serde(default)]
        x: Option<i32>,
        #[serde(default)]
        y: Option<i32>,
    },
    #[serde(rename = "mouse.up")]
    MouseUp {
        id: String,
        #[serde(default = "default_button")]
        button: String,
        #[serde(default)]
        x: Option<i32>,
        #[serde(default)]
        y: Option<i32>,
    },
    #[serde(rename = "mouse.wheel")]
    MouseWheel {
        id: String,
        delta: i32,
        #[serde(default)]
        x: Option<i32>,
        #[serde(default)]
        y: Option<i32>,
    },
    #[serde(rename = "delay")]
    Delay { id: String, ms: u64 },
    #[serde(rename = "process.run")]
    ProcessRun {
        id: String,
        command: String,
        #[serde(default)]
        args: Vec<String>,
        #[serde(default = "default_wait")]
        wait: bool,
        #[serde(default, rename = "timeoutMs")]
        timeout_ms: Option<u64>,
    },
    #[serde(rename = "http.request")]
    HttpRequest {
        id: String,
        #[serde(default = "default_method")]
        method: String,
        url: String,
        #[serde(default)]
        body: Option<String>,
        #[serde(default = "default_timeout", rename = "timeoutMs")]
        timeout_ms: u64,
        #[serde(default)]
        headers: Vec<HttpHeader>,
        #[serde(default, rename = "statusVar")]
        status_var: Option<String>,
        #[serde(default, rename = "bodyVar")]
        body_var: Option<String>,
        /// When true, status >= 400 aborts the macro with an error.
        #[serde(default, rename = "failOnStatus")]
        fail_on_status: bool,
    },
    #[serde(rename = "json.path")]
    JsonPath {
        id: String,
        #[serde(rename = "sourceVar")]
        source_var: String,
        /// Dot-separated path into a JSON value (e.g. `user.name` or `items.0.id`).
        path: String,
        #[serde(rename = "destVar")]
        dest_var: String,
    },
    #[serde(rename = "script.run")]
    ScriptRun {
        id: String,
        /// Inline JS source (used when `scriptId` is absent).
        #[serde(default)]
        source: String,
        /// Optional library script id (Phase 3).
        #[serde(default, rename = "scriptId")]
        script_id: Option<String>,
        #[serde(default = "default_script_timeout", rename = "timeoutMs")]
        timeout_ms: u64,
        /// Optional overrides for `//@param` values.
        #[serde(default)]
        params: std::collections::HashMap<String, MacroValue>,
        /// Store `caster.return(...)` into this macro variable.
        #[serde(default, rename = "resultVar")]
        result_var: Option<String>,
    },
    #[serde(rename = "key.tap")]
    KeyTap {
        id: String,
        key: String,
        #[serde(default)]
        mods: KeyMods,
    },
    #[serde(rename = "key.down")]
    KeyDown {
        id: String,
        key: String,
        #[serde(default)]
        mods: KeyMods,
    },
    #[serde(rename = "key.up")]
    KeyUp {
        id: String,
        key: String,
        #[serde(default)]
        mods: KeyMods,
    },
    #[serde(rename = "clipboard.set")]
    ClipboardSet { id: String, text: String },
    #[serde(rename = "clipboard.get")]
    ClipboardGet { id: String, name: String },
    #[serde(rename = "var.set")]
    VarSet {
        id: String,
        name: String,
        value: MacroValue,
    },
    #[serde(rename = "control.if")]
    ControlIf {
        id: String,
        condition: Condition,
        then: Vec<ActionNode>,
        #[serde(default, rename = "else")]
        else_branch: Vec<ActionNode>,
    },
    #[serde(rename = "control.while")]
    ControlWhile {
        id: String,
        condition: Condition,
        body: Vec<ActionNode>,
        #[serde(default = "default_max_while_iters", rename = "maxIterations")]
        max_iterations: u32,
    },
}

fn default_wait() -> bool {
    true
}

fn default_max_while_iters() -> u32 {
    10_000
}

fn default_button() -> String {
    "left".into()
}

fn default_method() -> String {
    "GET".into()
}

fn default_timeout() -> u64 {
    10_000
}

fn default_script_timeout() -> u64 {
    10_000
}

impl MacroDocument {
    pub fn new_empty(name: impl Into<String>) -> Self {
        Self {
            schema_version: SCHEMA_VERSION_CURRENT,
            name: name.into(),
            trigger: Trigger::Manual,
            repeat_count: 1,
            process_filter: MacroProcessFilterMode::default(),
            local_process_filter: ProcessFilter::default(),
            actions: Vec::new(),
        }
    }
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
    match doc.schema_version {
        SCHEMA_VERSION_V1
        | SCHEMA_VERSION_V2
        | SCHEMA_VERSION_V3
        | SCHEMA_VERSION_V4
        | SCHEMA_VERSION_V5
        | SCHEMA_VERSION_V6
        | SCHEMA_VERSION_V7
        | SCHEMA_VERSION_CURRENT => Ok(doc),
        other => Err(SchemaError::UnsupportedVersion(other)),
    }
}

pub fn macro_to_json(doc: &MacroDocument) -> Result<String, SchemaError> {
    Ok(serde_json::to_string_pretty(doc)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    const EXAMPLE_V3: &str = r#"{
      "schemaVersion": 3,
      "name": "HttpKey",
      "trigger": { "type": "manual" },
      "repeatCount": 1,
      "actions": [
        { "id": "k1", "type": "key.tap", "key": "A" },
        { "id": "h1", "type": "http.request", "method": "GET", "url": "https://example.com", "timeoutMs": 5000 }
      ]
    }"#;

    const EXAMPLE_V4: &str = r#"{
      "schemaVersion": 4,
      "name": "IfVar",
      "trigger": { "type": "manual" },
      "repeatCount": 1,
      "actions": [
        { "id": "v1", "type": "var.set", "name": "n", "value": 2 },
        {
          "id": "i1",
          "type": "control.if",
          "condition": { "left": { "var": "n" }, "op": "gt", "right": 1 },
          "then": [
            { "id": "k1", "type": "key.tap", "key": "A" }
          ],
          "else": [
            { "id": "k2", "type": "key.tap", "key": "B" }
          ]
        }
      ]
    }"#;

    #[test]
    fn parses_v3_http_and_key() {
        let doc = parse_macro_json(EXAMPLE_V3).unwrap();
        assert_eq!(doc.schema_version, 3);
        assert!(matches!(&doc.actions[0], ActionNode::KeyTap { key, .. } if key == "A"));
        assert!(matches!(
            &doc.actions[1],
            ActionNode::HttpRequest { method, url, .. }
                if method == "GET" && url == "https://example.com"
        ));
    }

    #[test]
    fn parses_v4_var_and_if() {
        let doc = parse_macro_json(EXAMPLE_V4).unwrap();
        assert_eq!(doc.schema_version, 4);
        assert!(matches!(
            &doc.actions[0],
            ActionNode::VarSet { name, value: MacroValue::Number(n), .. }
                if name == "n" && (*n - 2.0).abs() < f64::EPSILON
        ));
        assert!(matches!(
            &doc.actions[1],
            ActionNode::ControlIf { then, else_branch, .. }
                if then.len() == 1 && else_branch.len() == 1
        ));
    }

    #[test]
    fn accepts_v1_and_v2() {
        assert!(parse_macro_json(
            r#"{"schemaVersion":1,"name":"x","trigger":{"type":"manual"},"actions":[]}"#
        )
        .is_ok());
        assert!(parse_macro_json(
            r#"{"schemaVersion":2,"name":"x","trigger":{"type":"manual"},"actions":[]}"#
        )
        .is_ok());
    }

    #[test]
    fn rejects_unknown_schema_version() {
        let err = parse_macro_json(
            r#"{"schemaVersion":99,"name":"x","trigger":{"type":"manual"},"actions":[]}"#,
        )
        .unwrap_err();
        assert!(matches!(err, SchemaError::UnsupportedVersion(99)));
    }

    #[test]
    fn parses_v5_mouse_gestures() {
        let doc = parse_macro_json(
            r#"{
              "schemaVersion": 5,
              "name": "Drag",
              "trigger": { "type": "manual" },
              "actions": [
                { "id": "d", "type": "mouse.down", "button": "left", "x": 10, "y": 20 },
                { "id": "m", "type": "mouse.move", "x": 40, "y": 80 },
                { "id": "u", "type": "mouse.up", "button": "left", "x": 40, "y": 80 }
              ]
            }"#,
        )
        .unwrap();
        assert_eq!(doc.schema_version, 5);
        assert!(matches!(&doc.actions[0], ActionNode::MouseDown { x: Some(10), .. }));
        assert!(matches!(&doc.actions[1], ActionNode::MouseMove { x: 40, y: 80, .. }));
        assert!(matches!(&doc.actions[2], ActionNode::MouseUp { y: Some(80), .. }));
    }

    #[test]
    fn parses_v6_key_wheel_clipboard() {
        let doc = parse_macro_json(
            r#"{
              "schemaVersion": 6,
              "name": "V6",
              "trigger": { "type": "manual" },
              "actions": [
                { "id": "k", "type": "key.tap", "key": "C", "mods": { "ctrl": true } },
                { "id": "d", "type": "key.down", "key": "A" },
                { "id": "u", "type": "key.up", "key": "A" },
                { "id": "w", "type": "mouse.wheel", "delta": -120 },
                { "id": "s", "type": "clipboard.set", "text": "hi" },
                { "id": "g", "type": "clipboard.get", "name": "clip" },
                { "id": "h", "type": "http.request", "url": "https://example.com", "headers": [{ "name": "Accept", "value": "text/plain" }], "statusVar": "st" }
              ]
            }"#,
        )
        .unwrap();
        assert_eq!(doc.schema_version, 6);
        assert!(matches!(
            &doc.actions[0],
            ActionNode::KeyTap { key, mods, .. } if key == "C" && mods.ctrl
        ));
        assert!(matches!(&doc.actions[3], ActionNode::MouseWheel { delta: -120, .. }));
        assert!(matches!(&doc.actions[4], ActionNode::ClipboardSet { text, .. } if text == "hi"));
        assert!(matches!(
            &doc.actions[6],
            ActionNode::HttpRequest { status_var: Some(v), headers, .. }
                if v == "st" && headers.len() == 1
        ));
    }
}
