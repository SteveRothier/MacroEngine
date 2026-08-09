use macroengine_engine::{AppState, EngineEvent, EngineState};
use serde::Serialize;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, State,
};
use tauri_plugin_log::{Target, TargetKind};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct EngineStatusPayload {
    state: EngineState,
    cancelled: bool,
    message: Option<String>,
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
fn request_cancel(engine: State<'_, AppState>) -> EngineStatusPayload {
    engine.request_cancel();
    log::info!("cancellation requested from UI");
    status_of(&engine, Some("cancellation requested".into()))
}

#[tauri::command]
fn begin_demo_run(engine: State<'_, AppState>) -> Result<EngineStatusPayload, String> {
    match engine.state() {
        EngineState::Idle => {}
        EngineState::Error | EngineState::Stopping => {
            engine
                .transition_to(EngineState::Idle)
                .map_err(|e| e.to_string())?;
        }
        EngineState::Running | EngineState::Paused => {
            return Err("engine already active".into());
        }
    }
    engine.begin_run().map_err(|e| e.to_string())?;
    log::info!("demo run started (M0 — no input injection)");
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
                // UI refreshes via get_engine_state after this event.
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

            let quit = MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quit])?;
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip("MacroEngine")
                .on_menu_event(|app, event| {
                    if event.id.as_ref() == "quit" {
                        app.exit(0);
                    }
                })
                .build(app)?;

            log::info!("MacroEngine M0 ready");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_engine_state,
            request_cancel,
            begin_demo_run
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
