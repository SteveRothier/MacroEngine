//! Named macro library (JSON files under config `macros/`).

use std::fs;
use std::path::{Path, PathBuf};

use thiserror::Error;

use crate::schema::{macro_to_json, parse_macro_json, KeyMods, MacroDocument, Trigger};
use serde::{Deserialize, Serialize};

#[derive(Debug, Error)]
pub enum MacroLibraryError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
    #[error("{0}")]
    Schema(String),
    #[error("invalid macro name")]
    InvalidName,
    #[error("macro not found: {0}")]
    NotFound(String),
    #[error("macro already exists: {0}")]
    AlreadyExists(String),
    #[error("trigger conflict: {0}")]
    TriggerConflict(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MacroSummary {
    pub name: String,
    pub action_count: usize,
    /// Decimal VK string when trigger is hotkey; null/omit for manual.
    pub trigger_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trigger_mods: Option<KeyMods>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub folder_id: Option<String>,
    #[serde(default)]
    pub locked: bool,
    #[serde(default)]
    pub updated_at: u64,
}

fn sanitize_name(name: &str) -> Result<String, MacroLibraryError> {
    let t = name.trim();
    if t.is_empty() || t.contains('/') || t.contains('\\') || t.contains("..") || t.len() > 64 {
        return Err(MacroLibraryError::InvalidName);
    }
    let safe: String = t
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == ' ' {
                c
            } else {
                '_'
            }
        })
        .collect();
    if safe.trim().is_empty() {
        return Err(MacroLibraryError::InvalidName);
    }
    Ok(safe)
}

pub fn macros_dir(config_dir: &Path) -> PathBuf {
    config_dir.join("macros")
}

pub fn ensure_macros_dir(config_dir: &Path) -> Result<PathBuf, MacroLibraryError> {
    let dir = macros_dir(config_dir);
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn macro_path(config_dir: &Path, name: &str) -> Result<PathBuf, MacroLibraryError> {
    let safe = sanitize_name(name)?;
    Ok(macros_dir(config_dir).join(format!("{safe}.json")))
}

pub fn list_macros(config_dir: &Path) -> Result<Vec<String>, MacroLibraryError> {
    let dir = ensure_macros_dir(config_dir)?;
    let mut names = Vec::new();
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
            names.push(stem.to_string());
        }
    }
    names.sort();
    Ok(names)
}

pub fn list_macro_summaries(config_dir: &Path) -> Result<Vec<MacroSummary>, MacroLibraryError> {
    let names = list_macros(config_dir)?;
    let mut out = Vec::with_capacity(names.len());
    for name in names {
        let path = macros_dir(config_dir).join(format!("{name}.json"));
        let updated_at = fs::metadata(&path)
            .and_then(|m| m.modified())
            .unwrap_or(std::time::UNIX_EPOCH)
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        match load_macro(config_dir, &name) {
            Ok(doc) => {
                let (trigger_key, trigger_mods) = match &doc.trigger {
                    Trigger::Hotkey { key, mods } => {
                        let mods_opt = if mods.any() { Some(*mods) } else { None };
                        (Some(key.clone()), mods_opt)
                    }
                    Trigger::Manual => (None, None),
                };
                out.push(MacroSummary {
                    name: doc.name,
                    action_count: doc.actions.len(),
                    trigger_key,
                    trigger_mods,
                    folder_id: None,
                    locked: false,
                    updated_at,
                });
            }
            Err(_) => {
                out.push(MacroSummary {
                    name,
                    action_count: 0,
                    trigger_key: None,
                    trigger_mods: None,
                    folder_id: None,
                    locked: false,
                    updated_at,
                });
            }
        }
    }
    Ok(out)
}

fn parse_vk_key(key: &str) -> Option<u16> {
    let t = key.trim();
    if t.is_empty() {
        return None;
    }
    if let Some(hex) = t.strip_prefix("0x").or_else(|| t.strip_prefix("0X")) {
        return u16::from_str_radix(hex, 16).ok();
    }
    t.parse::<u16>().ok()
}

/// Refuse save if hotkey VK collides with another macro or reserved bindings.
pub fn validate_trigger(
    config_dir: &Path,
    id: &str,
    doc: &MacroDocument,
    reserved: &[u16],
) -> Result<(), MacroLibraryError> {
    validate_trigger_excluding(config_dir, id, doc, reserved, &[])
}

/// Like [`validate_trigger`], but also ignores macros listed in `exclude_ids`
/// (needed while renaming: the old file still exists with the same hotkey).
pub fn validate_trigger_excluding(
    config_dir: &Path,
    id: &str,
    doc: &MacroDocument,
    reserved: &[u16],
    exclude_ids: &[&str],
) -> Result<(), MacroLibraryError> {
    let Trigger::Hotkey { key, mods } = &doc.trigger else {
        return Ok(());
    };
    let Some(vk) = parse_vk_key(key) else {
        return Err(MacroLibraryError::TriggerConflict(
            "raccourci invalide".into(),
        ));
    };
    if reserved.contains(&vk) {
        return Err(MacroLibraryError::TriggerConflict(
            "raccourci réservé (clicker / global / urgence)".into(),
        ));
    }
    let safe = sanitize_name(id)?;
    let excluded: Vec<String> = exclude_ids
        .iter()
        .filter_map(|n| sanitize_name(n).ok())
        .collect();
    for name in list_macros(config_dir)? {
        if name == safe || excluded.iter().any(|e| e == &name) {
            continue;
        }
        let other = load_macro(config_dir, &name)?;
        if let Trigger::Hotkey {
            key: other_key,
            mods: other_mods,
        } = &other.trigger
        {
            if parse_vk_key(other_key) == Some(vk) && *mods == *other_mods {
                return Err(MacroLibraryError::TriggerConflict(format!(
                    "déjà utilisé par « {name} »"
                )));
            }
        }
    }
    Ok(())
}

pub fn load_macro(config_dir: &Path, name: &str) -> Result<MacroDocument, MacroLibraryError> {
    let path = macro_path(config_dir, name)?;
    if !path.exists() {
        return Err(MacroLibraryError::NotFound(
            sanitize_name(name).unwrap_or_else(|_| name.to_string()),
        ));
    }
    let raw = fs::read_to_string(path)?;
    let mut doc = parse_macro_json(&raw).map_err(|e| MacroLibraryError::Schema(e.to_string()))?;
    let safe = sanitize_name(name)?;
    doc.name = safe;
    Ok(doc)
}

/// Persist `doc` under `id` (filename stem). Forces `doc.name = id`.
pub fn save_macro(
    config_dir: &Path,
    id: &str,
    doc: &MacroDocument,
) -> Result<MacroDocument, MacroLibraryError> {
    save_macro_checked(config_dir, id, doc, &[])
}

pub fn save_macro_checked(
    config_dir: &Path,
    id: &str,
    doc: &MacroDocument,
    reserved: &[u16],
) -> Result<MacroDocument, MacroLibraryError> {
    save_macro_checked_excluding(config_dir, id, doc, reserved, &[])
}

pub fn save_macro_checked_excluding(
    config_dir: &Path,
    id: &str,
    doc: &MacroDocument,
    reserved: &[u16],
    exclude_ids: &[&str],
) -> Result<MacroDocument, MacroLibraryError> {
    validate_trigger_excluding(config_dir, id, doc, reserved, exclude_ids)?;
    let safe = sanitize_name(id)?;
    let dir = ensure_macros_dir(config_dir)?;
    let mut out = doc.clone();
    out.name = safe.clone();
    let path = dir.join(format!("{safe}.json"));
    let raw = macro_to_json(&out).map_err(|e| MacroLibraryError::Schema(e.to_string()))?;
    fs::write(path, raw)?;
    Ok(out)
}

fn unique_name(config_dir: &Path, base: &str) -> Result<String, MacroLibraryError> {
    let base = sanitize_name(base)?;
    let existing = list_macros(config_dir)?;
    if !existing.iter().any(|n| n == &base) {
        return Ok(base);
    }
    for i in 2..1000 {
        let candidate = format!("{base} {i}");
        if candidate.len() > 64 {
            break;
        }
        if !existing.iter().any(|n| n == &candidate) {
            return Ok(candidate);
        }
    }
    Err(MacroLibraryError::AlreadyExists(base))
}

pub fn create_macro(
    config_dir: &Path,
    name: Option<&str>,
) -> Result<MacroDocument, MacroLibraryError> {
    let base = name.unwrap_or("Nouvelle macro");
    let id = unique_name(config_dir, base)?;
    let doc = MacroDocument::new_empty(id.clone());
    save_macro(config_dir, &id, &doc)
}

pub fn delete_macro(config_dir: &Path, name: &str) -> Result<(), MacroLibraryError> {
    let path = macro_path(config_dir, name)?;
    let safe = sanitize_name(name)?;
    if !path.exists() {
        return Err(MacroLibraryError::NotFound(safe));
    }
    fs::remove_file(path)?;
    Ok(())
}

pub fn duplicate_macro(
    config_dir: &Path,
    name: &str,
) -> Result<MacroDocument, MacroLibraryError> {
    let src = load_macro(config_dir, name)?;
    let copy_base = format!("{} (copie)", src.name);
    let id = unique_name(config_dir, &copy_base)?;
    let mut doc = src;
    doc.name = id.clone();
    // Avoid inheriting a hotkey that would conflict with the original.
    doc.trigger = Trigger::Manual;
    save_macro(config_dir, &id, &doc)
}

pub fn rename_macro(
    config_dir: &Path,
    from: &str,
    to: &str,
) -> Result<MacroDocument, MacroLibraryError> {
    let from_safe = sanitize_name(from)?;
    let to_safe = sanitize_name(to)?;
    if from_safe == to_safe {
        return load_macro(config_dir, &from_safe);
    }
    let existing = list_macros(config_dir)?;
    if existing.iter().any(|n| n == &to_safe) {
        return Err(MacroLibraryError::AlreadyExists(to_safe));
    }
    let mut doc = load_macro(config_dir, &from_safe)?;
    doc.name = to_safe.clone();
    // Old file still on disk with the same hotkey — exclude it from conflict check.
    save_macro_checked_excluding(config_dir, &to_safe, &doc, &[], &[from_safe.as_str()])?;
    delete_macro(config_dir, &from_safe)?;
    Ok(doc)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir() -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("me-macros-{stamp}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn create_save_load_delete_roundtrip() {
        let dir = temp_dir();
        let doc = create_macro(&dir, Some("Demo")).unwrap();
        assert_eq!(doc.name, "Demo");
        assert_eq!(list_macros(&dir).unwrap(), vec!["Demo".to_string()]);
        let mut edited = doc;
        edited.repeat_count = 3;
        save_macro(&dir, "Demo", &edited).unwrap();
        let loaded = load_macro(&dir, "Demo").unwrap();
        assert_eq!(loaded.repeat_count, 3);
        let copy = duplicate_macro(&dir, "Demo").unwrap();
        assert!(copy.name.contains("copie"));
        let renamed = rename_macro(&dir, "Demo", "Renamed").unwrap();
        assert_eq!(renamed.name, "Renamed");
        delete_macro(&dir, "Renamed").unwrap();
        delete_macro(&dir, &copy.name).unwrap();
        assert!(list_macros(&dir).unwrap().is_empty());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn rename_keeps_own_hotkey() {
        let dir = temp_dir();
        let mut a = create_macro(&dir, Some("Albion")).unwrap();
        a.trigger = crate::schema::Trigger::Hotkey {
            key: "0x13".into(),
            mods: KeyMods::default(),
        };
        save_macro(&dir, "Albion", &a).unwrap();
        let renamed = rename_macro(&dir, "Albion", "Albion2").unwrap();
        assert_eq!(renamed.name, "Albion2");
        assert!(matches!(
            renamed.trigger,
            crate::schema::Trigger::Hotkey { .. }
        ));
        assert_eq!(list_macros(&dir).unwrap(), vec!["Albion2".to_string()]);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn trigger_conflict_refused() {
        let dir = temp_dir();
        let mut a = create_macro(&dir, Some("A")).unwrap();
        a.trigger = crate::schema::Trigger::Hotkey {
            key: "0x70".into(),
            mods: KeyMods::default(),
        };
        save_macro(&dir, "A", &a).unwrap();
        let mut b = create_macro(&dir, Some("B")).unwrap();
        b.trigger = crate::schema::Trigger::Hotkey {
            key: "0x70".into(),
            mods: KeyMods::default(),
        };
        let err = save_macro_checked(&dir, "B", &b, &[0x75, 0x78, 0x77]).unwrap_err();
        assert!(err.to_string().contains("déjà utilisé"));
        b.trigger = crate::schema::Trigger::Hotkey {
            key: "0x75".into(),
            mods: KeyMods::default(),
        };
        let err = save_macro_checked(&dir, "B", &b, &[0x75, 0x78, 0x77]).unwrap_err();
        assert!(err.to_string().contains("réservé"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn unique_names_on_create() {
        let dir = temp_dir();
        let a = create_macro(&dir, Some("Nouvelle macro")).unwrap();
        let b = create_macro(&dir, Some("Nouvelle macro")).unwrap();
        assert_eq!(a.name, "Nouvelle macro");
        assert_eq!(b.name, "Nouvelle macro 2");
        let _ = fs::remove_dir_all(&dir);
    }
}
