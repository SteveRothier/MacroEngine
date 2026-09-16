//! Virtual library manifest (folders, lock, trash) for macros and clicker presets.

use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::clicker_presets::{delete_preset, list_presets, presets_dir, PresetError};
use crate::macro_library::{delete_macro, list_macros, macros_dir, MacroLibraryError};

#[derive(Debug, Error)]
pub enum LibraryIndexError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
    #[error("macro: {0}")]
    Macro(#[from] MacroLibraryError),
    #[error("preset: {0}")]
    Preset(#[from] PresetError),
    #[error("{0}")]
    Other(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LibraryKind {
    Macro,
    Clicker,
}

impl LibraryKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Macro => "macro",
            Self::Clicker => "clicker",
        }
    }

    pub fn parse(s: &str) -> Result<Self, LibraryIndexError> {
        match s {
            "macro" => Ok(Self::Macro),
            "clicker" => Ok(Self::Clicker),
            _ => Err(LibraryIndexError::Other(format!("unknown library kind: {s}"))),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryFolder {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryEntryMeta {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub folder_id: Option<String>,
    #[serde(default)]
    pub locked: bool,
    #[serde(default)]
    pub sort_order: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryIndex {
    pub version: u32,
    /// Shared folders for macros and clickers (unified since version 2).
    pub folders: Vec<LibraryFolder>,
    pub entries: HashMap<String, HashMap<String, LibraryEntryMeta>>,
    pub trash: HashMap<String, Vec<String>>,
}

impl Default for LibraryIndex {
    fn default() -> Self {
        Self {
            version: 2,
            folders: Vec::new(),
            entries: HashMap::from([
                ("macro".into(), HashMap::new()),
                ("clicker".into(), HashMap::new()),
            ]),
            trash: HashMap::from([
                ("macro".into(), Vec::new()),
                ("clicker".into(), Vec::new()),
            ]),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryItemDto {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub folder_id: Option<String>,
    pub locked: bool,
    pub trashed: bool,
    pub updated_at: u64,
    pub meta: Option<String>,
    #[serde(default)]
    pub sort_order: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryIndexDto {
    pub folders: Vec<LibraryFolder>,
    pub items: Vec<LibraryItemDto>,
    pub trash: Vec<String>,
}

pub fn library_path(config_dir: &Path) -> PathBuf {
    config_dir.join("library.json")
}

pub fn load_index(config_dir: &Path) -> Result<LibraryIndex, LibraryIndexError> {
    let path = library_path(config_dir);
    if !path.exists() {
        return Ok(LibraryIndex::default());
    }
    let raw = fs::read_to_string(&path)?;
    let value: serde_json::Value = serde_json::from_str(&raw)?;
    let (mut idx, dirty) = index_from_value(value)?;
    for key in ["macro", "clicker"] {
        idx.entries.entry(key.into()).or_default();
        idx.trash.entry(key.into()).or_default();
    }
    if dirty {
        save_index(config_dir, &idx)?;
    }
    Ok(idx)
}

/// Parse library.json, migrating v1 per-kind folders into a unified list when needed.
/// Returns `(index, dirty)` — dirty means the on-disk file should be rewritten.
fn index_from_value(
    value: serde_json::Value,
) -> Result<(LibraryIndex, bool), LibraryIndexError> {
    let version = value
        .get("version")
        .and_then(|v| v.as_u64())
        .unwrap_or(1) as u32;
    let entries: HashMap<String, HashMap<String, LibraryEntryMeta>> = value
        .get("entries")
        .cloned()
        .map(serde_json::from_value)
        .transpose()?
        .unwrap_or_default();
    let trash: HashMap<String, Vec<String>> = value
        .get("trash")
        .cloned()
        .map(serde_json::from_value)
        .transpose()?
        .unwrap_or_default();
    let folders_val = value.get("folders").cloned().unwrap_or(serde_json::Value::Null);

    if folders_val.is_array() {
        let folders: Vec<LibraryFolder> = serde_json::from_value(folders_val)?;
        let mut idx = LibraryIndex {
            version: version.max(2),
            folders,
            entries,
            trash,
        };
        let dirty = version < 2;
        if dirty {
            idx.version = 2;
        }
        return Ok((idx, dirty));
    }

    // v1: folders keyed by kind
    let legacy: HashMap<String, Vec<LibraryFolder>> = if folders_val.is_object() {
        serde_json::from_value(folders_val)?
    } else {
        HashMap::new()
    };
    let (folders, remap) = unify_legacy_folders(&legacy);
    let mut entries = entries;
    apply_folder_id_remap(&mut entries, &remap);
    Ok((
        LibraryIndex {
            version: 2,
            folders,
            entries,
            trash,
        },
        true,
    ))
}

/// Merge per-kind folders by case-insensitive name. Returns unified list + id remap
/// (old id → canonical id when duplicates are collapsed).
fn unify_legacy_folders(
    legacy: &HashMap<String, Vec<LibraryFolder>>,
) -> (Vec<LibraryFolder>, HashMap<String, String>) {
    let mut folders: Vec<LibraryFolder> = Vec::new();
    let mut by_name: HashMap<String, String> = HashMap::new();
    let mut remap: HashMap<String, String> = HashMap::new();
    for key in ["macro", "clicker"] {
        let Some(list) = legacy.get(key) else {
            continue;
        };
        for folder in list {
            let name_key = folder.name.to_ascii_lowercase();
            if let Some(canon_id) = by_name.get(&name_key) {
                if canon_id != &folder.id {
                    remap.insert(folder.id.clone(), canon_id.clone());
                }
            } else {
                by_name.insert(name_key, folder.id.clone());
                folders.push(folder.clone());
            }
        }
    }
    (folders, remap)
}

fn apply_folder_id_remap(
    entries: &mut HashMap<String, HashMap<String, LibraryEntryMeta>>,
    remap: &HashMap<String, String>,
) {
    if remap.is_empty() {
        return;
    }
    for kind_entries in entries.values_mut() {
        for meta in kind_entries.values_mut() {
            if let Some(fid) = meta.folder_id.as_ref() {
                if let Some(canon) = remap.get(fid) {
                    meta.folder_id = Some(canon.clone());
                }
            }
        }
    }
}

pub fn save_index(config_dir: &Path, index: &LibraryIndex) -> Result<(), LibraryIndexError> {
    let path = library_path(config_dir);
    let raw = serde_json::to_string_pretty(index)?;
    fs::write(path, raw)?;
    Ok(())
}

fn kind_key(kind: LibraryKind) -> &'static str {
    kind.as_str()
}

fn file_mtime(path: &Path) -> u64 {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .unwrap_or(UNIX_EPOCH)
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn list_disk_ids(config_dir: &Path, kind: LibraryKind) -> Result<Vec<String>, LibraryIndexError> {
    Ok(match kind {
        LibraryKind::Macro => list_macros(config_dir)?,
        LibraryKind::Clicker => list_presets(config_dir)?,
    })
}

fn disk_path(config_dir: &Path, kind: LibraryKind, id: &str) -> PathBuf {
    match kind {
        LibraryKind::Macro => macros_dir(config_dir).join(format!("{id}.json")),
        LibraryKind::Clicker => presets_dir(config_dir).join(format!("{id}.json")),
    }
}

fn entry_meta(index: &LibraryIndex, kind: LibraryKind, id: &str) -> LibraryEntryMeta {
    index
        .entries
        .get(kind_key(kind))
        .and_then(|m| m.get(id))
        .cloned()
        .unwrap_or_default()
}

fn is_trashed(index: &LibraryIndex, kind: LibraryKind, id: &str) -> bool {
    index
        .trash
        .get(kind_key(kind))
        .is_some_and(|t| t.iter().any(|x| x == id))
}

pub fn entry_meta_for(index: &LibraryIndex, kind: LibraryKind, id: &str) -> LibraryEntryMeta {
    entry_meta(index, kind, id)
}

pub fn is_trashed_for(index: &LibraryIndex, kind: LibraryKind, id: &str) -> bool {
    is_trashed(index, kind, id)
}

pub fn enrich_macro_summaries(
    config_dir: &Path,
    summaries: &mut Vec<crate::macro_library::MacroSummary>,
) -> Result<(), LibraryIndexError> {
    let index = load_index(config_dir)?;
    for s in summaries.iter_mut() {
        let meta = entry_meta(&index, LibraryKind::Macro, &s.name);
        s.folder_id = meta.folder_id;
        s.locked = meta.locked;
    }
    summaries.retain(|s| !is_trashed(&index, LibraryKind::Macro, &s.name));
    Ok(())
}

pub fn is_locked(config_dir: &Path, kind: LibraryKind, id: &str) -> Result<bool, LibraryIndexError> {
    let index = load_index(config_dir)?;
    Ok(entry_meta(&index, kind, id).locked)
}

pub fn assert_not_locked(
    config_dir: &Path,
    kind: LibraryKind,
    id: &str,
) -> Result<(), LibraryIndexError> {
    if is_locked(config_dir, kind, id)? {
        return Err(LibraryIndexError::Other(format!(
            "« {id} » est verrouillé"
        )));
    }
    Ok(())
}

fn prune_orphans(index: &mut LibraryIndex, config_dir: &Path) -> Result<(), LibraryIndexError> {
    for kind in [LibraryKind::Macro, LibraryKind::Clicker] {
        let key = kind_key(kind);
        let disk = list_disk_ids(config_dir, kind)?;
        let disk_set: HashSet<_> = disk.iter().collect();
        if let Some(entries) = index.entries.get_mut(key) {
            entries.retain(|id, _| disk_set.contains(id));
        }
        if let Some(trash) = index.trash.get_mut(key) {
            trash.retain(|id| disk_set.contains(id));
        }
    }
    Ok(())
}

pub fn get_library_index(
    config_dir: &Path,
    kind: LibraryKind,
) -> Result<LibraryIndexDto, LibraryIndexError> {
    let mut index = load_index(config_dir)?;
    prune_orphans(&mut index, config_dir)?;
    save_index(config_dir, &index)?;
    build_dto(&index, config_dir, kind, None, None, false)
}

#[derive(Debug, Clone, Default)]
pub struct ListLibraryQuery {
    pub folder_id: Option<String>,
    pub query: Option<String>,
    pub include_trash: bool,
    pub favorites_only: bool,
    pub favorite_ids: Vec<String>,
}

pub fn list_library_items(
    config_dir: &Path,
    kind: LibraryKind,
    q: ListLibraryQuery,
) -> Result<LibraryIndexDto, LibraryIndexError> {
    let mut index = load_index(config_dir)?;
    prune_orphans(&mut index, config_dir)?;
    save_index(config_dir, &index)?;
    build_dto(
        &index,
        config_dir,
        kind,
        q.folder_id.as_deref(),
        q.query.as_deref(),
        q.include_trash,
    )
    .map(|mut dto| {
        if q.favorites_only {
            let fav: HashSet<_> = q.favorite_ids.iter().collect();
            dto.items.retain(|i| fav.contains(&i.id));
        }
        dto
    })
}

fn build_dto(
    index: &LibraryIndex,
    config_dir: &Path,
    kind: LibraryKind,
    folder_filter: Option<&str>,
    query: Option<&str>,
    include_trash: bool,
) -> Result<LibraryIndexDto, LibraryIndexError> {
    let key = kind_key(kind);
    let folders = index.folders.clone();
    let trash = index.trash.get(key).cloned().unwrap_or_default();
    let q_lower = query.map(|s| s.trim().to_lowercase()).filter(|s| !s.is_empty());

    let mut items = Vec::new();
    for id in list_disk_ids(config_dir, kind)? {
        let trashed = is_trashed(index, kind, &id);
        if trashed && !include_trash {
            continue;
        }
        if !trashed && include_trash {
            continue;
        }
        let meta = entry_meta(index, kind, &id);
        if let Some(fid) = folder_filter {
            if fid == "__trash" {
                if !trashed {
                    continue;
                }
            } else if fid != "__all" && fid != "__favorites" {
                if meta.folder_id.as_deref() != Some(fid) {
                    continue;
                }
            }
        }
        let name = id.clone();
        if let Some(ref q) = q_lower {
            if !name.to_lowercase().contains(q) {
                continue;
            }
        }
        let updated_at = file_mtime(&disk_path(config_dir, kind, &id));
        items.push(LibraryItemDto {
            id: id.clone(),
            name,
            kind: key.to_string(),
            folder_id: meta.folder_id,
            locked: meta.locked,
            trashed,
            updated_at,
            meta: None,
            sort_order: meta.sort_order,
        });
    }
    items.sort_by(|a, b| {
        a.sort_order
            .cmp(&b.sort_order)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(LibraryIndexDto {
        folders,
        items,
        trash,
    })
}

fn new_folder_id() -> String {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    format!("f{stamp:x}")
}

pub fn create_library_folder(
    config_dir: &Path,
    _kind: LibraryKind,
    name: String,
    parent_id: Option<String>,
) -> Result<LibraryFolder, LibraryIndexError> {
    let trimmed = name.trim();
    if trimmed.is_empty() || trimmed.len() > 64 {
        return Err(LibraryIndexError::Other("nom de dossier invalide".into()));
    }
    let mut index = load_index(config_dir)?;
    if index
        .folders
        .iter()
        .any(|f| f.name.eq_ignore_ascii_case(trimmed))
    {
        return Err(LibraryIndexError::Other(format!(
            "dossier « {trimmed} » existe déjà"
        )));
    }
    if let Some(ref pid) = parent_id {
        if !index.folders.iter().any(|f| &f.id == pid) {
            return Err(LibraryIndexError::Other("dossier parent introuvable".into()));
        }
    }
    let folder = LibraryFolder {
        id: new_folder_id(),
        name: trimmed.to_string(),
        parent_id,
    };
    index.folders.push(folder.clone());
    save_index(config_dir, &index)?;
    Ok(folder)
}

pub fn rename_library_folder(
    config_dir: &Path,
    _kind: LibraryKind,
    id: String,
    name: String,
) -> Result<LibraryFolder, LibraryIndexError> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(LibraryIndexError::Other("nom de dossier invalide".into()));
    }
    let mut index = load_index(config_dir)?;
    if index
        .folders
        .iter()
        .any(|f| f.id != id && f.name.eq_ignore_ascii_case(trimmed))
    {
        return Err(LibraryIndexError::Other(format!(
            "dossier « {trimmed} » existe déjà"
        )));
    }
    let folder = index
        .folders
        .iter_mut()
        .find(|f| f.id == id)
        .ok_or_else(|| LibraryIndexError::Other("dossier introuvable".into()))?;
    folder.name = trimmed.to_string();
    let out = folder.clone();
    save_index(config_dir, &index)?;
    Ok(out)
}

pub fn delete_library_folder(
    config_dir: &Path,
    _kind: LibraryKind,
    id: String,
) -> Result<(), LibraryIndexError> {
    let mut index = load_index(config_dir)?;
    if !index.folders.iter().any(|f| f.id == id) {
        return Err(LibraryIndexError::Other("dossier introuvable".into()));
    }
    index.folders.retain(|f| f.id != id);
    for key in ["macro", "clicker"] {
        if let Some(entries) = index.entries.get_mut(key) {
            for meta in entries.values_mut() {
                if meta.folder_id.as_deref() == Some(id.as_str()) {
                    meta.folder_id = None;
                }
            }
        }
    }
    save_index(config_dir, &index)?;
    Ok(())
}

fn set_entry(
    index: &mut LibraryIndex,
    kind: LibraryKind,
    id: &str,
    meta: LibraryEntryMeta,
) {
    index
        .entries
        .entry(kind_key(kind).to_string())
        .or_default()
        .insert(id.to_string(), meta);
}

pub fn move_library_item(
    config_dir: &Path,
    kind: LibraryKind,
    id: String,
    folder_id: Option<String>,
    before_id: Option<String>,
) -> Result<(), LibraryIndexError> {
    let disk_ids = list_disk_ids(config_dir, kind)?;
    disk_ids
        .iter()
        .find(|x| **x == id)
        .ok_or_else(|| LibraryIndexError::Other(format!("élément introuvable: {id}")))?;
    if let Some(ref bid) = before_id {
        if bid == &id {
            return Ok(());
        }
        if !disk_ids.iter().any(|x| x == bid) {
            return Err(LibraryIndexError::Other(format!(
                "élément cible introuvable: {bid}"
            )));
        }
    }
    if let Some(ref fid) = folder_id {
        let index = load_index(config_dir)?;
        if !index.folders.iter().any(|f| f.id == *fid) {
            return Err(LibraryIndexError::Other("dossier introuvable".into()));
        }
    }

    let mut index = load_index(config_dir)?;
    let key = kind_key(kind);

    // Sibling ids in the target folder (non-trashed), current order.
    let trash: HashSet<String> = index
        .trash
        .get(key)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .collect();
    let mut siblings: Vec<String> = disk_ids
        .into_iter()
        .filter(|sid| !trash.contains(sid))
        .filter(|sid| {
            let meta = entry_meta(&index, kind, sid);
            meta.folder_id == folder_id
        })
        .collect();
    siblings.sort_by(|a, b| {
        let ma = entry_meta(&index, kind, a);
        let mb = entry_meta(&index, kind, b);
        ma.sort_order
            .cmp(&mb.sort_order)
            .then_with(|| a.to_lowercase().cmp(&b.to_lowercase()))
    });
    siblings.retain(|sid| sid != &id);

    let insert_at = match &before_id {
        Some(bid) => siblings.iter().position(|s| s == bid).unwrap_or(siblings.len()),
        None => siblings.len(),
    };
    siblings.insert(insert_at, id.clone());

    // Apply folder + contiguous sort_order for all siblings in target.
    for (i, sid) in siblings.iter().enumerate() {
        let mut meta = entry_meta(&index, kind, sid);
        meta.folder_id = folder_id.clone();
        meta.sort_order = i as i32;
        set_entry(&mut index, kind, sid, meta);
    }

    save_index(config_dir, &index)?;
    Ok(())
}

pub fn set_library_item_locked(
    config_dir: &Path,
    kind: LibraryKind,
    id: String,
    locked: bool,
) -> Result<(), LibraryIndexError> {
    list_disk_ids(config_dir, kind)?
        .iter()
        .find(|x| **x == id)
        .ok_or_else(|| LibraryIndexError::Other(format!("élément introuvable: {id}")))?;
    let mut index = load_index(config_dir)?;
    let mut meta = entry_meta(&index, kind, &id);
    meta.locked = locked;
    set_entry(&mut index, kind, &id, meta);
    save_index(config_dir, &index)?;
    Ok(())
}

pub fn trash_library_item(
    config_dir: &Path,
    kind: LibraryKind,
    id: String,
) -> Result<(), LibraryIndexError> {
    list_disk_ids(config_dir, kind)?
        .iter()
        .find(|x| **x == id)
        .ok_or_else(|| LibraryIndexError::Other(format!("élément introuvable: {id}")))?;
    let mut index = load_index(config_dir)?;
    let trash = index.trash.entry(kind_key(kind).to_string()).or_default();
    if !trash.iter().any(|x| x == &id) {
        trash.push(id);
    }
    save_index(config_dir, &index)?;
    Ok(())
}

/// Permanently delete every trashed library item (disk + index).
pub fn purge_library_trash(config_dir: &Path) -> Result<usize, LibraryIndexError> {
    let mut index = load_index(config_dir)?;
    let mut n = 0usize;
    for kind in [LibraryKind::Macro, LibraryKind::Clicker] {
        let key = kind_key(kind).to_string();
        let ids = index.trash.get(&key).cloned().unwrap_or_default();
        for id in ids {
            match kind {
                LibraryKind::Macro => {
                    let _ = delete_macro(config_dir, &id);
                }
                LibraryKind::Clicker => {
                    let _ = delete_preset(config_dir, &id);
                }
            }
            if let Some(entries) = index.entries.get_mut(&key) {
                entries.remove(&id);
            }
            n += 1;
        }
        if let Some(trash) = index.trash.get_mut(&key) {
            trash.clear();
        }
    }
    save_index(config_dir, &index)?;
    Ok(n)
}

pub fn restore_library_item(
    config_dir: &Path,
    kind: LibraryKind,
    id: String,
) -> Result<(), LibraryIndexError> {
    let mut index = load_index(config_dir)?;
    let trash = index.trash.entry(kind_key(kind).to_string()).or_default();
    trash.retain(|x| x != &id);
    save_index(config_dir, &index)?;
    Ok(())
}

pub fn rename_library_entry_key(
    config_dir: &Path,
    kind: LibraryKind,
    from: &str,
    to: &str,
) -> Result<(), LibraryIndexError> {
    let mut index = load_index(config_dir)?;
    let key = kind_key(kind);
    if let Some(entries) = index.entries.get_mut(key) {
        if let Some(meta) = entries.remove(from) {
            entries.insert(to.to_string(), meta);
        }
    }
    if let Some(trash) = index.trash.get_mut(key) {
        for slot in trash.iter_mut() {
            if slot == from {
                *slot = to.to_string();
            }
        }
    }
    save_index(config_dir, &index)?;
    Ok(())
}

pub fn remove_library_entry(
    config_dir: &Path,
    kind: LibraryKind,
    id: &str,
) -> Result<(), LibraryIndexError> {
    let mut index = load_index(config_dir)?;
    let key = kind_key(kind);
    if let Some(entries) = index.entries.get_mut(key) {
        entries.remove(id);
    }
    if let Some(trash) = index.trash.get_mut(key) {
        trash.retain(|x| x != id);
    }
    save_index(config_dir, &index)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::macro_library::create_macro;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir() -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("me-lib-{stamp}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn locked_blocks_assert_not_locked() {
        let dir = temp_dir();
        create_macro(&dir, Some("LockedDemo")).unwrap();
        set_library_item_locked(&dir, LibraryKind::Macro, "LockedDemo".into(), true)
            .unwrap();
        let err = assert_not_locked(&dir, LibraryKind::Macro, "LockedDemo").unwrap_err();
        assert!(
            err.to_string().contains("verrouillé"),
            "expected locked error, got {err}"
        );
        set_library_item_locked(&dir, LibraryKind::Macro, "LockedDemo".into(), false)
            .unwrap();
        assert_not_locked(&dir, LibraryKind::Macro, "LockedDemo").unwrap();
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn folder_move_lock_trash() {
        let dir = temp_dir();
        create_macro(&dir, Some("Demo")).unwrap();
        let folder = create_library_folder(&dir, LibraryKind::Macro, "Scripts".into(), None).unwrap();
        move_library_item(
            &dir,
            LibraryKind::Macro,
            "Demo".into(),
            Some(folder.id.clone()),
            None,
        )
            .unwrap();
        set_library_item_locked(&dir, LibraryKind::Macro, "Demo".into(), true).unwrap();
        assert!(is_locked(&dir, LibraryKind::Macro, "Demo").unwrap());
        trash_library_item(&dir, LibraryKind::Macro, "Demo".into()).unwrap();
        let dto = list_library_items(
            &dir,
            LibraryKind::Macro,
            ListLibraryQuery {
                include_trash: true,
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(dto.items.len(), 1);
        assert!(dto.items[0].trashed);
        restore_library_item(&dir, LibraryKind::Macro, "Demo".into()).unwrap();
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn reorder_within_folder() {
        let dir = temp_dir();
        create_macro(&dir, Some("A")).unwrap();
        create_macro(&dir, Some("B")).unwrap();
        create_macro(&dir, Some("C")).unwrap();
        let folder =
            create_library_folder(&dir, LibraryKind::Macro, "Pack".into(), None).unwrap();
        move_library_item(
            &dir,
            LibraryKind::Macro,
            "A".into(),
            Some(folder.id.clone()),
            None,
        )
        .unwrap();
        move_library_item(
            &dir,
            LibraryKind::Macro,
            "B".into(),
            Some(folder.id.clone()),
            None,
        )
        .unwrap();
        move_library_item(
            &dir,
            LibraryKind::Macro,
            "C".into(),
            Some(folder.id.clone()),
            None,
        )
        .unwrap();
        move_library_item(
            &dir,
            LibraryKind::Macro,
            "C".into(),
            Some(folder.id.clone()),
            Some("A".into()),
        )
        .unwrap();
        let dto = get_library_index(&dir, LibraryKind::Macro).unwrap();
        let ids: Vec<_> = dto
            .items
            .iter()
            .filter(|i| i.folder_id.as_deref() == Some(folder.id.as_str()))
            .map(|i| i.id.as_str())
            .collect();
        assert_eq!(ids, vec!["C", "A", "B"]);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn delete_library_folder_unassigns_items() {
        let dir = temp_dir();
        create_macro(&dir, Some("Demo")).unwrap();
        let folder =
            create_library_folder(&dir, LibraryKind::Macro, "Pack".into(), None).unwrap();
        move_library_item(
            &dir,
            LibraryKind::Macro,
            "Demo".into(),
            Some(folder.id.clone()),
            None,
        )
        .unwrap();
        delete_library_folder(&dir, LibraryKind::Macro, folder.id.clone()).unwrap();
        let dto = get_library_index(&dir, LibraryKind::Macro).unwrap();
        assert!(dto.folders.iter().all(|f| f.id != folder.id));
        let item = dto.items.iter().find(|i| i.id == "Demo").unwrap();
        assert!(item.folder_id.is_none());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn unified_folders_shared_across_kinds() {
        let dir = temp_dir();
        create_macro(&dir, Some("M1")).unwrap();
        let folder =
            create_library_folder(&dir, LibraryKind::Macro, "Shared".into(), None).unwrap();
        // Same name must fail globally (even for clicker kind arg).
        let err = create_library_folder(&dir, LibraryKind::Clicker, "shared".into(), None)
            .unwrap_err();
        assert!(err.to_string().contains("existe déjà"));
        move_library_item(
            &dir,
            LibraryKind::Macro,
            "M1".into(),
            Some(folder.id.clone()),
            None,
        )
        .unwrap();
        let macro_dto = get_library_index(&dir, LibraryKind::Macro).unwrap();
        let clicker_dto = get_library_index(&dir, LibraryKind::Clicker).unwrap();
        assert_eq!(macro_dto.folders.len(), 1);
        assert_eq!(clicker_dto.folders.len(), 1);
        assert_eq!(macro_dto.folders[0].id, clicker_dto.folders[0].id);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn migrate_v1_merges_same_name_folders() {
        let dir = temp_dir();
        let path = library_path(&dir);
        let raw = r#"{
          "version": 1,
          "folders": {
            "macro": [{"id": "fm1", "name": "Pack"}],
            "clicker": [{"id": "fc1", "name": "pack"}]
          },
          "entries": {
            "macro": {"M1": {"folderId": "fm1", "locked": false, "sortOrder": 0}},
            "clicker": {"C1": {"folderId": "fc1", "locked": false, "sortOrder": 0}}
          },
          "trash": {"macro": [], "clicker": []}
        }"#;
        fs::write(&path, raw).unwrap();
        let idx = load_index(&dir).unwrap();
        assert_eq!(idx.version, 2);
        assert_eq!(idx.folders.len(), 1);
        assert_eq!(idx.folders[0].id, "fm1");
        assert_eq!(
            idx.entries["macro"]["M1"].folder_id.as_deref(),
            Some("fm1")
        );
        assert_eq!(
            idx.entries["clicker"]["C1"].folder_id.as_deref(),
            Some("fm1")
        );
        // Persisted as unified array
        let saved: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        assert!(saved["folders"].is_array());
        let _ = fs::remove_dir_all(&dir);
    }
}
