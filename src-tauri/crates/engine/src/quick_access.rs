//! Favorites + recently executed clicker presets / macros.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use thiserror::Error;

pub const MAX_RECENT: usize = 12;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum QuickKind {
    Clicker,
    Macro,
    Script,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RecentRunStatus {
    Ok,
    Error,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RecentEntry {
    pub kind: QuickKind,
    pub id: String,
    pub at: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<RecentRunStatus>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct Favorites {
    #[serde(default)]
    pub clicker_presets: Vec<String>,
    #[serde(default)]
    pub macros: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct QuickAccess {
    #[serde(default)]
    pub favorites: Favorites,
    #[serde(default)]
    pub recent: Vec<RecentEntry>,
}

#[derive(Debug, Error)]
pub enum QuickAccessError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
    #[error("invalid kind")]
    InvalidKind,
}

pub fn quick_access_path(dir: impl AsRef<Path>) -> PathBuf {
    dir.as_ref().join("quick-access.json")
}

pub fn load_quick_access(dir: impl AsRef<Path>) -> Result<QuickAccess, QuickAccessError> {
    let path = quick_access_path(dir);
    if !path.exists() {
        return Ok(QuickAccess::default());
    }
    let raw = fs::read_to_string(path)?;
    Ok(serde_json::from_str(&raw)?)
}

pub fn save_quick_access(
    dir: impl AsRef<Path>,
    data: &QuickAccess,
) -> Result<(), QuickAccessError> {
    let dir = dir.as_ref();
    fs::create_dir_all(dir)?;
    let path = quick_access_path(dir);
    let raw = serde_json::to_string_pretty(data)?;
    fs::write(path, raw)?;
    Ok(())
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn push_recent(
    dir: impl AsRef<Path>,
    kind: QuickKind,
    id: &str,
) -> Result<QuickAccess, QuickAccessError> {
    let id = id.trim();
    if id.is_empty() {
        return load_quick_access(dir);
    }
    let mut data = load_quick_access(&dir)?;
    data.recent.retain(|e| !(e.kind == kind && e.id == id));
    data.recent.insert(
        0,
        RecentEntry {
            kind,
            id: id.to_string(),
            at: now_ms(),
            status: None,
            duration_ms: None,
        },
    );
    data.recent.truncate(MAX_RECENT);
    save_quick_access(&dir, &data)?;
    Ok(data)
}

/// Update the most recent matching entry with run outcome (status + duration).
pub fn finalize_recent(
    dir: impl AsRef<Path>,
    kind: QuickKind,
    id: &str,
    status: RecentRunStatus,
    duration_ms: u64,
) -> Result<QuickAccess, QuickAccessError> {
    let id = id.trim();
    if id.is_empty() {
        return load_quick_access(dir);
    }
    let mut data = load_quick_access(&dir)?;
    if let Some(entry) = data.recent.iter_mut().find(|e| e.kind == kind && e.id == id) {
        entry.status = Some(status);
        entry.duration_ms = Some(duration_ms);
        entry.at = now_ms();
    } else {
        data.recent.insert(
            0,
            RecentEntry {
                kind,
                id: id.to_string(),
                at: now_ms(),
                status: Some(status),
                duration_ms: Some(duration_ms),
            },
        );
        data.recent.truncate(MAX_RECENT);
    }
    save_quick_access(&dir, &data)?;
    Ok(data)
}

pub fn set_favorite(
    dir: impl AsRef<Path>,
    kind: QuickKind,
    id: &str,
    favorite: bool,
) -> Result<QuickAccess, QuickAccessError> {
    let id = id.trim();
    if id.is_empty() {
        return Err(QuickAccessError::InvalidKind);
    }
    let mut data = load_quick_access(&dir)?;
    let list = match kind {
        QuickKind::Clicker => &mut data.favorites.clicker_presets,
        QuickKind::Macro => &mut data.favorites.macros,
        QuickKind::Script => return Err(QuickAccessError::InvalidKind),
    };
    list.retain(|n| n != id);
    if favorite {
        list.push(id.to_string());
    }
    save_quick_access(&dir, &data)?;
    Ok(data)
}

pub const SYNTHETIC_CLICKER_ID: &str = "Config actuelle";

/// Drop favorites/recents whose target no longer exists.
pub fn prune_orphans(
    data: &mut QuickAccess,
    clicker_ids: &[String],
    macro_ids: &[String],
    script_ids: &[String],
) -> bool {
    let before = data.clone();
    data.favorites.clicker_presets.retain(|id| {
        id == SYNTHETIC_CLICKER_ID || clicker_ids.iter().any(|n| n == id)
    });
    data.favorites
        .macros
        .retain(|id| macro_ids.iter().any(|n| n == id));
    data.recent.retain(|e| match e.kind {
        QuickKind::Clicker => {
            e.id == SYNTHETIC_CLICKER_ID || clicker_ids.iter().any(|n| n == &e.id)
        }
        QuickKind::Macro => macro_ids.iter().any(|n| n == &e.id),
        QuickKind::Script => script_ids.iter().any(|n| n == &e.id),
    });
    before != *data
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    fn temp_dir() -> PathBuf {
        env::temp_dir().join(format!(
            "me-qa-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    #[test]
    fn favorites_and_recent_roundtrip() {
        let dir = temp_dir();
        let _ = fs::create_dir_all(&dir);
        set_favorite(&dir, QuickKind::Clicker, "fast", true).unwrap();
        set_favorite(&dir, QuickKind::Macro, "demo", true).unwrap();
        push_recent(&dir, QuickKind::Macro, "demo").unwrap();
        push_recent(&dir, QuickKind::Clicker, "fast").unwrap();
        push_recent(&dir, QuickKind::Macro, "demo").unwrap();
        finalize_recent(&dir, QuickKind::Macro, "demo", RecentRunStatus::Ok, 42).unwrap();
        let loaded = load_quick_access(&dir).unwrap();
        assert_eq!(loaded.favorites.clicker_presets, vec!["fast"]);
        assert_eq!(loaded.favorites.macros, vec!["demo"]);
        assert_eq!(loaded.recent.len(), 2);
        assert_eq!(loaded.recent[0].id, "demo");
        assert_eq!(loaded.recent[0].kind, QuickKind::Macro);
        assert_eq!(loaded.recent[0].status, Some(RecentRunStatus::Ok));
        assert_eq!(loaded.recent[0].duration_ms, Some(42));
        assert_eq!(loaded.recent[1].id, "fast");
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn prune_drops_missing_ids() {
        let mut qa = QuickAccess {
            favorites: Favorites {
                clicker_presets: vec!["gone".into(), "keep".into()],
                macros: vec!["old".into(), "live".into()],
            },
            recent: vec![
                RecentEntry {
                    kind: QuickKind::Clicker,
                    id: "gone".into(),
                    at: 1,
                    status: None,
                    duration_ms: None,
                },
                RecentEntry {
                    kind: QuickKind::Macro,
                    id: "live".into(),
                    at: 2,
                    status: Some(RecentRunStatus::Ok),
                    duration_ms: Some(120),
                },
            ],
        };
        assert!(prune_orphans(
            &mut qa,
            &["keep".into()],
            &["live".into()],
            &[],
        ));
        assert_eq!(qa.favorites.clicker_presets, vec!["keep".to_string()]);
        assert_eq!(qa.favorites.macros, vec!["live".to_string()]);
        assert_eq!(qa.recent.len(), 1);
        assert_eq!(qa.recent[0].id, "live");
    }

    #[test]
    fn script_recent_roundtrip_and_prune() {
        let dir = temp_dir();
        let _ = fs::create_dir_all(&dir);
        push_recent(&dir, QuickKind::Script, "s1").unwrap();
        let loaded = load_quick_access(&dir).unwrap();
        assert_eq!(loaded.recent.len(), 1);
        assert_eq!(loaded.recent[0].kind, QuickKind::Script);
        let mut qa = loaded;
        assert!(prune_orphans(&mut qa, &[], &[], &[]));
        assert!(qa.recent.is_empty());
        let _ = fs::remove_dir_all(dir);
    }
}
