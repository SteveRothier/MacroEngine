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

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum ScriptLanguage {
    #[default]
    Javascript,
    Typescript,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ScriptDoc {
    pub id: String,
    pub name: String,
    pub source: String,
    /// Source language; TypeScript is transpiled to JS before Boa.
    #[serde(default, deserialize_with = "deserialize_script_language")]
    pub language: ScriptLanguage,
    /// Library module (for `caster.include`); not a primary Accueil runner.
    #[serde(default)]
    pub is_module: bool,
    /// When true, `caster.fetch` is allowed.
    #[serde(default = "default_network")]
    pub allow_network: bool,
    #[serde(default)]
    pub allow_clipboard: bool,
    #[serde(default)]
    pub allow_fs: bool,
    #[serde(default)]
    pub allow_macro_control: bool,
    #[serde(default)]
    pub allow_input: bool,
    /// When true, `caster.runProcess` is allowed.
    #[serde(default)]
    pub allow_process: bool,
    /// Saved UI defaults for `//@param` values.
    #[serde(default)]
    pub param_values: HashMap<String, MacroValue>,
}

/// Accueil / list metadata without source (avoids shipping large payloads).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ScriptSummary {
    pub id: String,
    pub name: String,
    #[serde(default, deserialize_with = "deserialize_script_language")]
    pub language: ScriptLanguage,
    #[serde(default)]
    pub is_module: bool,
    #[serde(default = "default_network")]
    pub allow_network: bool,
    #[serde(default)]
    pub allow_clipboard: bool,
    #[serde(default)]
    pub allow_fs: bool,
    #[serde(default)]
    pub allow_macro_control: bool,
    #[serde(default)]
    pub allow_input: bool,
    #[serde(default)]
    pub allow_process: bool,
}

impl From<&ScriptDoc> for ScriptSummary {
    fn from(doc: &ScriptDoc) -> Self {
        Self {
            id: doc.id.clone(),
            name: doc.name.clone(),
            language: doc.language,
            is_module: doc.is_module,
            allow_network: doc.allow_network,
            allow_clipboard: doc.allow_clipboard,
            allow_fs: doc.allow_fs,
            allow_macro_control: doc.allow_macro_control,
            allow_input: doc.allow_input,
            allow_process: doc.allow_process,
        }
    }
}

fn default_network() -> bool {
    true
}

/// Accepts legacy `"python"` / `"Python"` as JavaScript (migration).
fn deserialize_script_language<'de, D>(deserializer: D) -> Result<ScriptLanguage, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let raw = String::deserialize(deserializer)?;
    Ok(match raw.to_ascii_lowercase().as_str() {
        "typescript" | "ts" => ScriptLanguage::Typescript,
        _ => ScriptLanguage::Javascript,
    })
}

fn raw_language_is_python(raw: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(raw)
        .ok()
        .and_then(|v| {
            v.get("language")
                .and_then(|l| l.as_str())
                .map(|s| s.eq_ignore_ascii_case("python"))
        })
        .unwrap_or(false)
}

/// Persist language rewrite when a legacy python doc was loaded.
fn migrate_python_language_if_needed(
    config_dir: &Path,
    raw: &str,
    doc: &mut ScriptDoc,
) -> Result<(), ScriptLibraryError> {
    if !raw_language_is_python(raw) {
        return Ok(());
    }
    doc.language = ScriptLanguage::Javascript;
    save_script(config_dir, doc)?;
    Ok(())
}

pub fn scripts_dir(config_dir: &Path) -> PathBuf {
    config_dir.join("scripts")
}

pub fn script_path(config_dir: &Path, id: &str) -> PathBuf {
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
        if let Ok(mut doc) = serde_json::from_str::<ScriptDoc>(&raw) {
            let _ = migrate_python_language_if_needed(config_dir, &raw, &mut doc);
            out.push(doc);
        }
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

/// Like [`list_scripts`] but omits `source` from the returned payloads.
pub fn list_script_summaries(
    config_dir: &Path,
) -> Result<Vec<ScriptSummary>, ScriptLibraryError> {
    Ok(list_scripts(config_dir)?
        .iter()
        .map(ScriptSummary::from)
        .collect())
}

pub fn load_script(config_dir: &Path, id: &str) -> Result<ScriptDoc, ScriptLibraryError> {
    let path = script_path(config_dir, id);
    let raw = fs::read_to_string(&path).map_err(|_| {
        ScriptLibraryError::Other(format!("script not found: {id}"))
    })?;
    let mut doc: ScriptDoc = serde_json::from_str(&raw)?;
    migrate_python_language_if_needed(config_dir, &raw, &mut doc)?;
    Ok(doc)
}

/// Resolve by id or exact name (case-sensitive).
pub fn resolve_script(config_dir: &Path, id_or_name: &str) -> Result<ScriptDoc, ScriptLibraryError> {
    if let Ok(doc) = load_script(config_dir, id_or_name) {
        return Ok(doc);
    }
    let needle = id_or_name.trim();
    list_scripts(config_dir)?
        .into_iter()
        .find(|d| d.name == needle || d.id == needle)
        .ok_or_else(|| ScriptLibraryError::Other(format!("script not found: {id_or_name}")))
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
            language: ScriptLanguage::Javascript,
            is_module: false,
            allow_network: false,
            allow_clipboard: false,
            allow_fs: false,
            allow_macro_control: false,
            allow_input: false,
            allow_process: false,
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

    #[test]
    fn load_migrates_python_language_to_javascript() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis();
        let dir = std::env::temp_dir().join(format!("caster-scripts-py-{stamp}"));
        let _ = fs::remove_dir_all(&dir);
        ensure_scripts_dir(&dir).unwrap();
        let path = script_path(&dir, "legacy-py");
        fs::write(
            &path,
            r#"{
  "id": "legacy-py",
  "name": "Legacy",
  "source": "print(1)",
  "language": "python"
}"#,
        )
        .unwrap();
        let loaded = load_script(&dir, "legacy-py").unwrap();
        assert_eq!(loaded.language, ScriptLanguage::Javascript);
        let raw = fs::read_to_string(&path).unwrap();
        assert!(
            raw.contains("\"language\": \"javascript\"") || raw.contains("\"language\":\"javascript\""),
            "expected persisted javascript, got {raw}"
        );
        let _ = fs::remove_dir_all(&dir);
    }
}
