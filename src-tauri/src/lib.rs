use macroengine_engine::{
    AppState, ClickMode, ClickerConfig, ClickerMetrics, EngineEvent, EngineState, MouseButton,
};
use serde::{Deserialize, Serialize};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, State,
};
use tauri_plugin_log::{Target, TargetKind};

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
}

fn status_of(engine: &AppState, message: Option<String>) -> EngineStatusPayload {
    EngineStatusPayload {
        state: engine.state(),
        cancelled: engine.cancellation().is_cancelled(),
        message,
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
fn request_cancel(engine: State<'_, AppState>) -> EngineStatusPayload {
    let state = engine.stop_clicker();
    log::info!("stop requested from UI → {state:?}");
    status_of(&engine, Some("stop requested".into()))
}

#[tauri::command]
fn start_clicker(
    engine: State<'_, AppState>,
    request: StartClickerRequest,
) -> Result<EngineStatusPayload, String> {
    let config = ClickerConfig {
        button: request.button,
        cps: request.cps,
        mode: request.mode,
    };
    engine.start_clicker(config)?;
    log::info!(
        "clicker started button={:?} cps={} mode={:?}",
        request.button,
        request.cps,
        request.mode
    );
    Ok(status_of(&engine, Some("running".into())))
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
        .setup(move |app| {
            wire_engine_events(app.handle().clone(), &engine);

            if let Err(e) = engine.install_hotkeys() {
                log::error!("hotkeys unavailable: {e}");
            }

            let start = MenuItem::with_id(app, "start", "Démarrer", true, None::<&str>)?;
            let stop = MenuItem::with_id(app, "stop", "Arrêter", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&start, &stop, &quit])?;
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
                            engine.shutdown_hotkeys();
                            engine.stop_clicker();
                            app.exit(0);
                        }
                        "start" => {
                            let cfg = engine.clicker_config();
                            if let Err(e) = engine.start_clicker(cfg) {
                                log::warn!("tray start failed: {e}");
                            }
                        }
                        "stop" => {
                            engine.stop_clicker();
                        }
                        _ => {}
                    }
                })
                .build(app)?;

            log::info!("MacroEngine M1-A ready (F6 action / F8 emergency)");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_engine_state,
            get_clicker_metrics,
            request_cancel,
            start_clicker
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
