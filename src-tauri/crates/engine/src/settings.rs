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

fn default_true() -> bool {
    true
}

fn default_recent_max() -> u32 {
    12
}

fn default_double_click_ms() -> u32 {
    300
}

fn default_drag_threshold() -> u32 {
    6
}

fn default_font_scale() -> f32 {
    1.0
}

fn clamp_font_scale(v: f32) -> f32 {
    if !v.is_finite() {
        return 1.0;
    }
    if (v - 0.9).abs() < 0.05 {
        return 0.9;
    }
    if (v - 1.1).abs() < 0.05 {
        return 1.1;
    }
    1.0
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum AccueilSortBy {
    #[default]
    Order,
    Name,
    Type,
    Status,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum AccueilSortDir {
    #[default]
    Asc,
    Desc,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum AccueilFilter {
    #[default]
    All,
    Favorites,
    Recent,
    Scripts,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AccueilPrefs {
    #[serde(default)]
    pub default_sort_by: AccueilSortBy,
    #[serde(default)]
    pub default_sort_dir: AccueilSortDir,
    #[serde(default)]
    pub default_filter: AccueilFilter,
    #[serde(default = "default_true")]
    pub remember_collapsed_sections: bool,
    #[serde(default)]
    pub open_on_single_click: bool,
    #[serde(default = "default_true")]
    pub confirm_trash: bool,
    #[serde(default = "default_true")]
    pub confirm_delete_folder: bool,
    #[serde(default = "default_true")]
    pub show_scripts_in_all: bool,
    #[serde(default = "default_true")]
    pub sync_library_sort_on_reorder: bool,
    #[serde(default = "default_double_click_ms")]
    pub double_click_delay_ms: u32,
    #[serde(default = "default_drag_threshold")]
    pub drag_threshold_px: u32,
}

impl Default for AccueilPrefs {
    fn default() -> Self {
        Self {
            default_sort_by: AccueilSortBy::Order,
            default_sort_dir: AccueilSortDir::Asc,
            default_filter: AccueilFilter::All,
            remember_collapsed_sections: true,
            open_on_single_click: false,
            confirm_trash: true,
            confirm_delete_folder: true,
            show_scripts_in_all: true,
            sync_library_sort_on_reorder: true,
            double_click_delay_ms: 300,
            drag_threshold_px: 6,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum StartupView {
    #[default]
    Home,
    LastDocument,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ShellPrefs {
    #[serde(default)]
    pub startup_view: StartupView,
    #[serde(default = "default_true")]
    pub restore_workspace_tabs: bool,
    #[serde(default)]
    pub minimize_to_tray: bool,
    #[serde(default = "default_true")]
    pub show_session_pill: bool,
    #[serde(default = "default_true")]
    pub command_palette_enabled: bool,
    #[serde(default = "default_recent_max")]
    pub recent_list_max: u32,
    #[serde(default = "default_true")]
    pub warn_on_unsaved_quit: bool,
}

impl Default for ShellPrefs {
    fn default() -> Self {
        Self {
            startup_view: StartupView::Home,
            restore_workspace_tabs: true,
            minimize_to_tray: false,
            show_session_pill: true,
            command_palette_enabled: true,
            recent_list_max: 12,
            warn_on_unsaved_quit: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AutomationPrefs {
    #[serde(default)]
    pub confirm_launch_from_home: bool,
    #[serde(default)]
    pub confirm_stop_session: bool,
    #[serde(default = "default_true")]
    pub auto_save_before_run: bool,
    #[serde(default = "default_true")]
    pub run_from_requires_selection: bool,
    #[serde(default)]
    pub focus_follows_run: bool,
    #[serde(default)]
    pub sound_on_finish: bool,
}

impl Default for AutomationPrefs {
    fn default() -> Self {
        Self {
            confirm_launch_from_home: false,
            confirm_stop_session: false,
            auto_save_before_run: true,
            run_from_requires_selection: true,
            focus_follows_run: false,
            sound_on_finish: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ConfirmationsPrefs {
    #[serde(default = "default_true")]
    pub delete_action: bool,
    #[serde(default = "default_true")]
    pub close_dirty_tab: bool,
    #[serde(default = "default_true")]
    pub purge_trash: bool,
    #[serde(default = "default_true")]
    pub reset_clicker: bool,
}

impl Default for ConfirmationsPrefs {
    fn default() -> Self {
        Self {
            delete_action: true,
            close_dirty_tab: true,
            purge_trash: true,
            reset_clicker: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ScriptsPrefs {
    #[serde(default)]
    pub default_timeout_ms: u32,
    #[serde(default)]
    pub clear_console_on_run: bool,
    #[serde(default = "default_true")]
    pub show_perm_badges_on_home: bool,
}

impl Default for ScriptsPrefs {
    fn default() -> Self {
        Self {
            default_timeout_ms: 0,
            clear_console_on_run: false,
            show_perm_badges_on_home: true,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum UiDensity {
    #[default]
    Comfortable,
    Compact,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum AccentTheme {
    #[default]
    Default,
    Blue,
    Teal,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AppearancePrefs {
    #[serde(default)]
    pub density: UiDensity,
    #[serde(default)]
    pub reduce_motion: bool,
    #[serde(default = "default_font_scale")]
    pub font_scale: f32,
    #[serde(default)]
    pub accent: AccentTheme,
}

impl Default for AppearancePrefs {
    fn default() -> Self {
        Self {
            density: UiDensity::Comfortable,
            reduce_motion: false,
            font_scale: 1.0,
            accent: AccentTheme::Default,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MaintenancePrefs {
    /// 0 = off. Hint only in UI (no OS cron in this lot).
    #[serde(default)]
    pub auto_purge_trash_days: u32,
}

impl Default for MaintenancePrefs {
    fn default() -> Self {
        Self {
            auto_purge_trash_days: 0,
        }
    }
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
    #[serde(default)]
    pub accueil: AccueilPrefs,
    #[serde(default)]
    pub shell: ShellPrefs,
    #[serde(default)]
    pub automation: AutomationPrefs,
    #[serde(default)]
    pub confirmations: ConfirmationsPrefs,
    #[serde(default)]
    pub scripts: ScriptsPrefs,
    #[serde(default)]
    pub appearance: AppearancePrefs,
    #[serde(default)]
    pub maintenance: MaintenancePrefs,
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
            accueil: AccueilPrefs::default(),
            shell: ShellPrefs::default(),
            automation: AutomationPrefs::default(),
            confirmations: ConfirmationsPrefs::default(),
            scripts: ScriptsPrefs::default(),
            appearance: AppearancePrefs::default(),
            maintenance: MaintenancePrefs::default(),
        }
    }
}

/// Normalize appearance numeric fields after load/save.
pub fn normalize_app_settings(s: &mut AppSettings) {
    s.overlay_opacity = clamp_overlay_opacity(s.overlay_opacity);
    s.appearance.font_scale = clamp_font_scale(s.appearance.font_scale);
    if s.shell.recent_list_max == 0 {
        s.shell.recent_list_max = 12;
    }
    s.shell.recent_list_max = s.shell.recent_list_max.min(50);
    s.accueil.double_click_delay_ms = s.accueil.double_click_delay_ms.clamp(150, 800);
    s.accueil.drag_threshold_px = s.accueil.drag_threshold_px.clamp(2, 24);
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
    let mut s: AppSettings = serde_json::from_str(&raw)?;
    normalize_app_settings(&mut s);
    Ok(s)
}

pub fn save_settings(dir: impl AsRef<Path>, settings: &AppSettings) -> Result<(), SettingsError> {
    let dir = dir.as_ref();
    fs::create_dir_all(dir)?;
    let mut s = settings.clone();
    normalize_app_settings(&mut s);
    let path = settings_path(dir);
    let raw = serde_json::to_string_pretty(&s)?;
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
    fn legacy_json_gets_nested_defaults() {
        let dir = env::temp_dir().join(format!(
            "caster-settings-legacy-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        let path = settings_path(&dir);
        // Pre-nested-prefs payload: omit accueil/shell/… entirely.
        let mut legacy = serde_json::to_value(AppSettings::default()).unwrap();
        if let Some(obj) = legacy.as_object_mut() {
            obj.remove("accueil");
            obj.remove("shell");
            obj.remove("automation");
            obj.remove("confirmations");
            obj.remove("scripts");
            obj.remove("appearance");
            obj.remove("maintenance");
        }
        fs::write(&path, serde_json::to_string(&legacy).unwrap()).unwrap();
        let loaded = load_settings(&dir).unwrap();
        assert_eq!(loaded.accueil.default_sort_by, AccueilSortBy::Order);
        assert!(loaded.shell.command_palette_enabled);
        assert!(loaded.confirmations.purge_trash);
        assert_eq!(loaded.appearance.density, UiDensity::Comfortable);
        assert_eq!(loaded.scripts.default_timeout_ms, 0);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn nested_prefs_roundtrip() {
        let dir = env::temp_dir().join(format!(
            "caster-settings-nested-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let mut s = AppSettings::default();
        s.accueil.open_on_single_click = true;
        s.shell.startup_view = StartupView::LastDocument;
        s.shell.recent_list_max = 8;
        s.automation.focus_follows_run = true;
        s.appearance.density = UiDensity::Compact;
        s.appearance.accent = AccentTheme::Teal;
        s.appearance.font_scale = 1.1;
        s.maintenance.auto_purge_trash_days = 30;
        save_settings(&dir, &s).unwrap();
        let loaded = load_settings(&dir).unwrap();
        assert!(loaded.accueil.open_on_single_click);
        assert_eq!(loaded.shell.startup_view, StartupView::LastDocument);
        assert_eq!(loaded.shell.recent_list_max, 8);
        assert!(loaded.automation.focus_follows_run);
        assert_eq!(loaded.appearance.density, UiDensity::Compact);
        assert_eq!(loaded.appearance.accent, AccentTheme::Teal);
        assert!((loaded.appearance.font_scale - 1.1).abs() < f32::EPSILON);
        assert_eq!(loaded.maintenance.auto_purge_trash_days, 30);
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
