use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use macroengine_engine::{
    load_settings, save_settings, AppSettings, AppState, ClickKind, ClickMode, ClickTarget,
    ClickerConfig, ClickerMetrics, EngineEvent, EngineState, MouseButton, PickedPoint, StopZone,
};
use serde::{Deserialize, Serialize};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, State,
};
use tauri_plugin_log::{Target, TargetKind};

struct SettingsDir(PathBuf);

struct UiPrefs {
    advanced_ui: bool,
    overlay_visible: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct EngineStatusPayload {
    state: EngineState,
    cancelled: bool,
    message: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StartClickerRequest {
    button: MouseButton,
    cps: f64,
    mode: ClickMode,
    #[serde(default)]
    target: ClickTarget,
    #[serde(default)]
    cps_jitter: f64,
    #[serde(default)]
    click_kind: ClickKind,
    #[serde(default = "default_duty")]
    duty_cycle: f64,
    #[serde(default)]
    max_clicks: Option<u64>,
    #[serde(default)]
    max_duration_ms: Option<u64>,
    #[serde(default)]
    stop_zones: Vec<StopZone>,
}

fn default_duty() -> f64 {
    1.0
}

fn status_of(engine: &AppState, message: Option<String>) -> EngineStatusPayload {
    EngineStatusPayload {
        state: engine.state(),
        cancelled: engine.cancellation().is_cancelled(),
        message,
    }
}

fn persist(app: &AppHandle, engine: &AppState) {
    let Some(dir) = app.try_state::<SettingsDir>() else {
        return;
    };
    let (advanced_ui, overlay_visible) = app
        .try_state::<Mutex<UiPrefs>>()
        .and_then(|p| p.lock().ok().map(|g| (g.advanced_ui, g.overlay_visible)))
        .unwrap_or((false, false));
    let settings = AppSettings {
        clicker: engine.clicker_config(),
        advanced_ui,
        overlay_visible,
    };
    if let Err(e) = save_settings(&dir.0, &settings) {
        log::warn!("save settings failed: {e}");
    }
}

#[tauri::command]
fn get_engine_state(engine: State<'_, AppState>) -> EngineStatusPayload {
    status_of(&engine, None)
}

#[tauri::command]
fn get_clicker_metrics(engine: State<'_, AppState>) -> ClickerMetrics {
    engine.metrics()
}

#[tauri::command]
fn get_settings(
    engine: State<'_, AppState>,
    prefs: State<'_, Mutex<UiPrefs>>,
) -> AppSettings {
    let p = prefs.lock().expect("prefs");
    AppSettings {
        clicker: engine.clicker_config(),
        advanced_ui: p.advanced_ui,
        overlay_visible: p.overlay_visible,
    }
}

#[tauri::command]
fn save_app_settings(
    app: AppHandle,
    engine: State<'_, AppState>,
    prefs: State<'_, Mutex<UiPrefs>>,
    settings: AppSettings,
) -> Result<AppSettings, String> {
    engine.set_clicker_config(settings.clicker.clone());
    {
        let mut p = prefs.lock().map_err(|e| e.to_string())?;
        p.advanced_ui = settings.advanced_ui;
        p.overlay_visible = settings.overlay_visible;
    }
    set_overlay_visible_inner(&app, settings.overlay_visible)?;
    persist(&app, &engine);
    Ok(settings)
}

#[tauri::command]
fn request_cancel(app: AppHandle, engine: State<'_, AppState>) -> EngineStatusPayload {
    let state = engine.stop_clicker();
    persist(&app, &engine);
    log::info!("stop requested from UI → {state:?}");
    status_of(&engine, Some("stop requested".into()))
}

#[tauri::command]
fn start_clicker(
    app: AppHandle,
    engine: State<'_, AppState>,
    request: StartClickerRequest,
) -> Result<EngineStatusPayload, String> {
    let config = ClickerConfig {
        button: request.button,
        cps: request.cps,
        mode: request.mode,
        target: request.target,
        cps_jitter: request.cps_jitter,
        click_kind: request.click_kind,
        duty_cycle: request.duty_cycle,
        max_clicks: request.max_clicks,
        max_duration_ms: request.max_duration_ms,
        stop_zones: request.stop_zones,
    };
    engine.start_clicker(config)?;
    persist(&app, &engine);
    Ok(status_of(&engine, Some("running".into())))
}

#[tauri::command]
fn pick_point(engine: State<'_, AppState>) -> Result<PickedPoint, String> {
    // 2s aim window, then capture cursor — documented in UI.
    engine.pick_point_after(Duration::from_secs(2))
}

#[tauri::command]
fn set_overlay_visible(app: AppHandle, prefs: State<'_, Mutex<UiPrefs>>, visible: bool) -> Result<(), String> {
    prefs.lock().map_err(|e| e.to_string())?.overlay_visible = visible;
    set_overlay_visible_inner(&app, visible)
}

fn set_overlay_visible_inner(app: &AppHandle, visible: bool) -> Result<(), String> {
    let Some(win) = app.get_webview_window("overlay") else {
        return Err("overlay window missing".into());
    };
    if visible {
        win.show().map_err(|e| e.to_string())?;
        let _ = win.set_ignore_cursor_events(true);
    } else {
        win.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn wire_engine_events(handle: AppHandle, engine: &AppState) {
    let emit_handle = handle.clone();
    engine.event_bus().subscribe(move |event| {
        match event {
            EngineEvent::StateChanged { to, .. } => {
                let payload = EngineStatusPayload {
                    state: to,
                    cancelled: false,
                    message: Some(format!("state:{to:?}")),
                };
                let _ = emit_handle.emit("engine://status", payload);
            }
            EngineEvent::Log { message, .. } => {
                log::info!("{message}");
                let payload = EngineStatusPayload {
                    state: EngineState::Idle,
                    cancelled: false,
                    message: Some(message),
                };
                let _ = emit_handle.emit("engine://log", payload);
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let engine = AppState::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir {
                        file_name: Some("macroengine".into()),
                    }),
                ])
                .build(),
        )
        .manage(engine.clone())
        .manage(Mutex::new(UiPrefs {
            advanced_ui: false,
            overlay_visible: false,
        }))
        .setup(move |app| {
            let config_dir = app
                .path()
                .app_config_dir()
                .map_err(|e| format!("config dir: {e}"))?;
            std::fs::create_dir_all(&config_dir)?;
            let settings = load_settings(&config_dir).unwrap_or_default();
            engine.set_clicker_config(settings.clicker.clone());
            {
                let prefs = app.state::<Mutex<UiPrefs>>();
                let mut p = prefs.lock().expect("prefs");
                p.advanced_ui = settings.advanced_ui;
                p.overlay_visible = settings.overlay_visible;
            }
            app.manage(SettingsDir(config_dir));

            wire_engine_events(app.handle().clone(), &engine);

            if let Err(e) = engine.install_hotkeys() {
                log::error!("hotkeys unavailable: {e}");
            }

            if let Some(overlay) = app.get_webview_window("overlay") {
                let _ = overlay.set_ignore_cursor_events(true);
                if settings.overlay_visible {
                    let _ = overlay.show();
                }
            }

            let start = MenuItem::with_id(app, "start", "Démarrer", true, None::<&str>)?;
            let stop = MenuItem::with_id(app, "stop", "Arrêter", true, None::<&str>)?;
            let overlay_item =
                MenuItem::with_id(app, "overlay", "Afficher/Masquer overlay", true, None::<&str>)?;
            let show = MenuItem::with_id(app, "show", "Ouvrir MacroEngine", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&start, &stop, &overlay_item, &show, &quit])?;
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip("MacroEngine")
                .on_menu_event(|app, event| {
                    let id = event.id.as_ref();
                    let Some(engine) = app.try_state::<AppState>() else {
                        return;
                    };
                    match id {
                        "quit" => {
                            persist(app, &engine);
                            engine.shutdown_hotkeys();
                            engine.stop_clicker();
                            app.exit(0);
                        }
                        "start" => {
                            let cfg = engine.clicker_config();
                            if let Err(e) = engine.start_clicker(cfg) {
                                log::warn!("tray start failed: {e}");
                            } else {
                                persist(app, &engine);
                            }
                        }
                        "stop" => {
                            engine.stop_clicker();
                            persist(app, &engine);
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

            log::info!("MacroEngine M1-B ready (F6 action / F8 emergency)");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_engine_state,
            get_clicker_metrics,
            get_settings,
            save_app_settings,
            request_cancel,
            start_clicker,
            pick_point,
            set_overlay_visible
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
