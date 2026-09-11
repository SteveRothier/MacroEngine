//! Reusable JS scripts stored under the app config directory.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::actions::registry::ActionError;
use crate::schema::MacroValue;

#[derive(Debug, Error)]
pub enum ScriptLibraryError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
    #[error("{0}")]
    Other(String),
}

impl From<ScriptLibraryError> for ActionError {
    fn from(e: ScriptLibraryError) -> Self {
        ActionError::Message(e.to_string())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ScriptDoc {
    pub id: String,
    pub name: String,
    pub source: String,
    /// When true, `caster.fetch` is allowed.
    #[serde(default = "default_network")]
    pub allow_network: bool,
    #[serde(default)]
    pub allow_clipboard: bool,
    #[serde(default)]
    pub allow_fs: bool,
    #[serde(default)]
    pub allow_macro_control: bool,
    /// Saved UI defaults for `//@param` values.
    #[serde(default)]
    pub param_values: HashMap<String, MacroValue>,
}

fn default_network() -> bool {
    true
}

fn scripts_dir(config_dir: &Path) -> PathBuf {
    config_dir.join("scripts")
}

fn script_path(config_dir: &Path, id: &str) -> PathBuf {
    let safe: String = id
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    scripts_dir(config_dir).join(format!("{safe}.json"))
}

pub fn ensure_scripts_dir(config_dir: &Path) -> Result<(), ScriptLibraryError> {
    fs::create_dir_all(scripts_dir(config_dir))?;
    Ok(())
}

pub fn ensure_script_data_dir(config_dir: &Path) -> Result<(), ScriptLibraryError> {
    fs::create_dir_all(config_dir.join("script-data"))?;
    Ok(())
}

pub fn list_scripts(config_dir: &Path) -> Result<Vec<ScriptDoc>, ScriptLibraryError> {
    ensure_scripts_dir(config_dir)?;
    let mut out = Vec::new();
    for entry in fs::read_dir(scripts_dir(config_dir))? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let raw = fs::read_to_string(&path)?;
        if let Ok(doc) = serde_json::from_str::<ScriptDoc>(&raw) {
            out.push(doc);
        }
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

pub fn load_script(config_dir: &Path, id: &str) -> Result<ScriptDoc, ScriptLibraryError> {
    let path = script_path(config_dir, id);
    let raw = fs::read_to_string(&path).map_err(|_| {
        ScriptLibraryError::Other(format!("script not found: {id}"))
    })?;
    Ok(serde_json::from_str(&raw)?)
}

pub fn load_script_source(id: &str) -> Result<String, ActionError> {
    let dir = std::env::var("CASTER_CONFIG_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| dirs_next_config());
    let doc = load_script(&dir, id)?;
    Ok(doc.source)
}

pub fn load_script_doc(id: &str) -> Result<ScriptDoc, ActionError> {
    let dir = std::env::var("CASTER_CONFIG_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| dirs_next_config());
    Ok(load_script(&dir, id)?)
}

pub fn config_dir_default() -> PathBuf {
    std::env::var("CASTER_CONFIG_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| dirs_next_config())
}

fn dirs_next_config() -> PathBuf {
    if let Some(base) = std::env::var_os("APPDATA") {
        return PathBuf::from(base).join("com.steverothier.caster");
    }
    PathBuf::from(".").join("caster-config")
}

pub fn save_script(config_dir: &Path, doc: &ScriptDoc) -> Result<(), ScriptLibraryError> {
    ensure_scripts_dir(config_dir)?;
    let _ = ensure_script_data_dir(config_dir);
    let path = script_path(config_dir, &doc.id);
    let raw = serde_json::to_string_pretty(doc)?;
    fs::write(path, raw)?;
    Ok(())
}

pub fn delete_script(config_dir: &Path, id: &str) -> Result<(), ScriptLibraryError> {
    let path = script_path(config_dir, id);
    if path.exists() {
        fs::remove_file(path)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn save_load_delete_roundtrip() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis();
        let dir = std::env::temp_dir().join(format!("caster-scripts-{stamp}"));
        let _ = fs::remove_dir_all(&dir);
        let doc = ScriptDoc {
            id: "hello".into(),
            name: "Hello".into(),
            source: "caster.set('x', 1);".into(),
            allow_network: false,
            allow_clipboard: false,
            allow_fs: false,
            allow_macro_control: false,
            param_values: HashMap::new(),
        };
        save_script(&dir, &doc).unwrap();
        let loaded = load_script(&dir, "hello").unwrap();
        assert_eq!(loaded.source, doc.source);
        assert!(!loaded.allow_network);
        delete_script(&dir, "hello").unwrap();
        assert!(load_script(&dir, "hello").is_err());
        let _ = fs::remove_dir_all(&dir);
    }
}
