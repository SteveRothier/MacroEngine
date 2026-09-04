//! Persist clicker + UI preferences to JSON.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::clicker::ClickerConfig;
use crate::hotkeys::HotkeyBindings;

/// UI color theme (persisted).
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum ThemeMode {
    #[default]
    Light,
    Dark,
    System,
}

/// Allow/deny list of process exe names (case-insensitive basename).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ProcessFilterMode {
    Allow,
    Deny,
}

impl Default for ProcessFilterMode {
    fn default() -> Self {
        Self::Deny
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProcessFilter {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub mode: ProcessFilterMode,
    /// Executable names, e.g. `notepad.exe`.
    #[serde(default)]
    pub names: Vec<String>,
}

impl Default for ProcessFilter {
    fn default() -> Self {
        Self {
            enabled: false,
            mode: ProcessFilterMode::Deny,
            names: Vec::new(),
        }
    }
}

pub fn normalize_exe_name(s: &str) -> String {
    let t = s.trim().replace('\\', "/");
    let base = t.rsplit('/').next().unwrap_or(t.as_str());
    base.to_ascii_lowercase()
}

impl ProcessFilter {
    /// Whether a click tick is allowed for the given foreground exe (basename).
    pub fn allows(&self, foreground_exe: Option<&str>) -> bool {
        if !self.enabled {
            return true;
        }
        let listed: Vec<String> = self
            .names
            .iter()
            .map(|n| normalize_exe_name(n))
            .filter(|n| !n.is_empty())
            .collect();
        if listed.is_empty() {
            return match self.mode {
                ProcessFilterMode::Allow => false,
                ProcessFilterMode::Deny => true,
            };
        }
        let Some(exe) = foreground_exe.map(normalize_exe_name).filter(|n| !n.is_empty()) else {
            return match self.mode {
                ProcessFilterMode::Allow => false,
                ProcessFilterMode::Deny => true,
            };
        };
        let hit = listed.iter().any(|n| n == &exe);
        match self.mode {
            ProcessFilterMode::Allow => hit,
            ProcessFilterMode::Deny => !hit,
        }
    }
}

fn default_overlay_opacity() -> f32 {
    1.0
}

pub fn clamp_overlay_opacity(v: f32) -> f32 {
    if !v.is_finite() {
        return 1.0;
    }
    v.clamp(0.4, 1.0)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub clicker: ClickerConfig,
    #[serde(default)]
    pub advanced_ui: bool,
    #[serde(default)]
    pub overlay_visible: bool,
    #[serde(default = "default_overlay_opacity")]
    pub overlay_opacity: f32,
    #[serde(default)]
    pub hotkeys: HotkeyBindings,
    /// Process allow/deny list applied by the clicker engine.
    #[serde(default)]
    pub process_filter: ProcessFilter,
    #[serde(default)]
    pub theme: ThemeMode,
    /// Physical display id (`Monitor::name`). `None` = primary.
    #[serde(default)]
    pub display_id: Option<String>,
    #[serde(default)]
    pub sidebar_collapsed: bool,
    #[serde(default)]
    pub journal_open: bool,
    #[serde(default)]
    pub close_to_tray: bool,
    #[serde(default)]
    pub start_with_windows: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            clicker: ClickerConfig::default(),
            advanced_ui: false,
            overlay_visible: false,
            overlay_opacity: 1.0,
            hotkeys: HotkeyBindings::default(),
            process_filter: ProcessFilter::default(),
            theme: ThemeMode::Light,
            display_id: None,
            sidebar_collapsed: false,
            journal_open: false,
            close_to_tray: false,
            start_with_windows: false,
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
    fn roundtrip_settings_with_hotkeys() {
        let dir = env::temp_dir().join(format!(
            "caster-settings-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let mut s = AppSettings::default();
        s.advanced_ui = true;
        s.clicker.cps = 33.0;
        s.clicker.click_kind = ClickKind::Double;
        s.hotkeys.macro_vk = 0x79; // F10
        s.process_filter.enabled = true;
        s.process_filter.names = vec!["notepad.exe".into()];
        save_settings(&dir, &s).unwrap();
        let loaded = load_settings(&dir).unwrap();
        assert!(loaded.advanced_ui);
        assert_eq!(loaded.clicker.cps, 33.0);
        assert_eq!(loaded.hotkeys.macro_vk, 0x79);
        assert!(loaded.process_filter.enabled);
        assert_eq!(loaded.process_filter.names, vec!["notepad.exe"]);
        assert_eq!(loaded.theme, ThemeMode::Light);
        s.theme = ThemeMode::Dark;
        save_settings(&dir, &s).unwrap();
        let loaded2 = load_settings(&dir).unwrap();
        assert_eq!(loaded2.theme, ThemeMode::Dark);
        s.theme = ThemeMode::System;
        save_settings(&dir, &s).unwrap();
        let loaded3 = load_settings(&dir).unwrap();
        assert_eq!(loaded3.theme, ThemeMode::System);
        s.close_to_tray = true;
        s.overlay_opacity = 0.5;
        s.sidebar_collapsed = true;
        save_settings(&dir, &s).unwrap();
        let loaded4 = load_settings(&dir).unwrap();
        assert!(loaded4.close_to_tray);
        assert!((loaded4.overlay_opacity - 0.5).abs() < f32::EPSILON);
        assert!(loaded4.sidebar_collapsed);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn filter_disabled_always_allows() {
        let f = ProcessFilter {
            enabled: false,
            mode: ProcessFilterMode::Allow,
            names: vec!["game.exe".into()],
        };
        assert!(f.allows(None));
        assert!(f.allows(Some("notepad.exe")));
    }

    #[test]
    fn deny_skips_listed_exe() {
        let f = ProcessFilter {
            enabled: true,
            mode: ProcessFilterMode::Deny,
            names: vec!["Notepad.EXE".into(), r"C:\Windows\game.exe".into()],
        };
        assert!(!f.allows(Some("notepad.exe")));
        assert!(!f.allows(Some(r"D:\apps\GAME.EXE")));
        assert!(f.allows(Some("chrome.exe")));
        assert!(f.allows(None));
    }

    #[test]
    fn allow_only_listed_exe() {
        let f = ProcessFilter {
            enabled: true,
            mode: ProcessFilterMode::Allow,
            names: vec!["game.exe".into()],
        };
        assert!(f.allows(Some("game.exe")));
        assert!(!f.allows(Some("chrome.exe")));
        assert!(!f.allows(None));
    }
}
