use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use caster_engine::{
    assert_not_locked, create_library_folder, create_macro, delete_library_folder, delete_macro,
    delete_preset, delete_script, duplicate_macro, duplicate_preset, enrich_macro_summaries,
    export_preset_to_path, get_library_index, import_preset_from_path, list_library_items,
    list_macro_summaries, list_macros, list_preset_summaries, list_presets, list_scripts,
    load_macro, load_preset, load_quick_access, load_script, load_settings, load_accueil_order,
    list_visible_process_exes, macro_to_json, move_library_item, overlay_bands, parse_macro_json,
    prune_orphans, purge_library_trash, remove_library_entry, rename_library_entry_key,
    rename_library_folder, rename_macro, rename_preset, restore_library_item, save_macro_checked,
    save_preset, save_preset_with_trigger, save_quick_access, save_script, save_settings,
    save_accueil_order, set_favorite, set_library_item_locked, trash_library_item,
    normalize_app_settings, AccueilPrefs, AppearancePrefs, AppSettings, AppState, AutomationPrefs,
    ClickerConfig, ClickerMetrics, ClickerPreset, ClickerPresetSummary, ConfirmationsPrefs,
    DrawnRect, EngineEvent, EngineState, HotkeyBindings, LibraryFolder, LibraryIndexDto,
    LibraryKind, ListLibraryQuery, MacroDocument, MacroSummary, MaintenancePrefs,
    NativeZoneOverlay, PickedPoint, ProcessFilter, QuickAccess, QuickKind, RecordOptions,
    ScreenGeom, ScreenGeomDto, ScriptDoc, ScriptsPrefs, ShellPrefs, StopZone, ThemeMode, Trigger,
    UiLocale, WindowBounds, clamp_overlay_opacity, settings_path,
};
use serde::{Deserialize, Serialize};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    window::Color,
    AppHandle, Emitter, Manager, State, WindowEvent,
};
use tauri_plugin_log::{Target, TargetKind};

struct SettingsDir(PathBuf);

struct UiPrefs {
    advanced_ui: bool,
    overlay_visible: bool,
    overlay_opacity: f32,
    process_filter: ProcessFilter,
    theme: ThemeMode,
    display_id: Option<String>,
    sidebar_collapsed: bool,
    journal_open: bool,
    close_to_tray: bool,
    start_with_windows: bool,
    accueil: AccueilPrefs,
    shell: ShellPrefs,
    automation: AutomationPrefs,
    confirmations: ConfirmationsPrefs,
    scripts: ScriptsPrefs,
    appearance: AppearancePrefs,
    maintenance: MaintenancePrefs,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppPathsDto {
    config_dir: String,
    settings_path: String,
    log_dir: String,
    version: String,
    accueil_order_path: String,
    library_path: String,
    quick_access_path: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DisplayDto {
    id: String,
    label: String,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
    scale_factor: f64,
    is_primary: bool,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ZoneOverlaySnap {
    visible: bool,
    drawing: bool,
    geom: ScreenGeomDto,
    zones: Vec<StopZone>,
}

impl Default for ZoneOverlaySnap {
    fn default() -> Self {
        Self {
            visible: false,
            drawing: false,
            geom: ScreenGeomDto::default(),
            zones: Vec::new(),
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct EngineStatusPayload {
    state: EngineState,
    cancelled: bool,
    message: Option<String>,
    session_kind: Option<String>,
    session_name: Option<String>,
}

#[tauri::command]
fn start_clicker(
    app: AppHandle,
    engine: State<'_, AppState>,
    request: ClickerConfig,
) -> Result<EngineStatusPayload, String> {
    engine.start_clicker(request)?;
    persist(&app, &engine);
    Ok(status_of(&engine, Some("running".into())))
}

#[tauri::command]
fn pick_point(engine: State<'_, AppState>) -> Result<PickedPoint, String> {
    // Legacy delay pick (kept for callers that do not use the overlay).
    engine.pick_point_after(Duration::from_secs(2))
}

#[tauri::command]
fn show_screen_picker(app: AppHandle, engine: State<'_, AppState>) -> Result<(), String> {
    engine.set_picking(true);
    match show_picker_inner(&app) {
        Ok(()) => Ok(()),
        Err(e) => {
            engine.set_picking(false);
            Err(e)
        }
    }
}

#[tauri::command]
fn confirm_screen_pick(app: AppHandle, engine: State<'_, AppState>) -> Result<PickedPoint, String> {
    let point = engine.pick_point_now()?;
    hide_picker_inner(&app, &engine)?;
    let _ = app.emit("picker://result", &point);
    Ok(point)
}

#[tauri::command]
fn cancel_screen_pick(app: AppHandle, engine: State<'_, AppState>) -> Result<(), String> {
    hide_picker_inner(&app, &engine)?;
    let _ = app.emit("picker://cancel", ());
    Ok(())
}

#[tauri::command]
fn start_zone_draw(engine: State<'_, AppState>) -> Result<DrawnRect, String> {
    // 30s to press-drag-release LMB for a custom safety zone.
    engine.draw_zone_rect(Duration::from_secs(30))
}

#[tauri::command]
fn get_screen_geom(app: AppHandle, engine: State<'_, AppState>) -> ScreenGeomDto {
    geom_of(&app, &engine)
}

#[tauri::command]
fn list_displays(app: AppHandle) -> Result<Vec<DisplayDto>, String> {
    collect_displays(&app)
}

#[tauri::command]
fn set_active_display(
    app: AppHandle,
    engine: State<'_, AppState>,
    prefs: State<'_, Mutex<UiPrefs>>,
    snap: State<'_, Mutex<ZoneOverlaySnap>>,
    id: Option<String>,
) -> Result<DisplayDto, String> {
    let display = resolve_display(&app, id.as_deref())?;
    apply_display(&engine, &display);
    {
        let mut p = prefs.lock().map_err(|e| e.to_string())?;
        p.display_id = Some(display.id.clone());
    }
    let overlay_on = {
        let mut s = snap.lock().map_err(|e| e.to_string())?;
        s.geom = ScreenGeomDto {
            x: display.x,
            y: display.y,
            width: display.width,
            height: display.height,
        };
        let payload = s.clone();
        let vis = s.visible;
        let drawing = s.drawing;
        drop(s);
        emit_zones_state(&app, &payload);
        vis || drawing
    };
    if overlay_on {
        let drawing = snap
            .lock()
            .map(|s| s.drawing)
            .unwrap_or(false);
        let _ = apply_zone_window(&app, &engine, true, drawing);
    }
    let overlay_visible = prefs
        .lock()
        .map(|p| p.overlay_visible)
        .unwrap_or(false);
    if overlay_visible {
        let _ = place_status_overlay(&app, &display);
    }
    persist(&app, &engine);
    Ok(display)
}

#[tauri::command]
fn get_zone_overlay_snapshot(snap: State<'_, Mutex<ZoneOverlaySnap>>) -> ZoneOverlaySnap {
    snap.lock().map(|s| s.clone()).unwrap_or_else(|p| p.into_inner().clone())
}

fn emit_zones_state(app: &AppHandle, payload: &ZoneOverlaySnap) {
    if let Some(win) = app.get_webview_window("zones") {
        let _ = win.emit("zones://state", payload);
        if let Ok(json) = serde_json::to_string(payload) {
            let _ = win.eval(format!(
                "try{{window.__macroZonesApply&&window.__macroZonesApply({json})}}catch(_e){{}}"
            ));
        }
    }
    let _ = app.emit("zones://state", payload);
}

#[tauri::command]
fn push_zone_overlay_state(
    app: AppHandle,
    engine: State<'_, AppState>,
    snap: State<'_, Mutex<ZoneOverlaySnap>>,
    geom: ScreenGeomDto,
    zones: Vec<StopZone>,
) -> Result<(), String> {
    let (payload, visible, drawing) = {
        let mut s = snap.lock().map_err(|e| e.to_string())?;
        s.geom = geom;
        s.zones = zones;
        (s.clone(), s.visible, s.drawing)
    };
    emit_zones_state(&app, &payload);
    if drawing {
        apply_zone_window(&app, &engine, visible, drawing)?;
    } else if visible {
        sync_native_overlay(&app, true, false);
    }
    Ok(())
}

#[tauri::command]
fn set_zone_overlay_visible(
    app: AppHandle,
    engine: State<'_, AppState>,
    snap: State<'_, Mutex<ZoneOverlaySnap>>,
    visible: bool,
) -> Result<(), String> {
    let payload = {
        let mut s = snap.lock().map_err(|e| e.to_string())?;
        s.visible = visible;
        s.geom = geom_of(&app, &engine);
        s.clone()
    };
    apply_zone_window(&app, &engine, visible, payload.drawing)?;
    if visible || payload.drawing {
        emit_zones_state(&app, &payload);
    }
    Ok(())
}

#[tauri::command]
fn begin_zone_overlay_draw(
    app: AppHandle,
    engine: State<'_, AppState>,
    snap: State<'_, Mutex<ZoneOverlaySnap>>,
) -> Result<(), String> {
    {
        let mut s = snap.lock().map_err(|e| e.to_string())?;
        s.drawing = true;
        s.geom = geom_of(&app, &engine);
        let payload = s.clone();
        drop(s);
        emit_zones_state(&app, &payload);
    }
    apply_zone_window(&app, &engine, true, true)?;
    if let Some(win) = app.get_webview_window("zones") {
        let _ = win.emit("zones://draw-begin", ());
    }
    let _ = app.emit("zones://draw-begin", ());
    Ok(())
}

#[tauri::command]
fn complete_zone_overlay_draw(
    app: AppHandle,
    engine: State<'_, AppState>,
    snap: State<'_, Mutex<ZoneOverlaySnap>>,
    rect: Option<DrawnRect>,
) -> Result<(), String> {
    let visible = {
        let mut s = snap.lock().map_err(|e| e.to_string())?;
        s.drawing = false;
        s.visible
    };
    apply_zone_window(&app, &engine, visible, false)?;
    if let Some(r) = rect {
        let _ = app.emit("zones://drawn", &r);
    } else {
        let _ = app.emit("zones://draw-cancel", ());
    }
    Ok(())
}

fn enrich_macro_summaries_cmd(dir: &PathBuf) -> Result<Vec<MacroSummary>, String> {
    let mut summaries = list_macro_summaries(dir).map_err(|e| e.to_string())?;
    enrich_macro_summaries(dir, &mut summaries).map_err(|e| e.to_string())?;
    Ok(summaries)
}

#[tauri::command]
fn get_library_index_cmd(
    dir: State<'_, SettingsDir>,
    kind: String,
) -> Result<LibraryIndexDto, String> {
    let kind = LibraryKind::parse(&kind).map_err(|e| e.to_string())?;
    get_library_index(&dir.0, kind).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_library_items_cmd(
    dir: State<'_, SettingsDir>,
    kind: String,
    folder_id: Option<String>,
    query: Option<String>,
    include_trash: Option<bool>,
    favorites_only: Option<bool>,
    favorite_ids: Option<Vec<String>>,
) -> Result<LibraryIndexDto, String> {
    let kind = LibraryKind::parse(&kind).map_err(|e| e.to_string())?;
    list_library_items(
        &dir.0,
        kind,
        ListLibraryQuery {
            folder_id,
            query,
            include_trash: include_trash.unwrap_or(false),
            favorites_only: favorites_only.unwrap_or(false),
            favorite_ids: favorite_ids.unwrap_or_default(),
        },
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn create_library_folder_cmd(
    dir: State<'_, SettingsDir>,
    kind: String,
    name: String,
    parent_id: Option<String>,
) -> Result<LibraryFolder, String> {
    let kind = LibraryKind::parse(&kind).map_err(|e| e.to_string())?;
    create_library_folder(&dir.0, kind, name, parent_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn rename_library_folder_cmd(
    dir: State<'_, SettingsDir>,
    kind: String,
    id: String,
    name: String,
) -> Result<LibraryFolder, String> {
    let kind = LibraryKind::parse(&kind).map_err(|e| e.to_string())?;
    rename_library_folder(&dir.0, kind, id, name).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_library_folder_cmd(
    dir: State<'_, SettingsDir>,
    kind: String,
    id: String,
) -> Result<(), String> {
    let kind = LibraryKind::parse(&kind).map_err(|e| e.to_string())?;
    delete_library_folder(&dir.0, kind, id).map_err(|e| e.to_string())
}

#[tauri::command]
fn move_library_item_cmd(
    dir: State<'_, SettingsDir>,
    kind: String,
    id: String,
    folder_id: Option<String>,
    before_id: Option<String>,
) -> Result<(), String> {
    let kind = LibraryKind::parse(&kind).map_err(|e| e.to_string())?;
    move_library_item(&dir.0, kind, id, folder_id, before_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_library_item_locked_cmd(
    dir: State<'_, SettingsDir>,
    kind: String,
    id: String,
    locked: bool,
) -> Result<(), String> {
    let kind = LibraryKind::parse(&kind).map_err(|e| e.to_string())?;
    set_library_item_locked(&dir.0, kind, id, locked).map_err(|e| e.to_string())
}

#[tauri::command]
fn trash_library_item_cmd(
    dir: State<'_, SettingsDir>,
    kind: String,
    id: String,
) -> Result<(), String> {
    let kind = LibraryKind::parse(&kind).map_err(|e| e.to_string())?;
    assert_not_locked(&dir.0, kind, &id).map_err(|e| e.to_string())?;
    trash_library_item(&dir.0, kind, id).map_err(|e| e.to_string())
}

#[tauri::command]
fn restore_library_item_cmd(
    dir: State<'_, SettingsDir>,
    kind: String,
    id: String,
) -> Result<(), String> {
    let kind = LibraryKind::parse(&kind).map_err(|e| e.to_string())?;
    restore_library_item(&dir.0, kind, id).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_clicker_library(dir: State<'_, SettingsDir>) -> Result<Vec<ClickerPresetSummary>, String> {
    list_preset_summaries(&dir.0).map_err(|e| e.to_string())
}

#[tauri::command]
fn rename_clicker_preset(
    dir: State<'_, SettingsDir>,
    engine: State<'_, AppState>,
    from: String,
    to: String,
) -> Result<ClickerPreset, String> {
    assert_not_locked(&dir.0, LibraryKind::Clicker, &from).map_err(|e| e.to_string())?;
    let preset = rename_preset(&dir.0, &from, &to).map_err(|e| e.to_string())?;
    rename_library_entry_key(&dir.0, LibraryKind::Clicker, &from, &to)
        .map_err(|e| e.to_string())?;
    if engine.active_clicker_preset().as_deref() == Some(from.as_str()) {
        engine.set_active_clicker_preset(Some(preset.name.clone()));
    }
    let _ = engine.rebuild_clicker_triggers();
    Ok(preset)
}

#[tauri::command]
fn duplicate_clicker_preset(
    dir: State<'_, SettingsDir>,
    engine: State<'_, AppState>,
    name: String,
) -> Result<ClickerPreset, String> {
    let preset = duplicate_preset(&dir.0, &name).map_err(|e| e.to_string())?;
    engine.set_active_clicker_preset(Some(preset.name.clone()));
    Ok(preset)
}

#[tauri::command]
fn list_clicker_presets(dir: State<'_, SettingsDir>) -> Result<Vec<String>, String> {
    list_presets(&dir.0).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_clicker_preset(
    dir: State<'_, SettingsDir>,
    engine: State<'_, AppState>,
    name: String,
    config: ClickerConfig,
    trigger: Option<Trigger>,
) -> Result<ClickerPreset, String> {
    assert_not_locked(&dir.0, LibraryKind::Clicker, &name).map_err(|e| e.to_string())?;
    let preset = if let Some(t) = trigger {
        save_preset_with_trigger(&dir.0, &name, &config, t).map_err(|e| e.to_string())?
    } else {
        save_preset(&dir.0, &name, &config).map_err(|e| e.to_string())?
    };
    engine.set_active_clicker_preset(Some(preset.name.clone()));
    let _ = engine.rebuild_clicker_triggers();
    Ok(preset)
}

#[tauri::command]
fn load_clicker_preset(
    dir: State<'_, SettingsDir>,
    engine: State<'_, AppState>,
    name: String,
) -> Result<ClickerPreset, String> {
    let preset = load_preset(&dir.0, &name).map_err(|e| e.to_string())?;
    engine.set_clicker_config(preset.config.clone());
    engine.set_active_clicker_preset(Some(preset.name.clone()));
    Ok(preset)
}

#[tauri::command]
fn delete_clicker_preset(
    dir: State<'_, SettingsDir>,
    engine: State<'_, AppState>,
    name: String,
) -> Result<(), String> {
    assert_not_locked(&dir.0, LibraryKind::Clicker, &name).map_err(|e| e.to_string())?;
    delete_preset(&dir.0, &name).map_err(|e| e.to_string())?;
    let _ = remove_library_entry(&dir.0, LibraryKind::Clicker, &name);
    if engine.active_clicker_preset().as_deref() == Some(name.as_str()) {
        engine.set_active_clicker_preset(None);
    }
    let _ = engine.rebuild_clicker_triggers();
    Ok(())
}

#[tauri::command]
fn get_quick_access(dir: State<'_, SettingsDir>) -> Result<QuickAccess, String> {
    let mut qa = load_quick_access(&dir.0).map_err(|e| e.to_string())?;
    let clicker = list_presets(&dir.0).unwrap_or_default();
    let macros = list_macros(&dir.0).unwrap_or_default();
    let scripts = list_scripts(&dir.0)
        .unwrap_or_default()
        .into_iter()
        .map(|s| s.id)
        .collect::<Vec<_>>();
    if prune_orphans(&mut qa, &clicker, &macros, &scripts) {
        let _ = save_quick_access(&dir.0, &qa);
    }
    Ok(qa)
}

#[tauri::command]
fn get_accueil_order_cmd(dir: State<'_, SettingsDir>) -> Result<Vec<String>, String> {
    load_accueil_order(&dir.0).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_accueil_order_cmd(dir: State<'_, SettingsDir>, keys: Vec<String>) -> Result<(), String> {
    save_accueil_order(&dir.0, &keys).map_err(|e| e.to_string())
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AutomationsHomeDto {
    macros: LibraryIndexDto,
    clickers: LibraryIndexDto,
    macro_summaries: Vec<MacroSummary>,
    clicker_summaries: Vec<ClickerPresetSummary>,
    scripts: Vec<ScriptDoc>,
    quick_access: QuickAccess,
    hotkeys: HotkeyBindings,
}

#[tauri::command]
fn get_automations_home_cmd(
    dir: State<'_, SettingsDir>,
    engine: State<'_, AppState>,
) -> Result<AutomationsHomeDto, String> {
    let empty_q = ListLibraryQuery {
        folder_id: None,
        query: None,
        include_trash: false,
        favorites_only: false,
        favorite_ids: Vec::new(),
    };
    let macros = list_library_items(&dir.0, LibraryKind::Macro, empty_q.clone())
        .map_err(|e| e.to_string())?;
    let clickers = list_library_items(&dir.0, LibraryKind::Clicker, empty_q)
        .map_err(|e| e.to_string())?;
    let macro_summaries = enrich_macro_summaries_cmd(&dir.0)?;
    let clicker_summaries = list_preset_summaries(&dir.0).map_err(|e| e.to_string())?;
    let scripts = list_scripts(&dir.0).unwrap_or_default();
    let mut qa = load_quick_access(&dir.0).map_err(|e| e.to_string())?;
    let clicker_ids = list_presets(&dir.0).unwrap_or_default();
    let macro_ids = list_macros(&dir.0).unwrap_or_default();
    let script_ids: Vec<String> = scripts.iter().map(|s| s.id.clone()).collect();
    if prune_orphans(&mut qa, &clicker_ids, &macro_ids, &script_ids) {
        let _ = save_quick_access(&dir.0, &qa);
    }
    let hotkeys = engine.hotkey_bindings();
    Ok(AutomationsHomeDto {
        macros,
        clickers,
        macro_summaries,
        clicker_summaries,
        scripts,
        quick_access: qa,
        hotkeys,
    })
}

#[tauri::command]
fn list_process_exes() -> Vec<String> {
    list_visible_process_exes()
}

#[tauri::command]
fn set_quick_favorite(
    dir: State<'_, SettingsDir>,
    kind: String,
    id: String,
    favorite: bool,
) -> Result<QuickAccess, String> {
    let kind = parse_quick_kind(&kind)?;
    set_favorite(&dir.0, kind, &id, favorite).map_err(|e| e.to_string())
}

#[tauri::command]
fn launch_clicker_preset(
    app: AppHandle,
    dir: State<'_, SettingsDir>,
    engine: State<'_, AppState>,
    name: String,
) -> Result<EngineStatusPayload, String> {
    let preset = load_preset(&dir.0, &name).map_err(|e| e.to_string())?;
    engine.set_active_clicker_preset(Some(preset.name.clone()));
    engine.start_clicker(preset.config)?;
    persist(&app, &engine);
    Ok(status_of(&engine, Some(format!("clicker:{}", preset.name))))
}

#[tauri::command]
fn launch_saved_macro(
    dir: State<'_, SettingsDir>,
    engine: State<'_, AppState>,
    name: String,
    from_path: Option<Vec<usize>>,
) -> Result<EngineStatusPayload, String> {
    if let Some(path) = from_path.filter(|p| !p.is_empty()) {
        engine.activate_macro_by_name_from_path(&dir.0, &name, path)?;
    } else {
        engine.activate_macro_by_name(&dir.0, &name)?;
    }
    Ok(status_of(&engine, Some(format!("macro:{name}"))))
}

fn parse_quick_kind(kind: &str) -> Result<QuickKind, String> {
    match kind {
        "clicker" => Ok(QuickKind::Clicker),
        "macro" => Ok(QuickKind::Macro),
        "script" => Ok(QuickKind::Script),
        _ => Err(format!("unknown quick kind: {kind}")),
    }
}

#[tauri::command]
fn set_active_clicker_preset(
    engine: State<'_, AppState>,
    name: Option<String>,
) -> Result<(), String> {
    engine.set_active_clicker_preset(name.filter(|n| !n.trim().is_empty()));
    Ok(())
}

#[tauri::command]
fn set_overlay_visible(app: AppHandle, prefs: State<'_, Mutex<UiPrefs>>, visible: bool) -> Result<(), String> {
    prefs.lock().map_err(|e| e.to_string())?.overlay_visible = visible;
    set_overlay_visible_inner(&app, visible)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ResolvedLocale {
    Fr,
    En,
}

struct TrayStrings {
    relaunch_clicker: &'static str,
    relaunch_macro: &'static str,
    stop: &'static str,
    overlay: &'static str,
    open: &'static str,
    quit: &'static str,
    recording: &'static str,
    active: &'static str,
}

const TRAY_FR: TrayStrings = TrayStrings {
    relaunch_clicker: "Relancer le dernier clicker",
    relaunch_macro: "Relancer la dernière macro",
    stop: "Arrêter",
    overlay: "Afficher/Masquer overlay",
    open: "Ouvrir Caster",
    quit: "Quitter",
    recording: "enregistrement",
    active: "actif",
};

const TRAY_EN: TrayStrings = TrayStrings {
    relaunch_clicker: "Relaunch last clicker",
    relaunch_macro: "Relaunch last macro",
    stop: "Stop",
    overlay: "Show/Hide overlay",
    open: "Open Caster",
    quit: "Quit",
    recording: "recording",
    active: "active",
};

impl ResolvedLocale {
    fn tray(self) -> &'static TrayStrings {
        match self {
            Self::Fr => &TRAY_FR,
            Self::En => &TRAY_EN,
        }
    }
}

fn os_locale_tag() -> Option<String> {
    for key in ["LC_ALL", "LC_MESSAGES", "LANG"] {
        if let Ok(v) = std::env::var(key) {
            let t = v.trim();
            if !t.is_empty() {
                // Strip encoding suffix (e.g. fr_FR.UTF-8).
                let base = t.split('.').next().unwrap_or(t);
                return Some(base.replace('_', "-"));
            }
        }
    }
    #[cfg(windows)]
    {
        #[link(name = "kernel32")]
        extern "system" {
            fn GetUserDefaultLocaleName(lpLocaleName: *mut u16, cchLocaleName: i32) -> i32;
        }
        let mut buf = [0u16; 85];
        let len = unsafe { GetUserDefaultLocaleName(buf.as_mut_ptr(), buf.len() as i32) };
        if len > 1 {
            return Some(String::from_utf16_lossy(&buf[..(len as usize - 1)]));
        }
    }
    None
}

fn resolve_ui_locale(pref: UiLocale) -> ResolvedLocale {
    match pref {
        UiLocale::Fr => ResolvedLocale::Fr,
        UiLocale::En => ResolvedLocale::En,
        UiLocale::System => {
            let tag = os_locale_tag().unwrap_or_default();
            let lower = tag.to_ascii_lowercase();
            if lower == "fr" || lower.starts_with("fr-") {
                ResolvedLocale::Fr
            } else if lower == "en" || lower.starts_with("en-") {
                ResolvedLocale::En
            } else {
                // Match front-end FALLBACK_LOCALE.
                ResolvedLocale::Fr
            }
        }
    }
}

fn prefs_resolved_locale(app: &AppHandle) -> ResolvedLocale {
    app.try_state::<Mutex<UiPrefs>>()
        .and_then(|p| p.lock().ok().map(|g| resolve_ui_locale(g.shell.ui_locale)))
        .unwrap_or(ResolvedLocale::Fr)
}

fn format_macro_label(locale: ResolvedLocale, name: &str) -> String {
    match locale {
        ResolvedLocale::Fr => format!("macro « {name} »"),
        ResolvedLocale::En => format!("macro \"{name}\""),
    }
}

fn tray_tooltip(engine: &AppState, locale: ResolvedLocale) -> String {
    let strings = locale.tray();
    let running = matches!(
        engine.state(),
        EngineState::Running | EngineState::Paused | EngineState::Stopping
    );
    let (kind, name) = engine.session_kind_and_name();
    if running {
        let detail = match kind {
            Some("clicker") => match name {
                Some(n) => format!("clicker · {n}"),
                None => "clicker".into(),
            },
            Some("macro") => match name {
                Some(n) => format_macro_label(locale, &n),
                None => "macro".into(),
            },
            Some("record") => strings.recording.into(),
            _ => strings.active.into(),
        };
        return format!("Caster — {detail}");
    }
    if let Some(doc) = engine.loaded_macro() {
        return format!("Caster — {}", format_macro_label(locale, &doc.name));
    }
    "Caster".into()
}

fn build_tray_menu(
    app: &AppHandle,
    locale: ResolvedLocale,
) -> tauri::Result<Menu<tauri::Wry>> {
    let s = locale.tray();
    let start = MenuItem::with_id(app, "start", s.relaunch_clicker, true, None::<&str>)?;
    let start_macro =
        MenuItem::with_id(app, "start_macro", s.relaunch_macro, true, None::<&str>)?;
    let stop = MenuItem::with_id(app, "stop", s.stop, true, None::<&str>)?;
    let overlay_item = MenuItem::with_id(app, "overlay", s.overlay, true, None::<&str>)?;
    let show = MenuItem::with_id(app, "show", s.open, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", s.quit, true, None::<&str>)?;
    Menu::with_items(
        app,
        &[&start, &start_macro, &stop, &overlay_item, &show, &quit],
    )
}

fn update_tray_tooltip(app: &AppHandle, engine: &AppState) {
    let locale = prefs_resolved_locale(app);
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_tooltip(Some(tray_tooltip(engine, locale)));
    }
}

fn refresh_tray_for_locale(app: &AppHandle, engine: &AppState, pref: UiLocale) {
    let locale = resolve_ui_locale(pref);
    if let Some(tray) = app.tray_by_id("main") {
        match build_tray_menu(app, locale) {
            Ok(menu) => {
                let _ = tray.set_menu(Some(menu));
            }
            Err(e) => log::warn!("tray menu rebuild failed: {e}"),
        }
        let _ = tray.set_tooltip(Some(tray_tooltip(engine, locale)));
    }
}

fn status_of(engine: &AppState, message: Option<String>) -> EngineStatusPayload {
    engine.sync_pause_gate_state();
    let (kind, name) = engine.session_kind_and_name();
    EngineStatusPayload {
        state: engine.state(),
        cancelled: engine.cancellation().is_cancelled(),
        message,
        session_kind: kind.map(|k| k.to_string()),
        session_name: name,
    }
}

fn prefs_to_settings(engine: &AppState, p: &UiPrefs) -> AppSettings {
    let mut s = AppSettings {
        clicker: engine.clicker_config(),
        advanced_ui: p.advanced_ui,
        overlay_visible: p.overlay_visible,
        overlay_opacity: p.overlay_opacity,
        hotkeys: engine.hotkey_bindings(),
        process_filter: p.process_filter.clone(),
        theme: p.theme,
        display_id: p.display_id.clone(),
        sidebar_collapsed: p.sidebar_collapsed,
        journal_open: p.journal_open,
        close_to_tray: p.close_to_tray,
        start_with_windows: p.start_with_windows,
        accueil: p.accueil.clone(),
        shell: p.shell.clone(),
        automation: p.automation.clone(),
        confirmations: p.confirmations.clone(),
        scripts: p.scripts.clone(),
        appearance: p.appearance.clone(),
        maintenance: p.maintenance.clone(),
    };
    normalize_app_settings(&mut s);
    s
}

fn apply_prefs(p: &mut UiPrefs, settings: &AppSettings) {
    p.advanced_ui = settings.advanced_ui;
    p.overlay_visible = settings.overlay_visible;
    p.overlay_opacity = clamp_overlay_opacity(settings.overlay_opacity);
    p.process_filter = settings.process_filter.clone();
    p.theme = settings.theme;
    p.display_id = settings.display_id.clone();
    p.sidebar_collapsed = settings.sidebar_collapsed;
    p.journal_open = settings.journal_open;
    p.close_to_tray = settings.close_to_tray;
    p.start_with_windows = settings.start_with_windows;
    p.accueil = settings.accueil.clone();
    p.shell = settings.shell.clone();
    p.automation = settings.automation.clone();
    p.confirmations = settings.confirmations.clone();
    p.scripts = settings.scripts.clone();
    p.appearance = settings.appearance.clone();
    p.maintenance = settings.maintenance.clone();
}

fn apply_overlay_opacity(app: &AppHandle, opacity: f32) {
    let o = clamp_overlay_opacity(opacity);
    let _ = app.emit("overlay://opacity", o);
}

fn is_autostart_launch() -> bool {
    std::env::args().any(|a| a == "--autostart")
}

fn session_is_active(engine: &AppState) -> bool {
    matches!(
        engine.state(),
        EngineState::Running | EngineState::Paused | EngineState::Stopping
    )
}

fn apply_main_window_shell(app: &AppHandle, shell: &ShellPrefs, hide_for_autostart: bool) {
    let Some(main) = app.get_webview_window("main") else {
        return;
    };
    let _ = main.set_always_on_top(shell.always_on_top);
    if shell.remember_window_bounds {
        if let Some(b) = &shell.window_bounds {
            let _ = main.set_position(tauri::PhysicalPosition::new(b.x, b.y));
            let _ = main.set_size(tauri::PhysicalSize::new(b.width.max(400), b.height.max(300)));
        }
    }
    if hide_for_autostart && shell.minimize_to_tray {
        let _ = main.hide();
    }
}

fn persist_main_window_bounds(app: &AppHandle, engine: &AppState) {
    let Some(main) = app.get_webview_window("main") else {
        return;
    };
    let Some(prefs) = app.try_state::<Mutex<UiPrefs>>() else {
        return;
    };
    let Ok(mut p) = prefs.lock() else {
        return;
    };
    if !p.shell.remember_window_bounds {
        return;
    }
    let Ok(pos) = main.outer_position() else {
        return;
    };
    let Ok(size) = main.outer_size() else {
        return;
    };
    p.shell.window_bounds = Some(WindowBounds {
        x: pos.x,
        y: pos.y,
        width: size.width,
        height: size.height,
    });
    drop(p);
    persist(app, engine);
}

fn force_app_exit(app: &AppHandle, engine: &AppState) {
    persist(app, engine);
    sync_native_overlay(app, false, false);
    engine.shutdown_hotkeys();
    engine.stop_clicker();
    app.exit(0);
}

fn request_app_exit(app: &AppHandle, engine: &AppState) {
    let confirm = app
        .try_state::<Mutex<UiPrefs>>()
        .and_then(|p| p.lock().ok().map(|g| g.shell.confirm_quit_if_running))
        .unwrap_or(true);
    if confirm && session_is_active(engine) {
        if let Some(main) = app.get_webview_window("main") {
            let _ = main.show();
            let _ = main.set_focus();
        }
        let _ = app.emit("app://confirm-quit", ());
        return;
    }
    force_app_exit(app, engine);
}

#[tauri::command]
fn confirm_app_exit(app: AppHandle, engine: State<'_, AppState>) {
    force_app_exit(&app, &engine);
}

fn startup_cmd_path() -> Option<PathBuf> {
    let appdata = std::env::var_os("APPDATA")?;
    Some(
        PathBuf::from(appdata)
            .join("Microsoft")
            .join("Windows")
            .join("Start Menu")
            .join("Programs")
            .join("Startup")
            .join("Caster.cmd"),
    )
}

fn set_start_with_windows(enable: bool) -> Result<(), String> {
    #[cfg(not(windows))]
    {
        let _ = enable;
        return Ok(());
    }
    #[cfg(windows)]
    {
        let path = startup_cmd_path().ok_or_else(|| "APPDATA manquant".to_string())?;
        if enable {
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let exe = std::env::current_exe().map_err(|e| e.to_string())?;
            let body = format!(
                "@echo off\r\nstart \"\" \"{}\" --autostart\r\n",
                exe.display()
            );
            std::fs::write(&path, body).map_err(|e| e.to_string())?;
        } else if path.exists() {
            std::fs::remove_file(&path).map_err(|e| e.to_string())?;
        }
        Ok(())
    }
}

fn persist(app: &AppHandle, engine: &AppState) {
    let Some(dir) = app.try_state::<SettingsDir>() else {
        return;
    };
    let settings = app
        .try_state::<Mutex<UiPrefs>>()
        .and_then(|p| p.lock().ok().map(|g| prefs_to_settings(engine, &g)))
        .unwrap_or_else(|| AppSettings {
            clicker: engine.clicker_config(),
            hotkeys: engine.hotkey_bindings(),
            ..AppSettings::default()
        });
    if let Err(e) = save_settings(&dir.0, &settings) {
        log::warn!("save settings failed: {e}");
    }
}

#[tauri::command]
fn get_engine_state(app: AppHandle, engine: State<'_, AppState>) -> EngineStatusPayload {
    // Failsafe: if we are not in an active pick, never leave a capturing picker up.
    if !engine.is_picking() {
        let _ = ensure_picker_released(&app, &engine);
    }
    status_of(&engine, None)
}

#[tauri::command]
fn request_cancel(app: AppHandle, engine: State<'_, AppState>) -> EngineStatusPayload {
    let _ = hide_picker_inner(&app, &engine);
    let state = engine.stop_engine();
    persist(&app, &engine);
    log::info!("stop requested from UI → {state:?}");
    status_of(&engine, Some("Arrêt demandé".into()))
}

#[tauri::command]
fn emergency_stop(app: AppHandle, engine: State<'_, AppState>) -> EngineStatusPayload {
    let _ = hide_picker_inner(&app, &engine);
    engine.emergency_stop();
    persist(&app, &engine);
    log::info!("emergency stop from UI → {:?}", engine.state());
    status_of(&engine, Some("Arrêt d’urgence".into()))
}

#[tauri::command]
fn get_clicker_metrics(engine: State<'_, AppState>) -> ClickerMetrics {
    engine.metrics()
}

#[tauri::command]
fn get_foreground_exe(engine: State<'_, AppState>) -> Option<String> {
    engine.foreground_exe()
}

#[tauri::command]
fn apply_loaded_settings(
    app: &AppHandle,
    engine: &AppState,
    prefs: &Mutex<UiPrefs>,
    settings: AppSettings,
) -> Result<AppSettings, String> {
    engine.set_clicker_config(settings.clicker.clone());
    engine.set_hotkey_bindings(settings.hotkeys);
    engine.set_process_filter(settings.process_filter.clone());
    let kept_display = {
        let mut p = prefs.lock().map_err(|e| e.to_string())?;
        apply_prefs(&mut p, &settings);
        p.display_id.clone()
    };
    if let Err(e) = set_start_with_windows(settings.start_with_windows) {
        log::warn!("start with windows: {e}");
    }
    apply_main_window_shell(app, &settings.shell, false);
    if let Ok(display) = resolve_display(app, kept_display.as_deref()) {
        apply_display(engine, &display);
    }
    apply_overlay_opacity(app, settings.overlay_opacity);
    set_overlay_visible_inner(app, settings.overlay_visible)?;
    persist(app, engine);
    refresh_tray_for_locale(app, engine, settings.shell.ui_locale);
    let p = prefs.lock().map_err(|e| e.to_string())?;
    Ok(prefs_to_settings(engine, &p))
}

#[tauri::command]
fn get_settings(
    engine: State<'_, AppState>,
    prefs: State<'_, Mutex<UiPrefs>>,
) -> AppSettings {
    let p = prefs.lock().expect("prefs");
    prefs_to_settings(&engine, &p)
}

#[tauri::command]
fn save_app_settings(
    app: AppHandle,
    engine: State<'_, AppState>,
    prefs: State<'_, Mutex<UiPrefs>>,
    settings: AppSettings,
) -> Result<AppSettings, String> {
    apply_loaded_settings(&app, &engine, &prefs, settings)
}

#[tauri::command]
fn get_paths(app: AppHandle, dir: State<'_, SettingsDir>) -> Result<AppPathsDto, String> {
    let log_dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    Ok(AppPathsDto {
        config_dir: dir.0.to_string_lossy().into_owned(),
        settings_path: settings_path(&dir.0).to_string_lossy().into_owned(),
        log_dir: log_dir.to_string_lossy().into_owned(),
        version: env!("CARGO_PKG_VERSION").into(),
        accueil_order_path: dir
            .0
            .join("accueil-order.json")
            .to_string_lossy()
            .into_owned(),
        library_path: dir.0.join("library.json").to_string_lossy().into_owned(),
        quick_access_path: dir
            .0
            .join("quick-access.json")
            .to_string_lossy()
            .into_owned(),
    })
}

#[tauri::command]
fn reset_accueil_order_cmd(dir: State<'_, SettingsDir>) -> Result<(), String> {
    save_accueil_order(&dir.0, &[]).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        std::process::Command::new("explorer")
            .arg(&path)
            .spawn()
                .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        Err(format!("ouvrir {path} : non supporté"))
    }
}

#[tauri::command]
fn reveal_library_entry(
    dir: State<'_, SettingsDir>,
    kind: String,
    name: String,
) -> Result<(), String> {
    let path = match kind.as_str() {
        "macro" => {
            load_macro(&dir.0, &name).map_err(|e| e.to_string())?;
            dir.0.join("macros").join(format!("{name}.json"))
        }
        "clicker" => {
            load_preset(&dir.0, &name).map_err(|e| e.to_string())?;
            dir.0.join("clicker-presets").join(format!("{name}.json"))
        }
        _ => return Err("Type d'automation inconnu".into()),
    };
    if !path.exists() {
        return Err("Fichier introuvable".into());
    }
    #[cfg(windows)]
    {
        std::process::Command::new("explorer")
            .arg(format!("/select,{}", path.display()))
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        open_path(path.to_string_lossy().into_owned())
    }
}

#[tauri::command]
fn purge_library_trash_cmd(dir: State<'_, SettingsDir>) -> Result<usize, String> {
    purge_library_trash(&dir.0).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_scripts_cmd(dir: State<'_, SettingsDir>) -> Result<Vec<ScriptDoc>, String> {
    list_scripts(&dir.0).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_script_cmd(dir: State<'_, SettingsDir>, id: String) -> Result<ScriptDoc, String> {
    load_script(&dir.0, &id).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_script_cmd(dir: State<'_, SettingsDir>, doc: ScriptDoc) -> Result<(), String> {
    save_script(&dir.0, &doc).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_script_cmd(dir: State<'_, SettingsDir>, id: String) -> Result<(), String> {
    delete_script(&dir.0, &id).map_err(|e| e.to_string())
}

#[tauri::command]
fn run_script_session_cmd(
    engine: State<'_, AppState>,
    id: String,
) -> Result<EngineStatusPayload, String> {
    engine.start_script_session(&id)?;
    Ok(status_of(&engine, Some("script running".into())))
}

#[tauri::command]
fn export_app_settings(
    engine: State<'_, AppState>,
    prefs: State<'_, Mutex<UiPrefs>>,
    path: String,
) -> Result<(), String> {
    let p = prefs.lock().map_err(|e| e.to_string())?;
    let settings = prefs_to_settings(&engine, &p);
    let raw = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(path, raw).map_err(|e| e.to_string())
}

#[tauri::command]
fn import_app_settings(
    app: AppHandle,
    engine: State<'_, AppState>,
    prefs: State<'_, Mutex<UiPrefs>>,
    path: String,
) -> Result<AppSettings, String> {
    let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let settings: AppSettings = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    apply_loaded_settings(&app, &engine, &prefs, settings)
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RecordStatePayload {
    recording: bool,
    paused: bool,
    action_count: usize,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct StartRecordArgs {
    replace: Option<bool>,
    mouse_only: Option<bool>,
    keyboard_only: Option<bool>,
}

#[tauri::command]
fn start_record(
    engine: State<'_, AppState>,
    args: StartRecordArgs,
) -> Result<RecordStatePayload, String> {
    let options = RecordOptions {
        mouse_only: args.mouse_only.unwrap_or(false),
        keyboard_only: args.keyboard_only.unwrap_or(false),
    };
    engine.start_record(args.replace.unwrap_or(false), options)?;
    Ok(RecordStatePayload {
        recording: true,
        paused: false,
        action_count: 0,
    })
}

#[tauri::command]
fn pause_record(engine: State<'_, AppState>) -> Result<RecordStatePayload, String> {
    engine.pause_record()?;
    Ok(RecordStatePayload {
        recording: true,
        paused: true,
        action_count: engine.record_action_count(),
    })
}

#[tauri::command]
fn resume_record(engine: State<'_, AppState>) -> Result<RecordStatePayload, String> {
    engine.resume_record()?;
    Ok(RecordStatePayload {
        recording: true,
        paused: false,
        action_count: engine.record_action_count(),
    })
}

#[tauri::command]
fn stop_record(engine: State<'_, AppState>) -> Result<MacroDocument, String> {
    engine.stop_record()
}

#[tauri::command]
fn get_record_state(engine: State<'_, AppState>) -> RecordStatePayload {
    RecordStatePayload {
        recording: engine.is_recording(),
        paused: engine.record_paused(),
        action_count: engine.record_action_count(),
    }
}

#[tauri::command]
fn get_hotkey_bindings(engine: State<'_, AppState>) -> HotkeyBindings {
    engine.hotkey_bindings()
}

#[tauri::command]
fn set_hotkey_bindings(
    app: AppHandle,
    engine: State<'_, AppState>,
    bindings: HotkeyBindings,
) -> Result<HotkeyBindings, String> {
    engine.set_hotkey_bindings(bindings);
    if let Err(e) = engine.rebuild_macro_triggers() {
        log::warn!("rebuild macro triggers after hotkey change: {e}");
    }
    if let Err(e) = engine.rebuild_clicker_triggers() {
        log::warn!("rebuild clicker triggers after hotkey change: {e}");
    }
    persist(&app, &engine);
    Ok(engine.hotkey_bindings())
}

#[tauri::command]
fn get_macro(engine: State<'_, AppState>) -> Option<MacroDocument> {
    engine.loaded_macro()
}

#[tauri::command]
fn set_macro(engine: State<'_, AppState>, doc: MacroDocument) -> Result<MacroDocument, String> {
    if doc.actions.is_empty() {
        // Allow empty while editing; play will refuse.
    }
    engine.set_macro(doc.clone());
    Ok(doc)
}

#[tauri::command]
fn clear_macro(engine: State<'_, AppState>) -> Result<(), String> {
    engine.clear_macro();
    Ok(())
}

fn reserved_vks(engine: &AppState) -> [u16; 3] {
    let b = engine.hotkey_bindings();
    [b.action_vk, b.macro_vk, b.emergency_vk]
}

fn rebuild_triggers(engine: &AppState) {
    if let Err(e) = engine.rebuild_macro_triggers() {
        log::warn!("rebuild macro triggers: {e}");
    }
    if let Err(e) = engine.rebuild_clicker_triggers() {
        log::warn!("rebuild clicker triggers: {e}");
    }
}

#[tauri::command]
fn list_saved_macros(dir: State<'_, SettingsDir>) -> Result<Vec<String>, String> {
    list_macros(&dir.0).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_macro_library(dir: State<'_, SettingsDir>) -> Result<Vec<MacroSummary>, String> {
    enrich_macro_summaries_cmd(&dir.0)
}

#[tauri::command]
fn load_saved_macro(
    dir: State<'_, SettingsDir>,
    engine: State<'_, AppState>,
    name: String,
) -> Result<MacroDocument, String> {
    let doc = load_macro(&dir.0, &name).map_err(|e| e.to_string())?;
    engine.set_macro(doc.clone());
    Ok(doc)
}

#[tauri::command]
fn save_saved_macro(
    dir: State<'_, SettingsDir>,
    engine: State<'_, AppState>,
    id: String,
    doc: MacroDocument,
) -> Result<MacroDocument, String> {
    assert_not_locked(&dir.0, LibraryKind::Macro, &id).map_err(|e| e.to_string())?;
    let reserved = reserved_vks(&engine);
    let saved =
        save_macro_checked(&dir.0, &id, &doc, &reserved).map_err(|e| e.to_string())?;
    engine.set_macro(saved.clone());
    rebuild_triggers(&engine);
    Ok(saved)
}

#[tauri::command]
fn create_saved_macro(
    dir: State<'_, SettingsDir>,
    engine: State<'_, AppState>,
    name: Option<String>,
) -> Result<MacroDocument, String> {
    let doc = create_macro(&dir.0, name.as_deref()).map_err(|e| e.to_string())?;
    engine.set_macro(doc.clone());
    rebuild_triggers(&engine);
    Ok(doc)
}

#[tauri::command]
fn delete_saved_macro(
    dir: State<'_, SettingsDir>,
    engine: State<'_, AppState>,
    name: String,
) -> Result<Option<MacroDocument>, String> {
    assert_not_locked(&dir.0, LibraryKind::Macro, &name).map_err(|e| e.to_string())?;
    delete_macro(&dir.0, &name).map_err(|e| e.to_string())?;
    let _ = remove_library_entry(&dir.0, LibraryKind::Macro, &name);
    let active = engine.loaded_macro();
    let was_active = active.as_ref().is_some_and(|d| d.name == name);
    let result = if !was_active {
        None
    } else {
        let remaining = list_macros(&dir.0).map_err(|e| e.to_string())?;
        if let Some(next_name) = remaining.first() {
            let doc = load_macro(&dir.0, next_name).map_err(|e| e.to_string())?;
            engine.set_macro(doc.clone());
            Some(doc)
        } else {
            engine.clear_macro();
            None
        }
    };
    rebuild_triggers(&engine);
    Ok(result)
}

#[tauri::command]
fn duplicate_saved_macro(
    dir: State<'_, SettingsDir>,
    engine: State<'_, AppState>,
    name: String,
) -> Result<MacroDocument, String> {
    let doc = duplicate_macro(&dir.0, &name).map_err(|e| e.to_string())?;
    engine.set_macro(doc.clone());
    rebuild_triggers(&engine);
    Ok(doc)
}

#[tauri::command]
fn rename_saved_macro(
    dir: State<'_, SettingsDir>,
    engine: State<'_, AppState>,
    from: String,
    to: String,
) -> Result<MacroDocument, String> {
    assert_not_locked(&dir.0, LibraryKind::Macro, &from).map_err(|e| e.to_string())?;
    let doc = rename_macro(&dir.0, &from, &to).map_err(|e| e.to_string())?;
    rename_library_entry_key(&dir.0, LibraryKind::Macro, &from, &to)
        .map_err(|e| e.to_string())?;
    engine.set_macro(doc.clone());
    rebuild_triggers(&engine);
    Ok(doc)
}

#[tauri::command]
fn run_macro(engine: State<'_, AppState>) -> Result<EngineStatusPayload, String> {
    engine.start_macro()?;
    Ok(status_of(&engine, Some("macro running".into())))
}

#[tauri::command]
fn pause_macro(engine: State<'_, AppState>) -> Result<EngineStatusPayload, String> {
    engine.pause_macro()?;
    Ok(status_of(&engine, Some("paused".into())))
}

#[tauri::command]
fn resume_macro(engine: State<'_, AppState>) -> Result<EngineStatusPayload, String> {
    engine.resume_macro()?;
    Ok(status_of(&engine, Some("resumed".into())))
}

#[tauri::command]
fn pause_clicker(engine: State<'_, AppState>) -> Result<EngineStatusPayload, String> {
    engine.pause_clicker()?;
    Ok(status_of(&engine, Some("clicker paused".into())))
}

#[tauri::command]
fn resume_clicker(engine: State<'_, AppState>) -> Result<EngineStatusPayload, String> {
    engine.resume_clicker()?;
    Ok(status_of(&engine, Some("clicker resumed".into())))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PixelSample {
    x: i32,
    y: i32,
    r: u8,
    g: u8,
    b: u8,
}

#[tauri::command]
fn read_pixel(engine: State<'_, AppState>, x: i32, y: i32) -> Result<PixelSample, String> {
    let (r, g, b) = engine
        .injector()
        .read_pixel(x, y)
        .map_err(|e| e.to_string())?;
    Ok(PixelSample { x, y, r, g, b })
}

#[tauri::command]
fn import_macro_path(engine: State<'_, AppState>, path: String) -> Result<MacroDocument, String> {
    let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let doc = parse_macro_json(&raw).map_err(|e| e.to_string())?;
    engine.set_macro(doc.clone());
    Ok(doc)
}

#[tauri::command]
fn export_macro_path(engine: State<'_, AppState>, path: String) -> Result<(), String> {
    let doc = engine
        .loaded_macro()
        .ok_or_else(|| "no macro loaded".to_string())?;
    let raw = macro_to_json(&doc).map_err(|e| e.to_string())?;
    std::fs::write(&path, raw).map_err(|e| e.to_string())
}

#[tauri::command]
fn import_clicker_preset_path(
    dir: State<'_, SettingsDir>,
    engine: State<'_, AppState>,
    path: String,
) -> Result<ClickerPreset, String> {
    let preset = import_preset_from_path(&dir.0, std::path::Path::new(&path))
        .map_err(|e| e.to_string())?;
    engine.set_active_clicker_preset(Some(preset.name.clone()));
    Ok(preset)
}

#[tauri::command]
fn export_clicker_preset_path(
    dir: State<'_, SettingsDir>,
    name: String,
    path: String,
) -> Result<(), String> {
    export_preset_to_path(&dir.0, &name, std::path::Path::new(&path)).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_preset_macro(engine: State<'_, AppState>, name: String) -> Result<MacroDocument, String> {
    let raw = match name.as_str() {
        "click-delay" => include_str!("../presets/click-delay.macro.json"),
        "process-echo" => include_str!("../presets/process-echo.macro.json"),
        _ => return Err(format!("unknown preset: {name}")),
    };
    let doc = parse_macro_json(raw).map_err(|e| e.to_string())?;
    engine.set_macro(doc.clone());
    Ok(doc)
}

fn set_overlay_visible_inner(app: &AppHandle, visible: bool) -> Result<(), String> {
    let Some(win) = app.get_webview_window("overlay") else {
        return Err("overlay window missing".into());
    };
    if visible {
        let id = app
            .try_state::<AppState>()
            .and_then(|e| e.display_id());
        if let Ok(d) = resolve_display(app, id.as_deref()) {
            let _ = place_status_overlay(app, &d);
        }
        win.show().map_err(|e| e.to_string())?;
        let _ = win.set_ignore_cursor_events(true);
        let opacity = app
            .try_state::<Mutex<UiPrefs>>()
            .and_then(|p| p.lock().ok().map(|g| g.overlay_opacity))
            .unwrap_or(1.0);
        apply_overlay_opacity(app, opacity);
    } else {
        win.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn collect_displays(app: &AppHandle) -> Result<Vec<DisplayDto>, String> {
    let win = app
        .get_webview_window("main")
        .ok_or_else(|| "main window missing".to_string())?;
    let monitors = win.available_monitors().map_err(|e| e.to_string())?;
    let primary = win.primary_monitor().ok().flatten();
    let primary_name = primary
        .as_ref()
        .and_then(|m| m.name().map(|s| s.to_string()));
    let primary_pos = primary.as_ref().map(|m| {
        let p = m.position();
        (p.x, p.y)
    });

    let mut out = Vec::with_capacity(monitors.len());
    for (i, m) in monitors.into_iter().enumerate() {
        let pos = m.position();
        let size = m.size();
        let name = m.name().map(|s| s.to_string());
        let id = name.clone().unwrap_or_else(|| format!("display-{i}"));
        let is_primary = match (&primary_name, &name) {
            (Some(a), Some(b)) if a == b => true,
            _ => primary_pos == Some((pos.x, pos.y)),
        };
        let width = size.width as i32;
        let height = size.height as i32;
        let label = if is_primary {
            format!("Écran {} · {width}×{height} (principal)", i + 1)
        } else {
            format!("Écran {} · {width}×{height}", i + 1)
        };
        out.push(DisplayDto {
            id,
            label,
            x: pos.x,
            y: pos.y,
            width,
            height,
            scale_factor: m.scale_factor(),
            is_primary,
        });
    }
    Ok(out)
}

fn resolve_display(app: &AppHandle, id: Option<&str>) -> Result<DisplayDto, String> {
    let list = collect_displays(app)?;
    if let Some(want) = id {
        if let Some(d) = list.iter().find(|d| d.id == want) {
            return Ok(d.clone());
        }
    }
    if let Some(d) = list.iter().find(|d| d.is_primary) {
        return Ok(d.clone());
    }
    list.into_iter()
        .next()
        .ok_or_else(|| "aucun écran disponible".into())
}

fn apply_display(engine: &AppState, display: &DisplayDto) {
    engine.set_display_id(Some(display.id.clone()));
    engine.set_zone_screen(ScreenGeom {
        x: display.x,
        y: display.y,
        w: display.width,
        h: display.height,
    });
}

fn place_status_overlay(app: &AppHandle, display: &DisplayDto) -> Result<(), String> {
    let Some(win) = app.get_webview_window("overlay") else {
        return Ok(());
    };
    const INSET: i32 = 16;
    let size = win
        .outer_size()
        .unwrap_or(tauri::PhysicalSize::new(240, 72));
    let x = display.x + display.width - size.width as i32 - INSET;
    let y = display.y + INSET;
    win.set_position(tauri::PhysicalPosition::new(x, y))
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn geom_of(app: &AppHandle, engine: &AppState) -> ScreenGeomDto {
    match resolve_display(app, engine.display_id().as_deref()) {
        Ok(d) => {
            let geom = ScreenGeom {
                x: d.x,
                y: d.y,
                w: d.width,
                h: d.height,
            };
            engine.set_zone_screen(geom);
            ScreenGeomDto::from(geom)
        }
        Err(_) => ScreenGeomDto::from(engine.zone_screen()),
    }
}

fn apply_zone_window(
    app: &AppHandle,
    engine: &AppState,
    visible: bool,
    capture: bool,
) -> Result<(), String> {
    let Some(win) = app.get_webview_window("zones") else {
        return Err("zones window missing".into());
    };
    sync_native_overlay(app, visible, capture);
    if capture {
        let _ = win.set_background_color(Some(Color(0, 0, 0, 0)));
        let _ = win.set_resizable(true);
        let g = geom_of(app, engine);
        if let Err(e) = win.set_position(tauri::PhysicalPosition::new(g.x, g.y)) {
            log::warn!("zones set_position failed: {e}");
        }
        if let Err(e) = win.set_size(tauri::PhysicalSize::new(
            g.width.max(1) as u32,
            g.height.max(1) as u32,
        )) {
            log::warn!("zones set_size failed: {e}");
        }
        let _ = win.set_always_on_top(true);
        let _ = win.set_ignore_cursor_events(false);
        win.show().map_err(|e| e.to_string())?;
        let _ = win.set_focus();
        return Ok(());
    }
    let _ = win.set_ignore_cursor_events(true);
    win.hide().map_err(|e| e.to_string())?;
    Ok(())
}

fn sync_native_overlay(app: &AppHandle, visible: bool, capture: bool) {
    let Some(native) = app.try_state::<Arc<NativeZoneOverlay>>() else {
        return;
    };
    let native = native.inner().clone();
    if visible && !capture {
        match app.try_state::<Mutex<ZoneOverlaySnap>>() {
            Some(snap) => {
                if let Ok(s) = snap.lock() {
                    let geom = ScreenGeom::from(s.geom);
                    let bands = overlay_bands(&s.zones, geom);
                    if let Err(e) = native.sync(geom, &bands) {
                        log::warn!("native zone overlay: {e}");
                    }
                    return;
                }
            }
            None => {}
        }
    }
    native.hide();
}

fn park_zone_overlay(app: &AppHandle) {
    sync_native_overlay(app, false, false);
    if let Some(win) = app.get_webview_window("zones") {
        let _ = win.set_ignore_cursor_events(true);
        let _ = win.hide();
    }
}

fn restore_zone_overlay(app: &AppHandle, engine: &AppState) {
    let Some(snap) = app.try_state::<Mutex<ZoneOverlaySnap>>() else {
        return;
    };
    let Ok(s) = snap.lock() else {
        return;
    };
    if s.visible || s.drawing {
        let _ = apply_zone_window(app, engine, s.visible, s.drawing);
    }
}

fn show_picker_inner(app: &AppHandle) -> Result<(), String> {
    let Some(win) = app.get_webview_window("picker") else {
        return Err("picker window missing".into());
    };
    park_zone_overlay(app);
    // Alpha 0 is required on Windows 8+ so WebView2 clears instead of painting opaque.
    let _ = win.set_background_color(Some(Color(0, 0, 0, 0)));
    let id = app.try_state::<AppState>().and_then(|e| e.display_id());
    if let Ok(d) = resolve_display(app, id.as_deref()) {
        let _ = win.set_position(tauri::PhysicalPosition::new(d.x, d.y));
        let _ = win.set_size(tauri::PhysicalSize::new(
            d.width.max(1) as u32,
            d.height.max(1) as u32,
        ));
    } else if let Ok(Some(monitor)) = win.current_monitor() {
        let size = monitor.size();
        let pos = monitor.position();
        let _ = win.set_position(tauri::PhysicalPosition::new(pos.x, pos.y));
        let _ = win.set_size(tauri::PhysicalSize::new(size.width, size.height));
    }
    let _ = win.set_always_on_top(true);
    let _ = win.set_ignore_cursor_events(false);
    win.show().map_err(|e| e.to_string())?;
    win.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

fn hide_picker_inner(app: &AppHandle, engine: &AppState) -> Result<(), String> {
    engine.set_picking(false);
    let Some(win) = app.get_webview_window("picker") else {
        return Err("picker window missing".into());
    };
    // Release mouse capture so the desktop / main window stay usable.
    let _ = win.set_ignore_cursor_events(true);
    let _ = win.set_always_on_top(false);
    win.hide().map_err(|e| e.to_string())?;
    restore_zone_overlay(app, engine);
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.set_focus();
    }
    Ok(())
}

/// If no active pick session, force-release any leftover capturing picker.
fn ensure_picker_released(app: &AppHandle, engine: &AppState) -> Result<(), String> {
    if engine.is_picking() {
        return Ok(());
    }
    let Some(win) = app.get_webview_window("picker") else {
        return Ok(());
    };
    let visible = win.is_visible().unwrap_or(false);
    if !visible {
        return Ok(());
    }
    log::warn!("picker failsafe: visible while not picking — forcing hide");
    hide_picker_inner(app, engine)
}

fn wire_engine_events(handle: AppHandle, engine: &AppState) {
    let emit_handle = handle.clone();
    let engine_for_events = engine.clone();
    engine.event_bus().subscribe(move |event| {
        match event {
            EngineEvent::StateChanged { to, .. } => {
                let payload = status_of(&engine_for_events, None);
                let payload = EngineStatusPayload {
                    state: to,
                    ..payload
                };
                let _ = emit_handle.emit("engine://status", payload);
            }
            EngineEvent::Log { message, .. } => {
                log::info!("{message}");
                let payload = status_of(&engine_for_events, Some(message));
                let _ = emit_handle.emit("engine://log", payload);
            }
            EngineEvent::ActionStarted { index, path, repeat } => {
                log::info!("action start index={index} path={path:?} repeat={repeat}");
                let _ = emit_handle.emit(
                    "engine://action",
                    serde_json::json!({ "index": index, "path": path, "repeat": repeat }),
                );
            }
            EngineEvent::RecordProgress { count } => {
                let _ = emit_handle.emit(
                    "engine://record",
                    serde_json::json!({ "count": count }),
                );
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let engine = AppState::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir {
                        file_name: Some("caster".into()),
                    }),
                ])
                .build(),
        )
        .manage(engine.clone())
        .manage(Mutex::new(UiPrefs {
            advanced_ui: false,
            overlay_visible: false,
            overlay_opacity: 1.0,
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
        }))
        .manage(Mutex::new(ZoneOverlaySnap::default()))
        .manage(Arc::new(NativeZoneOverlay::new()))
        .setup(move |app| {
            let config_dir = app
                .path()
                .app_config_dir()
                .map_err(|e| format!("config dir: {e}"))?;
            std::fs::create_dir_all(&config_dir)?;
            let settings = load_settings(&config_dir).unwrap_or_default();
            engine.set_clicker_config(settings.clicker.clone());
            engine.set_hotkey_bindings(settings.hotkeys.clone());
            engine.set_process_filter(settings.process_filter.clone());
            {
                let prefs = app.state::<Mutex<UiPrefs>>();
                let mut p = prefs.lock().expect("prefs");
                apply_prefs(&mut p, &settings);
                p.display_id = settings.display_id.clone();
            }
            if settings.start_with_windows {
                let _ = set_start_with_windows(true);
            }
            apply_main_window_shell(
                app.handle(),
                &settings.shell,
                is_autostart_launch(),
            );
            app.manage(SettingsDir(config_dir.clone()));
            // So macro VM can resolve scriptId from the same config dir.
            std::env::set_var("CASTER_CONFIG_DIR", &config_dir);
            engine.set_macros_config_dir(config_dir);

            if let Ok(display) = resolve_display(app.handle(), settings.display_id.as_deref()) {
                apply_display(&engine, &display);
                let prefs = app.state::<Mutex<UiPrefs>>();
                prefs.lock().expect("prefs").display_id = Some(display.id.clone());
            }

            {
                let handle = app.handle().clone();
                let eng = engine.clone();
                engine.set_ui_release(Arc::new(move || {
                    let _ = hide_picker_inner(&handle, &eng);
                }));
            }

            wire_engine_events(app.handle().clone(), &engine);

            if let Err(e) = engine.install_hotkeys() {
                log::error!("hotkeys unavailable: {e}");
            }

            if let Some(overlay) = app.get_webview_window("overlay") {
                let _ = overlay.set_ignore_cursor_events(true);
                if settings.overlay_visible {
                    if let Ok(d) = resolve_display(app.handle(), engine.display_id().as_deref()) {
                        let _ = place_status_overlay(app.handle(), &d);
                    }
                    apply_overlay_opacity(app.handle(), settings.overlay_opacity);
                    let _ = overlay.show();
                }
            }
            if let Some(picker) = app.get_webview_window("picker") {
                let _ = picker.set_background_color(Some(Color(0, 0, 0, 0)));
                let _ = picker.set_ignore_cursor_events(true);
                let _ = picker.set_always_on_top(false);
                let _ = picker.hide();
            }
            if let Some(zones) = app.get_webview_window("zones") {
                let _ = zones.set_background_color(Some(Color(0, 0, 0, 0)));
                let _ = zones.set_ignore_cursor_events(true);
                let _ = zones.set_always_on_top(false);
                let _ = zones.hide();
            }

            let tray_locale = resolve_ui_locale(settings.shell.ui_locale);
            let menu = build_tray_menu(app.handle(), tray_locale)?;
            let _tray = TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip(tray_tooltip(&engine, tray_locale))
                .on_menu_event(|app, event| {
                    let id = event.id.as_ref();
                    let Some(engine) = app.try_state::<AppState>() else {
                        return;
                    };
                    match id {
                        "quit" => {
                            request_app_exit(app, &engine);
                        }
                        "start" => {
                            let shell = app
                                .try_state::<Mutex<UiPrefs>>()
                                .and_then(|p| p.lock().ok().map(|g| g.shell.clone()));
                            let mut started = false;
                            if let Some(shell) = shell.as_ref() {
                                if shell.tray_relaunch_last {
                                    if let (Some(id), Some(dir)) = (
                                        shell.last_clicker_id.as_ref(),
                                        app.try_state::<SettingsDir>(),
                                    ) {
                                        match load_preset(&dir.0, id) {
                                            Ok(preset) => {
                                                engine.set_active_clicker_preset(Some(
                                                    preset.name.clone(),
                                                ));
                                                if let Err(e) = engine.start_clicker(preset.config)
                                                {
                                                    log::warn!("tray start preset failed: {e}");
                                                } else {
                                                    started = true;
                                                    persist(app, &engine);
                                                }
                                            }
                                            Err(e) => {
                                                log::warn!("tray load preset failed: {e}");
                                            }
                                        }
                                    }
                                }
                            }
                            if !started {
                                let cfg = engine.clicker_config();
                                if let Err(e) = engine.start_clicker(cfg) {
                                    log::warn!("tray start failed: {e}");
                                } else {
                                    persist(app, &engine);
                                }
                            }
                            update_tray_tooltip(app, &engine);
                        }
                        "start_macro" => {
                            let shell = app
                                .try_state::<Mutex<UiPrefs>>()
                                .and_then(|p| p.lock().ok().map(|g| g.shell.clone()));
                            let mut started = false;
                            if let Some(shell) = shell.as_ref() {
                                if shell.tray_relaunch_last {
                                    if let (Some(id), Some(dir)) = (
                                        shell.last_macro_id.as_ref(),
                                        app.try_state::<SettingsDir>(),
                                    ) {
                                        match engine.activate_macro_by_name(&dir.0, id) {
                                            Ok(_) => {
                                                started = true;
                                            }
                                            Err(e) => {
                                                log::warn!("tray macro relaunch failed: {e}");
                                            }
                                        }
                                    }
                                }
                            }
                            if !started {
                                if let Err(e) = engine.start_macro() {
                                    log::warn!("tray macro start failed: {e}");
                                }
                            }
                            update_tray_tooltip(app, &engine);
                        }
                        "stop" => {
                            let _ = hide_picker_inner(app, &engine);
                            engine.stop_clicker();
                            persist(app, &engine);
                            update_tray_tooltip(app, &engine);
                        }
                        "show" => {
                            if let Some(main) = app.get_webview_window("main") {
                                let _ = main.show();
                                let _ = main.set_focus();
                            }
                        }
                        "overlay" => {
                            if let Some(prefs) = app.try_state::<Mutex<UiPrefs>>() {
                                let mut visible = false;
                                if let Ok(mut p) = prefs.lock() {
                                    p.overlay_visible = !p.overlay_visible;
                                    visible = p.overlay_visible;
                                }
                                let _ = set_overlay_visible_inner(app, visible);
                                persist(app, &engine);
                            }
                        }
                        _ => {}
                    }
                })
                .build(app)?;

            log::info!("Caster M7 ready (F6 clicker / F9 macro / F8 emergency)");
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            match event {
                WindowEvent::CloseRequested { api, .. } => {
                    let close_to_tray = window
                        .app_handle()
                        .try_state::<Mutex<UiPrefs>>()
                        .and_then(|p| p.lock().ok().map(|g| g.close_to_tray))
                        .unwrap_or(false);
                    if close_to_tray {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                }
                WindowEvent::Moved(_) | WindowEvent::Resized(_) => {
                    let app = window.app_handle();
                    if let Some(engine) = app.try_state::<AppState>() {
                        persist_main_window_bounds(app, &engine);
                    }
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_engine_state,
            get_clicker_metrics,
            get_foreground_exe,
            get_settings,
            save_app_settings,
            confirm_app_exit,
            get_paths,
            open_path,
            reveal_library_entry,
            purge_library_trash_cmd,
            list_scripts_cmd,
            load_script_cmd,
            save_script_cmd,
            delete_script_cmd,
            run_script_session_cmd,
            export_app_settings,
            import_app_settings,
            request_cancel,
            start_clicker,
            pick_point,
            show_screen_picker,
            confirm_screen_pick,
            cancel_screen_pick,
            start_zone_draw,
            get_screen_geom,
            list_displays,
            set_active_display,
            get_zone_overlay_snapshot,
            push_zone_overlay_state,
            set_zone_overlay_visible,
            begin_zone_overlay_draw,
            complete_zone_overlay_draw,
            list_clicker_presets,
            save_clicker_preset,
            load_clicker_preset,
            delete_clicker_preset,
            get_quick_access,
            get_accueil_order_cmd,
            set_accueil_order_cmd,
            reset_accueil_order_cmd,
            get_automations_home_cmd,
            list_process_exes,
            set_quick_favorite,
            launch_clicker_preset,
            launch_saved_macro,
            set_active_clicker_preset,
            set_overlay_visible,
            get_macro,
            set_macro,
            clear_macro,
            list_saved_macros,
            list_macro_library,
            load_saved_macro,
            save_saved_macro,
            create_saved_macro,
            delete_saved_macro,
            duplicate_saved_macro,
            rename_saved_macro,
            get_library_index_cmd,
            list_library_items_cmd,
            create_library_folder_cmd,
            rename_library_folder_cmd,
            delete_library_folder_cmd,
            move_library_item_cmd,
            set_library_item_locked_cmd,
            trash_library_item_cmd,
            restore_library_item_cmd,
            list_clicker_library,
            rename_clicker_preset,
            duplicate_clicker_preset,
            run_macro,
            pause_macro,
            resume_macro,
            pause_clicker,
            resume_clicker,
            read_pixel,
            import_macro_path,
            export_macro_path,
            import_clicker_preset_path,
            export_clicker_preset_path,
            load_preset_macro,
            start_record,
            pause_record,
            resume_record,
            stop_record,
            get_record_state,
            emergency_stop,
            get_hotkey_bindings,
            set_hotkey_bindings
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
