//! Persist clicker + UI preferences to JSON.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::clicker::ClickerConfig;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub clicker: ClickerConfig,
    #[serde(default)]
    pub advanced_ui: bool,
    #[serde(default)]
    pub overlay_visible: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            clicker: ClickerConfig::default(),
            advanced_ui: false,
            overlay_visible: false,
        }
    }
}

#[derive(Debug, Error)]
pub enum SettingsError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
}

pub fn settings_path(dir: impl AsRef<Path>) -> PathBuf {
    dir.as_ref().join("settings.json")
}

pub fn load_settings(dir: impl AsRef<Path>) -> Result<AppSettings, SettingsError> {
    let path = settings_path(dir);
    if !path.exists() {
        return Ok(AppSettings::default());
    }
    let raw = fs::read_to_string(path)?;
    Ok(serde_json::from_str(&raw)?)
}

pub fn save_settings(dir: impl AsRef<Path>, settings: &AppSettings) -> Result<(), SettingsError> {
    let dir = dir.as_ref();
    fs::create_dir_all(dir)?;
    let path = settings_path(dir);
    let raw = serde_json::to_string_pretty(settings)?;
    fs::write(path, raw)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clicker::ClickKind;
    use std::env;

    #[test]
    fn roundtrip_settings() {
        let dir = env::temp_dir().join(format!(
            "macroengine-settings-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let mut s = AppSettings::default();
        s.advanced_ui = true;
        s.clicker.cps = 33.0;
        s.clicker.click_kind = ClickKind::Double;
        save_settings(&dir, &s).unwrap();
        let loaded = load_settings(&dir).unwrap();
        assert!(loaded.advanced_ui);
        assert_eq!(loaded.clicker.cps, 33.0);
        assert_eq!(loaded.clicker.click_kind, ClickKind::Double);
        let _ = fs::remove_dir_all(dir);
    }
}
