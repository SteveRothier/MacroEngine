//! Clicker named presets (JSON files under config `clicker-presets/`).

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::clicker::ClickerConfig;
use crate::schema::Trigger;

#[derive(Debug, Error)]
pub enum PresetError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
    #[error("invalid preset name")]
    InvalidName,
    #[error("preset not found: {0}")]
    NotFound(String),
    #[error("preset already exists: {0}")]
    AlreadyExists(String),
    #[error("trigger conflict: {0}")]
    TriggerConflict(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClickerPreset {
    pub name: String,
    pub config: ClickerConfig,
    /// Per-preset hotkey; missing / Manual = no dedicated trigger.
    #[serde(default = "default_trigger")]
    pub trigger: Trigger,
}

fn default_trigger() -> Trigger {
    Trigger::Manual
}

fn sanitize_name(name: &str) -> Result<String, PresetError> {
    let t = name.trim();
    if t.is_empty() || t.contains('/') || t.contains('\\') || t.contains("..") || t.len() > 64
    {
        return Err(PresetError::InvalidName);
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
        return Err(PresetError::InvalidName);
    }
    Ok(safe)
}

pub fn presets_dir(config_dir: &Path) -> PathBuf {
    config_dir.join("clicker-presets")
}

pub fn ensure_presets_dir(config_dir: &Path) -> Result<PathBuf, PresetError> {
    let dir = presets_dir(config_dir);
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

pub fn list_presets(config_dir: &Path) -> Result<Vec<String>, PresetError> {
    let dir = ensure_presets_dir(config_dir)?;
    let mut entries: Vec<(String, std::time::SystemTime)> = Vec::new();
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        let modified = entry
            .metadata()
            .and_then(|m| m.modified())
            .unwrap_or(std::time::UNIX_EPOCH);
        entries.push((stem.to_string(), modified));
    }
    entries.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    Ok(entries.into_iter().map(|(name, _)| name).collect())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClickerPresetSummary {
    pub name: String,
    pub cps: f64,
    pub mode: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trigger_key: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trigger_mods: Option<crate::schema::KeyMods>,
}

fn unique_name(config_dir: &Path, base: &str) -> Result<String, PresetError> {
    let base = sanitize_name(base)?;
    let existing = list_presets(config_dir)?;
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
    Err(PresetError::AlreadyExists(base))
}

pub fn list_preset_summaries(config_dir: &Path) -> Result<Vec<ClickerPresetSummary>, PresetError> {
    let names = list_presets(config_dir)?;
    let mut out = Vec::with_capacity(names.len());
    for name in names {
        match load_preset(config_dir, &name) {
            Ok(p) => {
                let (trigger_key, trigger_mods) = match &p.trigger {
                    Trigger::Hotkey { key, mods } => (Some(key.clone()), Some(*mods)),
                    Trigger::Manual => (None, None),
                };
                out.push(ClickerPresetSummary {
                    name: p.name,
                    cps: p.config.cps,
                    mode: match p.config.mode {
                        crate::clicker::ClickMode::Hold => "hold".into(),
                        crate::clicker::ClickMode::Toggle => "toggle".into(),
                    },
                    trigger_key,
                    trigger_mods,
                })
            }
            Err(_) => out.push(ClickerPresetSummary {
                name,
                cps: 0.0,
                mode: "toggle".into(),
                trigger_key: None,
                trigger_mods: None,
            }),
        }
    }
    Ok(out)
}

pub fn rename_preset(
    config_dir: &Path,
    from: &str,
    to: &str,
) -> Result<ClickerPreset, PresetError> {
    let from_safe = sanitize_name(from)?;
    let to_safe = sanitize_name(to)?;
    if from_safe == to_safe {
        return load_preset(config_dir, &from_safe);
    }
    let existing = list_presets(config_dir)?;
    if existing.iter().any(|n| n == &to_safe) {
        return Err(PresetError::AlreadyExists(to_safe));
    }
    let preset = load_preset(config_dir, &from_safe)?;
    save_preset_with_trigger(config_dir, &to_safe, &preset.config, preset.trigger.clone())?;
    delete_preset(config_dir, &from_safe)?;
    Ok(ClickerPreset {
        name: to_safe,
        config: preset.config,
        trigger: preset.trigger,
    })
}

pub fn duplicate_preset(
    config_dir: &Path,
    name: &str,
) -> Result<ClickerPreset, PresetError> {
    let src = load_preset(config_dir, name)?;
    let copy_base = format!("{} (copie)", src.name);
    let id = unique_name(config_dir, &copy_base)?;
    // Duplicate without copying the hotkey (avoids immediate conflict).
    save_preset_with_trigger(config_dir, &id, &src.config, Trigger::Manual)
}

pub fn save_preset(
    config_dir: &Path,
    name: &str,
    config: &ClickerConfig,
) -> Result<ClickerPreset, PresetError> {
    let trigger = load_preset(config_dir, name)
        .map(|p| p.trigger)
        .unwrap_or(Trigger::Manual);
    save_preset_with_trigger(config_dir, name, config, trigger)
}

pub fn save_preset_with_trigger(
    config_dir: &Path,
    name: &str,
    config: &ClickerConfig,
    trigger: Trigger,
) -> Result<ClickerPreset, PresetError> {
    let safe = sanitize_name(name)?;
    let dir = ensure_presets_dir(config_dir)?;
    let preset = ClickerPreset {
        name: safe.clone(),
        config: config.clone(),
        trigger,
    };
    let path = dir.join(format!("{safe}.json"));
    let raw = serde_json::to_string_pretty(&preset)?;
    fs::write(path, raw)?;
    Ok(preset)
}

pub fn load_preset(config_dir: &Path, name: &str) -> Result<ClickerPreset, PresetError> {
    let safe = sanitize_name(name)?;
    let path = presets_dir(config_dir).join(format!("{safe}.json"));
    if !path.exists() {
        return Err(PresetError::NotFound(safe));
    }
    let raw = fs::read_to_string(path)?;
    Ok(serde_json::from_str(&raw)?)
}

pub fn delete_preset(config_dir: &Path, name: &str) -> Result<(), PresetError> {
    let safe = sanitize_name(name)?;
    let path = presets_dir(config_dir).join(format!("{safe}.json"));
    if !path.exists() {
        return Err(PresetError::NotFound(safe));
    }
    fs::remove_file(path)?;
    Ok(())
}

/// Write a named library preset to an arbitrary path (backup / share).
pub fn export_preset_to_path(
    config_dir: &Path,
    name: &str,
    path: &Path,
) -> Result<(), PresetError> {
    let preset = load_preset(config_dir, name)?;
    let raw = serde_json::to_string_pretty(&preset)?;
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)?;
        }
    }
    fs::write(path, raw)?;
    Ok(())
}

/// Import a preset JSON file into the library (unique name if collision).
pub fn import_preset_from_path(
    config_dir: &Path,
    path: &Path,
) -> Result<ClickerPreset, PresetError> {
    let raw = fs::read_to_string(path)?;
    let parsed: ClickerPreset = serde_json::from_str(&raw)?;
    let id = unique_name(config_dir, &parsed.name)?;
    save_preset_with_trigger(config_dir, &id, &parsed.config, parsed.trigger)
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
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("me-presets-{stamp}"));
        fs::create_dir_all(&dir).unwrap();
        let cfg = ClickerConfig {
            cps: 22.0,
            ..Default::default()
        };
        save_preset(&dir, "fast", &cfg).unwrap();
        let names = list_presets(&dir).unwrap();
        assert_eq!(names, vec!["fast".to_string()]);
        let loaded = load_preset(&dir, "fast").unwrap();
        assert!((loaded.config.cps - 22.0).abs() < 1e-9);
        delete_preset(&dir, "fast").unwrap();
        assert!(list_presets(&dir).unwrap().is_empty());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn import_export_roundtrip() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("me-presets-ie-{stamp}"));
        fs::create_dir_all(&dir).unwrap();
        let cfg = ClickerConfig {
            cps: 33.0,
            mode: crate::clicker::ClickMode::Hold,
            ..Default::default()
        };
        save_preset(&dir, "share", &cfg).unwrap();
        let out = dir.join("share-export.json");
        export_preset_to_path(&dir, "share", &out).unwrap();
        delete_preset(&dir, "share").unwrap();
        let imported = import_preset_from_path(&dir, &out).unwrap();
        assert_eq!(imported.name, "share");
        assert!((imported.config.cps - 33.0).abs() < 1e-9);
        let _ = fs::remove_dir_all(&dir);
    }
}
