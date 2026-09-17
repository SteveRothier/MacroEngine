use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Sender};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use crate::cancel::CancellationToken;
use crate::clicker::{ClickMode, ClickerConfig, ClickerSession};
use crate::event_bus::{EngineEvent, EventBus, LogLevel};
use crate::hotkeys::{
    default_bindings, update_live_bindings, update_live_clicker_triggers,
    update_live_macro_triggers, HotkeyBindings, HotkeyCallbacks, HotkeyHook, TriggerBinding,
};
use crate::input::{default_injector, MouseInjector};
use crate::macro_vm::MacroVm;
use crate::metrics::{ClickerMetrics, MetricsCollector};
use crate::pause::PauseGate;
use crate::record::{postprocess_actions, RecordOptions, RecordPostProcess, RecordSession};
use crate::schema::{ActionNode, MacroDocument, SCHEMA_VERSION_CURRENT};
use crate::settings::ProcessFilter;
use crate::state::{EngineState, StateTransitionError};
use crate::stop_zones::ScreenGeom;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ActiveKind {
    None,
    Clicker,
    Macro,
    Script,
    Record,
}

/// Jobs from the LL keyboard hook — processed by a single worker thread.
#[derive(Debug)]
enum HotkeyCmd {
    Emergency,
    ActionDown,
    ActionUp,
    ToggleMacro,
    ToggleClickerPause,
    NamedMacro(String),
    NamedClicker(String),
}

/// Thread-safe handle to engine run state + cancellation + workers.
#[derive(Clone)]
pub struct AppState {
    inner: Arc<Mutex<AppStateInner>>,
    cancel: CancellationToken,
    pause: PauseGate,
    bus: Arc<EventBus>,
    metrics: MetricsCollector,
    injector: Arc<dyn MouseInjector>,
    config: Arc<Mutex<ClickerConfig>>,
    loaded_macro: Arc<Mutex<Option<MacroDocument>>>,
    active: Arc<Mutex<ActiveKind>>,
    worker: Arc<Mutex<Option<JoinHandle<()>>>>,
    /// Serializes start/stop so concurrent hotkey + UI calls share one join.
    lifecycle: Arc<Mutex<()>>,
    /// Single-worker queue for hotkey side-effects (avoids LL hook timeout + thread storms).
    hotkey_tx: Arc<Mutex<Option<Sender<HotkeyCmd>>>>,
    hotkey_stop: Arc<AtomicBool>,
    hotkey_thread: Arc<Mutex<Option<JoinHandle<()>>>>,
    bindings: Arc<Mutex<HotkeyBindings>>,
    record_stop: Arc<Mutex<Option<Arc<AtomicBool>>>>,
    record_thread: Arc<Mutex<Option<JoinHandle<Vec<ActionNode>>>>>,
    /// When true, `stop_record` replaces `doc.actions` instead of appending.
    record_replace: Arc<AtomicBool>,
    /// Config dir for macro library (set from Tauri setup).
    macros_config_dir: Arc<Mutex<Option<std::path::PathBuf>>>,
    /// Last loaded / saved clicker preset name (for Accueil récents).
    active_clicker_preset: Arc<Mutex<Option<String>>>,
    /// Script currently running as an autonomous session.
    active_script_name: Arc<Mutex<Option<String>>>,
    /// Live chord → macro name for per-macro triggers.
    macro_triggers: Arc<Mutex<std::collections::HashMap<TriggerBinding, String>>>,
    /// Live chord → clicker preset name for per-preset triggers.
    clicker_triggers: Arc<Mutex<std::collections::HashMap<TriggerBinding, String>>>,
    /// Optional UI teardown (e.g. hide fullscreen picker) on stop/emergency.
    ui_release: Arc<Mutex<Option<Arc<dyn Fn() + Send + Sync>>>>,
    /// True while the screen picker is actively capturing the cursor.
    picking: Arc<AtomicBool>,
    /// Selected physical display for zones / picker / HUD (not virtual desktop).
    display_id: Arc<Mutex<Option<String>>>,
    zone_screen: Arc<Mutex<ScreenGeom>>,
    process_filter: Arc<Mutex<ProcessFilter>>,
}

struct AppStateInner {
    state: EngineState,
}

impl AppState {
    pub fn new() -> Self {
        let injector = default_injector().unwrap_or_else(|_| {
            Arc::new(crate::input::RecordingInjector::new())
        });
        Self::with_injector(injector)
    }

    pub fn with_injector(injector: Arc<dyn MouseInjector>) -> Self {
        let (tx, rx) = mpsc::channel::<HotkeyCmd>();
        let state = Self {
            inner: Arc::new(Mutex::new(AppStateInner {
                state: EngineState::Idle,
            })),
            cancel: CancellationToken::new(),
            pause: PauseGate::new(),
            bus: Arc::new(EventBus::new()),
            metrics: MetricsCollector::new(),
            injector,
            config: Arc::new(Mutex::new(ClickerConfig::default())),
            loaded_macro: Arc::new(Mutex::new(None)),
            active: Arc::new(Mutex::new(ActiveKind::None)),
            worker: Arc::new(Mutex::new(None)),
            lifecycle: Arc::new(Mutex::new(())),
            hotkey_tx: Arc::new(Mutex::new(Some(tx))),
            hotkey_stop: Arc::new(AtomicBool::new(false)),
            hotkey_thread: Arc::new(Mutex::new(None)),
            bindings: Arc::new(Mutex::new(default_bindings())),
            record_stop: Arc::new(Mutex::new(None)),
            record_thread: Arc::new(Mutex::new(None)),
            record_replace: Arc::new(AtomicBool::new(false)),
            macros_config_dir: Arc::new(Mutex::new(None)),
            active_clicker_preset: Arc::new(Mutex::new(None)),
            active_script_name: Arc::new(Mutex::new(None)),
            macro_triggers: Arc::new(Mutex::new(std::collections::HashMap::new())),
            clicker_triggers: Arc::new(Mutex::new(std::collections::HashMap::new())),
            ui_release: Arc::new(Mutex::new(None)),
            picking: Arc::new(AtomicBool::new(false)),
            display_id: Arc::new(Mutex::new(None)),
            zone_screen: Arc::new(Mutex::new(ScreenGeom::from_size(1920, 1080))),
            process_filter: Arc::new(Mutex::new(ProcessFilter::default())),
        };
        let worker = state.clone();
        let _ = std::thread::Builder::new()
            .name("hotkey-worker".into())
            .spawn(move || {
                while let Ok(cmd) = rx.recv() {
                    worker.dispatch_hotkey(cmd);
                }
            });
        state
    }

    pub fn state(&self) -> EngineState {
        self.inner.lock().expect("app state lock").state
    }

    /// Register a callback invoked on stop/emergency (hide picker, etc.).
    pub fn set_ui_release(&self, cb: Arc<dyn Fn() + Send + Sync>) {
        *self.ui_release.lock().expect("ui_release") = Some(cb);
    }

    pub fn release_ui(&self) {
        if let Some(cb) = self.ui_release.lock().expect("ui_release").clone() {
            cb();
        }
    }

    pub fn set_picking(&self, active: bool) {
        self.picking.store(active, Ordering::SeqCst);
    }

    pub fn is_picking(&self) -> bool {
        self.picking.load(Ordering::SeqCst)
    }

    pub fn display_id(&self) -> Option<String> {
        self.display_id.lock().expect("display_id").clone()
    }

    pub fn set_display_id(&self, id: Option<String>) {
        *self.display_id.lock().expect("display_id") = id;
    }

    pub fn zone_screen(&self) -> ScreenGeom {
        *self.zone_screen.lock().expect("zone_screen")
    }

    pub fn set_zone_screen(&self, geom: ScreenGeom) {
        *self.zone_screen.lock().expect("zone_screen") = geom;
    }

    pub fn zone_screen_handle(&self) -> Arc<Mutex<ScreenGeom>> {
        Arc::clone(&self.zone_screen)
    }

    pub fn process_filter(&self) -> ProcessFilter {
        self.process_filter.lock().expect("process_filter").clone()
    }

    pub fn set_process_filter(&self, filter: ProcessFilter) {
        *self.process_filter.lock().expect("process_filter") = filter;
    }

    pub fn process_filter_handle(&self) -> Arc<Mutex<ProcessFilter>> {
        Arc::clone(&self.process_filter)
    }

    pub fn cancellation(&self) -> &CancellationToken {
        &self.cancel
    }

    pub fn pause_gate(&self) -> &PauseGate {
        &self.pause
    }

    pub fn event_bus(&self) -> &EventBus {
        &self.bus
    }

    pub fn metrics(&self) -> ClickerMetrics {
        self.metrics.snapshot()
    }

    pub fn clicker_config(&self) -> ClickerConfig {
        self.config.lock().expect("config lock").clone()
    }

    pub fn set_clicker_config(&self, config: ClickerConfig) {
        *self.config.lock().expect("config lock") = config;
    }

    pub fn loaded_macro(&self) -> Option<MacroDocument> {
        self.loaded_macro.lock().expect("macro lock").clone()
    }

    pub fn set_macro(&self, doc: MacroDocument) {
        *self.loaded_macro.lock().expect("macro lock") = Some(doc);
    }

    pub fn clear_macro(&self) {
        *self.loaded_macro.lock().expect("macro lock") = None;
    }

    pub fn hotkey_bindings(&self) -> HotkeyBindings {
        *self.bindings.lock().expect("bindings lock")
    }

    pub fn set_hotkey_bindings(&self, bindings: HotkeyBindings) {
        *self.bindings.lock().expect("bindings lock") = bindings;
        update_live_bindings(bindings);
        self.bus.publish(EngineEvent::Log {
            level: LogLevel::Info,
            message: format!(
                "hotkeys updated action=0x{:X} macro=0x{:X} pause=0x{:X} emergency=0x{:X}",
                bindings.action_vk, bindings.macro_vk, bindings.pause_vk, bindings.emergency_vk
            ),
        });
    }

    pub fn is_recording(&self) -> bool {
        *self.active.lock().expect("active lock") == ActiveKind::Record
    }

    /// Live session for Accueil / dock (`clicker` | `macro` | `record`).
    pub fn session_kind_and_name(&self) -> (Option<&'static str>, Option<String>) {
        let kind = *self.active.lock().expect("active lock");
        match kind {
            ActiveKind::None => (None, None),
            ActiveKind::Clicker => (Some("clicker"), self.active_clicker_preset()),
            ActiveKind::Macro => (
                Some("macro"),
                self.loaded_macro().map(|d| d.name),
            ),
            ActiveKind::Script => (
                Some("script"),
                self.active_script_name.lock().expect("script name").clone(),
            ),
            ActiveKind::Record => (
                Some("record"),
                self.loaded_macro().map(|d| d.name),
            ),
        }
    }

    fn session_label(&self) -> Option<String> {
        match self.session_kind_and_name() {
            (Some("clicker"), Some(name)) => Some(format!("Clicker « {name} »")),
            (Some("clicker"), None) => Some("Clicker".into()),
            (Some("macro"), Some(name)) => Some(format!("Macro « {name} »")),
            (Some("macro"), None) => Some("Macro".into()),
            (Some("script"), Some(name)) => Some(format!("Script « {name} »")),
            (Some("script"), None) => Some("Script".into()),
            (Some("record"), Some(name)) => Some(format!("Enregistrement « {name} »")),
            (Some("record"), None) => Some("Enregistrement".into()),
            _ => None,
        }
    }

    fn log_stop(&self, reason: &str) {
        let message = match self.session_label() {
            Some(label) => format!("{reason} · {label}"),
            None => reason.to_string(),
        };
        self.bus.publish(EngineEvent::Log {
            level: LogLevel::Warn,
            message,
        });
    }

    pub fn request_cancel(&self) {
        self.pause.resume();
        self.cancel.cancel();
        self.bus.publish(EngineEvent::Log {
            level: LogLevel::Info,
            message: "Annulation demandée".into(),
        });
    }

    pub fn transition_to(&self, to: EngineState) -> Result<EngineState, StateTransitionError> {
        let mut guard = self.inner.lock().expect("app state lock");
        let from = guard.state;
        let next = from.transition(to)?;
        guard.state = next;
        drop(guard);
        self.bus.publish(EngineEvent::StateChanged { from, to: next });
        Ok(next)
    }

    pub fn begin_run(&self) -> Result<EngineState, StateTransitionError> {
        self.cancel.reset();
        self.pause.reset();
        self.transition_to(EngineState::Running)
    }

    fn ensure_idle_ready(&self) -> Result<(), String> {
        if self.is_recording() {
            return Err("record is active".into());
        }
        // If a previous async stop is finishing, wait briefly outside long critical work.
        self.wait_while_stopping(Duration::from_millis(1000));
        match self.state() {
            EngineState::Running | EngineState::Paused => {
                Err("engine already active".into())
            }
            EngineState::Error | EngineState::Stopping => {
                // Join any leftover handle (async stop may already have taken it).
                self.join_worker();
                *self.active.lock().expect("active lock") = ActiveKind::None;
                if self.state() != EngineState::Idle {
                    self.transition_to(EngineState::Idle)
                        .map_err(|e| e.to_string())?;
                }
                Ok(())
            }
            EngineState::Idle => {
                self.join_worker();
                *self.active.lock().expect("active lock") = ActiveKind::None;
                Ok(())
            }
        }
    }

    fn wait_while_stopping(&self, budget: Duration) {
        let start = std::time::Instant::now();
        while self.state() == EngineState::Stopping && start.elapsed() < budget {
            std::thread::sleep(Duration::from_millis(5));
        }
    }

    fn join_worker(&self) {
        if let Some(handle) = self.worker.lock().expect("worker lock").take() {
            let _ = handle.join();
        }
    }

    /// Cancel run and take the worker handle. Caller joins outside `lifecycle`.
    fn stop_engine_begin_locked(&self) -> Option<JoinHandle<()>> {
        self.release_ui();
        if matches!(self.state(), EngineState::Running | EngineState::Paused) {
            let _ = self.transition_to(EngineState::Stopping);
        }
        self.request_cancel();
        self.worker.lock().expect("worker lock").take()
    }

    fn stop_engine_finish_locked(&self) {
        *self.active.lock().expect("active lock") = ActiveKind::None;
        if self.state() == EngineState::Stopping {
            let _ = self.transition_to(EngineState::Idle);
        }
    }

    /// Join worker off the lifecycle lock so concurrent start/stop are not stuck.
    fn detach_or_join_worker(&self, handle: Option<JoinHandle<()>>, block: bool) {
        match handle {
            Some(h) if block => {
                let _ = h.join();
                let _lifecycle = self.lifecycle.lock().expect("lifecycle");
                self.stop_engine_finish_locked();
            }
            Some(h) => {
                let app = self.clone();
                let _ = std::thread::Builder::new()
                    .name("engine-join".into())
                    .spawn(move || {
                        let _ = h.join();
                        let _lifecycle = app.lifecycle.lock().expect("lifecycle");
                        app.stop_engine_finish_locked();
                    });
            }
            None => {
                let _lifecycle = self.lifecycle.lock().expect("lifecycle");
                self.stop_engine_finish_locked();
            }
        }
    }

    pub fn start_clicker(&self, config: ClickerConfig) -> Result<EngineState, String> {
        self.wait_while_stopping(Duration::from_millis(1000));
        let _lifecycle = self.lifecycle.lock().expect("lifecycle");
        self.start_clicker_inner(config)
    }

    fn start_clicker_inner(&self, config: ClickerConfig) -> Result<EngineState, String> {
        self.ensure_idle_ready()?;
        if config.cps <= 0.0 || !config.cps.is_finite() {
            return Err(format!("invalid CPS: {}", config.cps));
        }
        self.set_clicker_config(config.clone());
        *self.active.lock().expect("active lock") = ActiveKind::Clicker;
        if let Err(e) = self.begin_run() {
            *self.active.lock().expect("active lock") = ActiveKind::None;
            return Err(e.to_string());
        }
        let clicker_label = self
            .active_clicker_preset()
            .unwrap_or_else(|| "Config actuelle".into());
        self.bus.publish(EngineEvent::Log {
            level: LogLevel::Info,
            message: format!("Clicker « {clicker_label} » démarré"),
        });

        let cancel = self.cancel.clone();
        let pause = self.pause.clone();
        let injector = Arc::clone(&self.injector);
        let metrics = self.metrics.clone();
        let bus = Arc::clone(&self.bus);
        let zone_screen = self.zone_screen_handle();
        let process_filter = self.process_filter_handle();
        let app = self.clone();
        let on_complete = config.on_complete_macro.clone();
        let natural_complete = Arc::new(AtomicBool::new(false));
        let natural_flag = Arc::clone(&natural_complete);

        let handle = std::thread::spawn(move || {
            let started = Instant::now();
            let _ = ClickerSession::run_with_zone_screen(
                &config,
                &cancel,
                injector.as_ref(),
                &metrics,
                Some(&bus),
                Some(zone_screen),
                Some(process_filter),
                Some(&pause),
                Some(natural_flag.as_ref()),
            );
            let natural = natural_complete.load(Ordering::SeqCst);
            let cancelled = cancel.is_cancelled();
            let status = if natural {
                crate::quick_access::RecentRunStatus::Ok
            } else if cancelled {
                crate::quick_access::RecentRunStatus::Cancelled
            } else {
                crate::quick_access::RecentRunStatus::Error
            };
            app.finalize_recent_clicker(
                status,
                started.elapsed().as_millis() as u64,
            );
            let _ = app.finish_run();
            if natural {
                if let Some(name) = on_complete.filter(|s| !s.trim().is_empty()) {
                    app.chain_macro_after_clicker(&name);
                }
            }
        });
        *self.worker.lock().expect("worker lock") = Some(handle);
        self.note_recent_clicker();
        Ok(self.state())
    }

    pub fn start_macro(&self) -> Result<EngineState, String> {
        self.start_macro_from("Jouer")
    }

    pub fn start_macro_from(&self, source: &str) -> Result<EngineState, String> {
        self.wait_while_stopping(Duration::from_millis(1000));
        let _lifecycle = self.lifecycle.lock().expect("lifecycle");
        self.start_macro_inner(source, None)
    }

    pub fn start_macro_from_path(
        &self,
        source: &str,
        from_path: Vec<usize>,
    ) -> Result<EngineState, String> {
        self.wait_while_stopping(Duration::from_millis(1000));
        let _lifecycle = self.lifecycle.lock().expect("lifecycle");
        self.start_macro_inner(source, Some(from_path))
    }

    fn start_macro_inner(
        &self,
        via: &str,
        from_path: Option<Vec<usize>>,
    ) -> Result<EngineState, String> {
        self.ensure_idle_ready()?;
        let doc = self
            .loaded_macro()
            .ok_or_else(|| "no macro loaded".to_string())?;
        if doc.actions.is_empty() {
            return Err("macro has no actions".into());
        }
        let start_line = if via == "Jouer" {
            format!("Macro \"{}\" par Jouer", doc.name)
        } else {
            format!("Macro \"{}\" par le raccourci \"{}\"", doc.name, via)
        };
        self.bus.publish(EngineEvent::Log {
            level: LogLevel::Info,
            message: start_line,
        });
        self.begin_run().map_err(|e| e.to_string())?;
        *self.active.lock().expect("active lock") = ActiveKind::Macro;

        let cancel = self.cancel.clone();
        let pause = self.pause.clone();
        let injector = Arc::clone(&self.injector);
        let bus = Arc::clone(&self.bus);
        let process_filter = self.process_filter_handle();
        let app = self.clone();
        let macro_name = doc.name.clone();
        let recent_name = macro_name.clone();

        let handle = std::thread::spawn(move || {
            let started = Instant::now();
            let vm = MacroVm::with_injector(injector);
            let from = from_path.as_deref();
            let status = match vm.run_from_path(
                &doc,
                &cancel,
                &pause,
                &bus,
                Some(process_filter),
                from,
            ) {
                Ok(trace) => {
                    bus.publish(EngineEvent::Log {
                        level: LogLevel::Info,
                        message: format!(
                            "Fin « {} » · {} étapes",
                            macro_name,
                            trace.len()
                        ),
                    });
                    crate::quick_access::RecentRunStatus::Ok
                }
                Err(e) => {
                    bus.publish(EngineEvent::Log {
                        level: LogLevel::Warn,
                        message: format!("Arrêt « {macro_name} » · {e}"),
                    });
                    if cancel.is_cancelled() {
                        crate::quick_access::RecentRunStatus::Cancelled
                    } else {
                        crate::quick_access::RecentRunStatus::Error
                    }
                }
            };
            app.finalize_recent_macro(
                &macro_name,
                status,
                started.elapsed().as_millis() as u64,
            );
            let _ = app.finish_run();
        });
        *self.worker.lock().expect("worker lock") = Some(handle);
        self.note_recent_macro(&recent_name);
        Ok(self.state())
    }

    fn finish_run(&self) -> Result<(), StateTransitionError> {
        *self.active.lock().expect("active lock") = ActiveKind::None;
        match self.state() {
            EngineState::Running | EngineState::Paused => {
                self.transition_to(EngineState::Stopping)?;
                self.transition_to(EngineState::Idle)?;
            }
            EngineState::Stopping => {
                self.transition_to(EngineState::Idle)?;
            }
            _ => {}
        }
        Ok(())
    }

    /// Soft stop for clicker or macro (returns quickly; join runs off-lock).
    pub fn stop_engine(&self) -> EngineState {
        if matches!(
            self.state(),
            EngineState::Running | EngineState::Paused
        ) {
            self.log_stop("Arrêt demandé");
        }
        let handle = {
            let _lifecycle = self.lifecycle.lock().expect("lifecycle");
            self.stop_engine_begin_locked()
        };
        // Block briefly so unit tests / callers see Idle soon, but never hold lifecycle.
        self.detach_or_join_worker(handle, true);
        self.state()
    }

    /// Alias kept for clicker IPC compatibility.
    pub fn stop_clicker(&self) -> EngineState {
        self.stop_engine()
    }

    pub fn pause_macro(&self) -> Result<EngineState, String> {
        if *self.active.lock().expect("active lock") != ActiveKind::Macro {
            return Err("no macro running".into());
        }
        if self.state() != EngineState::Running {
            return Err("macro not running".into());
        }
        self.pause.pause();
        self.transition_to(EngineState::Paused)
            .map_err(|e| e.to_string())
    }

    pub fn resume_macro(&self) -> Result<EngineState, String> {
        if *self.active.lock().expect("active lock") != ActiveKind::Macro {
            return Err("no macro paused".into());
        }
        if self.state() != EngineState::Paused {
            return Err("macro not paused".into());
        }
        self.pause.resume();
        self.transition_to(EngineState::Running)
            .map_err(|e| e.to_string())
    }

    pub fn pause_clicker(&self) -> Result<EngineState, String> {
        if *self.active.lock().expect("active lock") != ActiveKind::Clicker {
            return Err("no clicker running".into());
        }
        if self.state() != EngineState::Running {
            return Err("clicker not running".into());
        }
        self.pause.pause();
        self.transition_to(EngineState::Paused)
            .map_err(|e| e.to_string())
    }

    pub fn resume_clicker(&self) -> Result<EngineState, String> {
        if *self.active.lock().expect("active lock") != ActiveKind::Clicker {
            return Err("no clicker paused".into());
        }
        if self.state() != EngineState::Paused {
            return Err("clicker not paused".into());
        }
        self.pause.resume();
        self.transition_to(EngineState::Running)
            .map_err(|e| e.to_string())
    }

    /// Sync PauseGate → EngineState for clicker (e.g. pixel condition pause).
    pub fn sync_pause_gate_state(&self) {
        let active = *self.active.lock().expect("active lock");
        if active != ActiveKind::Clicker {
            return;
        }
        if self.pause.is_paused() && self.state() == EngineState::Running {
            let _ = self.transition_to(EngineState::Paused);
        }
    }

    pub fn toggle_clicker_pause(&self) -> Result<EngineState, String> {
        match self.state() {
            EngineState::Running => self.pause_clicker(),
            EngineState::Paused => self.resume_clicker(),
            _ => Err("clicker not active".into()),
        }
    }

    /// After a natural clicker end, load + start a macro (called from clicker worker).
    fn chain_macro_after_clicker(&self, name: &str) {
        use crate::macro_library::load_macro;
        let Some(dir) = self.macros_config_dir() else {
            self.bus.publish(EngineEvent::Log {
                level: LogLevel::Warn,
                message: format!(
                    "enchaînement clicker → macro « {name} » ignoré (pas de dossier macros)"
                ),
            });
            return;
        };
        let doc = match load_macro(&dir, name) {
            Ok(d) => d,
            Err(e) => {
                self.bus.publish(EngineEvent::Log {
                    level: LogLevel::Warn,
                    message: format!("enchaînement clicker → macro « {name} » échoué: {e}"),
                });
                return;
            }
        };
        self.bus.publish(EngineEvent::Log {
            level: LogLevel::Info,
            message: format!("Enchaînement clicker → macro « {name} »"),
        });
        // Detach this finishing clicker JoinHandle so we can spawn the macro worker.
        let _ = self.worker.lock().expect("worker lock").take();
        let _lifecycle = self.lifecycle.lock().expect("lifecycle");
        self.set_macro(doc);
        if let Err(e) = self.start_macro_inner("Enchaînement clicker", None) {
            self.bus.publish(EngineEvent::Log {
                level: LogLevel::Warn,
                message: format!("échec démarrage macro enchaînée: {e}"),
            });
        }
    }

    pub fn emergency_stop(&self) {
        if matches!(
            self.state(),
            EngineState::Running | EngineState::Paused
        ) || self.is_recording()
        {
            self.log_stop("Arrêt d’urgence");
        }
        let handle = {
            let _lifecycle = self.lifecycle.lock().expect("lifecycle");
            if self.is_recording() {
                let _ = self.stop_record();
            }
            self.stop_engine_begin_locked()
        };
        // Async join so F8 / UI emergency never block the hotkey or IPC thread for long.
        self.detach_or_join_worker(handle, false);
    }

    pub fn toggle_clicker(&self) -> Result<EngineState, String> {
        self.wait_while_stopping(Duration::from_millis(1000));
        if matches!(
            self.state(),
            EngineState::Running | EngineState::Paused | EngineState::Stopping
        ) {
            let handle = {
                let _lifecycle = self.lifecycle.lock().expect("lifecycle");
                self.stop_engine_begin_locked()
            };
            self.detach_or_join_worker(handle, true);
            return Ok(self.state());
        }
        let cfg = self.clicker_config();
        let _lifecycle = self.lifecycle.lock().expect("lifecycle");
        self.start_clicker_inner(cfg)
    }

    pub fn toggle_macro(&self) -> Result<EngineState, String> {
        self.wait_while_stopping(Duration::from_millis(1000));
        let decision = {
            let active = *self.active.lock().expect("active lock");
            let state = self.state();
            (active, state)
        };
        match decision {
            (ActiveKind::Macro, EngineState::Running | EngineState::Paused)
            | (ActiveKind::Script, EngineState::Running | EngineState::Paused) => {
                let handle = {
                    let _lifecycle = self.lifecycle.lock().expect("lifecycle");
                    self.stop_engine_begin_locked()
                };
                self.detach_or_join_worker(handle, true);
                Ok(self.state())
            }
            (ActiveKind::Clicker, _) => Err("clicker is active".into()),
            (ActiveKind::Record, _) => {
                let _lifecycle = self.lifecycle.lock().expect("lifecycle");
                let _ = self.stop_record()?;
                Ok(self.state())
            }
            _ => {
                let via = format_vk_label(self.hotkey_bindings().macro_vk);
                let _lifecycle = self.lifecycle.lock().expect("lifecycle");
                self.start_macro_inner(&via, None)
            }
        }
    }

    fn log_hotkey_err(&self, context: &str, err: String) {
        self.bus.publish(EngineEvent::Log {
            level: LogLevel::Warn,
            message: format!("{context}: {err}"),
        });
    }

    fn enqueue_hotkey(&self, cmd: HotkeyCmd) {
        if let Ok(guard) = self.hotkey_tx.lock() {
            if let Some(tx) = guard.as_ref() {
                let _ = tx.send(cmd);
            }
        }
    }

    fn dispatch_hotkey(&self, cmd: HotkeyCmd) {
        match cmd {
            HotkeyCmd::Emergency => self.emergency_stop(),
            HotkeyCmd::ActionDown => {
                if self.is_recording() {
                    return;
                }
                self.on_action_key_down();
            }
            HotkeyCmd::ActionUp => {
                if self.is_recording() {
                    return;
                }
                self.on_action_key_up();
            }
            HotkeyCmd::ToggleMacro => {
                if self.is_recording() {
                    return;
                }
                self.on_macro_key_down();
            }
            HotkeyCmd::ToggleClickerPause => {
                if self.is_recording() {
                    return;
                }
                if *self.active.lock().expect("active lock") != ActiveKind::Clicker {
                    return;
                }
                if let Err(e) = self.toggle_clicker_pause() {
                    self.bus.publish(EngineEvent::Log {
                        level: LogLevel::Warn,
                        message: format!("pause clicker: {e}"),
                    });
                }
            }
            HotkeyCmd::NamedMacro(name) => {
                if self.is_recording() {
                    return;
                }
                self.on_named_macro_key_down(name);
            }
            HotkeyCmd::NamedClicker(name) => {
                if self.is_recording() {
                    return;
                }
                self.on_named_clicker_key_down(name);
            }
        }
    }

    pub fn record_action_count(&self) -> usize {
        if self.is_recording() {
            RecordSession::action_count()
        } else {
            0
        }
    }

    pub fn set_macros_config_dir(&self, dir: std::path::PathBuf) {
        *self.macros_config_dir.lock().expect("macros dir") = Some(dir);
    }

    pub fn macros_config_dir(&self) -> Option<std::path::PathBuf> {
        self.macros_config_dir.lock().expect("macros dir").clone()
    }

    pub fn set_active_clicker_preset(&self, name: Option<String>) {
        *self
            .active_clicker_preset
            .lock()
            .expect("active clicker preset") = name;
    }

    pub fn active_clicker_preset(&self) -> Option<String> {
        self.active_clicker_preset
            .lock()
            .expect("active clicker preset")
            .clone()
    }

    fn note_recent_clicker(&self) {
        let Some(dir) = self.macros_config_dir() else {
            return;
        };
        let id = self
            .active_clicker_preset()
            .unwrap_or_else(|| "Config actuelle".into());
        let _ = crate::quick_access::push_recent(&dir, crate::quick_access::QuickKind::Clicker, &id);
    }

    fn note_recent_macro(&self, name: &str) {
        let Some(dir) = self.macros_config_dir() else {
            return;
        };
        let _ = crate::quick_access::push_recent(&dir, crate::quick_access::QuickKind::Macro, name);
    }

    fn note_recent_script(&self, id: &str) {
        let Some(dir) = self.macros_config_dir() else {
            return;
        };
        let _ = crate::quick_access::push_recent(&dir, crate::quick_access::QuickKind::Script, id);
    }

    fn finalize_recent_clicker(
        &self,
        status: crate::quick_access::RecentRunStatus,
        duration_ms: u64,
    ) {
        let Some(dir) = self.macros_config_dir() else {
            return;
        };
        let id = self
            .active_clicker_preset()
            .unwrap_or_else(|| "Config actuelle".into());
        let _ = crate::quick_access::finalize_recent(
            &dir,
            crate::quick_access::QuickKind::Clicker,
            &id,
            status,
            duration_ms,
        );
    }

    fn finalize_recent_macro(
        &self,
        name: &str,
        status: crate::quick_access::RecentRunStatus,
        duration_ms: u64,
    ) {
        let Some(dir) = self.macros_config_dir() else {
            return;
        };
        let _ = crate::quick_access::finalize_recent(
            &dir,
            crate::quick_access::QuickKind::Macro,
            name,
            status,
            duration_ms,
        );
    }

    fn finalize_recent_script(
        &self,
        id: &str,
        status: crate::quick_access::RecentRunStatus,
        duration_ms: u64,
    ) {
        let Some(dir) = self.macros_config_dir() else {
            return;
        };
        let _ = crate::quick_access::finalize_recent(
            &dir,
            crate::quick_access::QuickKind::Script,
            id,
            status,
            duration_ms,
        );
    }

    pub fn rebuild_macro_triggers(&self) -> Result<(), String> {
        use crate::macro_library::{list_macros, load_macro};
        use crate::schema::Trigger;
        let Some(dir) = self.macros_config_dir() else {
            *self.macro_triggers.lock().expect("triggers") = Default::default();
            crate::hotkeys::update_live_macro_triggers(Default::default());
            return Ok(());
        };
        let bindings = self.hotkey_bindings();
        let reserved = [
            bindings.action_vk,
            bindings.macro_vk,
            bindings.pause_vk,
            bindings.emergency_vk,
        ];
        let names = list_macros(&dir).map_err(|e| e.to_string())?;
        let mut map = std::collections::HashMap::new();
        for name in names {
            let doc = load_macro(&dir, &name).map_err(|e| e.to_string())?;
            if let Trigger::Hotkey { key, mods } = &doc.trigger {
                if let Some(vk) = parse_trigger_vk(key).map(|v| normalize_trigger_vk(v, *mods)) {
                    if reserved.contains(&vk) {
                        self.bus.publish(EngineEvent::Log {
                            level: LogLevel::Warn,
                            message: format!(
                                "trigger VK 0x{vk:X} for « {name} » ignored (reserved hotkey)"
                            ),
                        });
                        continue;
                    }
                    let binding = TriggerBinding::from_mods(vk, *mods);
                    if let Some(prev) = map.insert(binding, name.clone()) {
                        self.bus.publish(EngineEvent::Log {
                            level: LogLevel::Warn,
                            message: format!(
                                "trigger chord for « {name} » overrides « {prev} »"
                            ),
                        });
                    }
                }
            }
        }
        update_live_macro_triggers(map.clone());
        *self.macro_triggers.lock().expect("triggers") = map;
        Ok(())
    }

    pub fn rebuild_clicker_triggers(&self) -> Result<(), String> {
        use crate::clicker_presets::{list_presets, load_preset};
        use crate::schema::Trigger;
        let Some(dir) = self.macros_config_dir() else {
            *self.clicker_triggers.lock().expect("clicker triggers") = Default::default();
            update_live_clicker_triggers(Default::default());
            return Ok(());
        };
        let bindings = self.hotkey_bindings();
        let reserved = [
            bindings.action_vk,
            bindings.macro_vk,
            bindings.pause_vk,
            bindings.emergency_vk,
        ];
        let macro_map = self.macro_triggers.lock().expect("triggers").clone();
        let names = list_presets(&dir).map_err(|e| e.to_string())?;
        let mut map = std::collections::HashMap::new();
        for name in names {
            let preset = match load_preset(&dir, &name) {
                Ok(p) => p,
                Err(_) => continue,
            };
            if let Trigger::Hotkey { key, mods } = &preset.trigger {
                if let Some(vk) = parse_trigger_vk(key).map(|v| normalize_trigger_vk(v, *mods)) {
                    if reserved.contains(&vk) {
                        self.bus.publish(EngineEvent::Log {
                            level: LogLevel::Warn,
                            message: format!(
                                "clicker trigger VK 0x{vk:X} for « {name} » ignored (reserved hotkey)"
                            ),
                        });
                        continue;
                    }
                    let binding = TriggerBinding::from_mods(vk, *mods);
                    if macro_map.contains_key(&binding) {
                        self.bus.publish(EngineEvent::Log {
                            level: LogLevel::Warn,
                            message: format!(
                                "clicker trigger for « {name} » ignored (conflicts with macro)"
                            ),
                        });
                        continue;
                    }
                    if let Some(prev) = map.insert(binding, name.clone()) {
                        self.bus.publish(EngineEvent::Log {
                            level: LogLevel::Warn,
                            message: format!(
                                "clicker trigger for « {name} » overrides « {prev} »"
                            ),
                        });
                    }
                }
            }
        }
        update_live_clicker_triggers(map.clone());
        *self.clicker_triggers.lock().expect("clicker triggers") = map;
        Ok(())
    }

    pub fn start_record(
        &self,
        replace: bool,
        options: RecordOptions,
    ) -> Result<(), String> {
        if matches!(self.state(), EngineState::Running | EngineState::Paused) {
            return Err("cannot record while engine is running".into());
        }
        if self.is_recording() {
            return Err("record already active".into());
        }
        self.join_worker();
        self.record_replace.store(replace, Ordering::SeqCst);
        let bindings = self.hotkey_bindings();
        let skip_vks: Vec<u16> = self
            .macro_triggers
            .lock()
            .expect("triggers")
            .keys()
            .map(|b| b.vk)
            .collect();
        let bus = Arc::clone(&self.bus);
        let (stop, handle) = RecordSession::start(bindings, bus, skip_vks, options)?;
        *self.record_stop.lock().expect("record stop") = Some(stop);
        *self.record_thread.lock().expect("record thread") = Some(handle);
        *self.active.lock().expect("active lock") = ActiveKind::Record;
        Ok(())
    }

    pub fn stop_record(&self) -> Result<MacroDocument, String> {
        if !self.is_recording() {
            return Err("record not active".into());
        }
        if let Some(stop) = self.record_stop.lock().expect("record stop").take() {
            RecordSession::request_stop(&stop);
        }
        let handle = self
            .record_thread
            .lock()
            .expect("record thread")
            .take()
            .ok_or_else(|| "record thread missing".to_string())?;
        let recorded = handle
            .join()
            .map_err(|_| "record thread panicked".to_string())?;
        let recorded = postprocess_actions(recorded, &RecordPostProcess::default());
        let replace = self.record_replace.swap(false, Ordering::SeqCst);
        let mut guard = self.loaded_macro.lock().expect("macro lock");
        let mut doc = guard
            .take()
            .unwrap_or_else(|| MacroDocument::new_empty("Recorded"));
        doc.schema_version = SCHEMA_VERSION_CURRENT;
        if replace {
            doc.actions = recorded;
        } else {
            doc.actions.extend(recorded);
        }
        *guard = Some(doc.clone());
        *self.active.lock().expect("active lock") = ActiveKind::None;
        self.bus.publish(EngineEvent::Log {
            level: LogLevel::Info,
            message: format!("record stopped ({} actions total)", doc.actions.len()),
        });
        Ok(doc)
    }

    pub fn pause_record(&self) -> Result<(), String> {
        RecordSession::pause()
    }

    pub fn resume_record(&self) -> Result<(), String> {
        RecordSession::resume()
    }

    pub fn record_paused(&self) -> bool {
        self.is_recording() && RecordSession::is_paused()
    }

    pub fn on_action_key_down(&self) {
        let mode = self.clicker_config().mode;
        match mode {
            ClickMode::Hold => {
                if self.state() == EngineState::Idle {
                    let cfg = self.clicker_config();
                    if let Err(e) = self.start_clicker(cfg) {
                        self.log_hotkey_err("clicker hotkey", e);
                    }
                }
            }
            ClickMode::Toggle => {
                if let Err(e) = self.toggle_clicker() {
                    self.log_hotkey_err("clicker hotkey", e);
                }
            }
        }
    }

    pub fn on_action_key_up(&self) {
        if self.clicker_config().mode == ClickMode::Hold {
            if *self.active.lock().expect("active lock") == ActiveKind::Clicker {
                let _ = self.stop_engine();
            }
        }
    }

    pub fn on_macro_key_down(&self) {
        if let Err(e) = self.toggle_macro() {
            self.log_hotkey_err("macro hotkey", e);
        }
    }

    pub fn on_named_macro_key_down(&self, name: String) {
        let Some(dir) = self.macros_config_dir() else {
            self.log_hotkey_err("macro trigger", "macros config dir missing".into());
            return;
        };
        if let Err(e) = self.activate_macro_by_name(&dir, &name) {
            self.log_hotkey_err(&format!("macro trigger « {name} »"), e);
        }
    }

    pub fn on_named_clicker_key_down(&self, name: String) {
        if let Err(e) = self.activate_clicker_by_name(&name) {
            self.log_hotkey_err(&format!("clicker trigger « {name} »"), e);
        }
    }

    pub fn activate_clicker_by_name(&self, name: &str) -> Result<EngineState, String> {
        use crate::clicker_presets::load_preset;
        let Some(dir) = self.macros_config_dir() else {
            return Err("config dir missing".into());
        };
        self.wait_while_stopping(Duration::from_millis(1000));
        let decision = {
            let active = *self.active.lock().expect("active lock");
            let state = self.state();
            let preset = self.active_clicker_preset();
            (active, state, preset)
        };
        match decision {
            (
                ActiveKind::Clicker,
                EngineState::Running | EngineState::Paused,
                Some(ref current),
            ) if current == name => {
                let handle = {
                    let _lifecycle = self.lifecycle.lock().expect("lifecycle");
                    self.stop_engine_begin_locked()
                };
                self.detach_or_join_worker(handle, true);
                return Ok(self.state());
            }
            (ActiveKind::Clicker, _, _)
            | (ActiveKind::Macro, EngineState::Running | EngineState::Paused, _)
            | (ActiveKind::Script, EngineState::Running | EngineState::Paused, _) => {
                let handle = {
                    let _lifecycle = self.lifecycle.lock().expect("lifecycle");
                    self.stop_engine_begin_locked()
                };
                self.detach_or_join_worker(handle, true);
            }
            (ActiveKind::Record, _, _) => {
                return Err("cannot start clicker while recording".into());
            }
            _ => {}
        }
        let preset = load_preset(&dir, name).map_err(|e| e.to_string())?;
        self.set_active_clicker_preset(Some(preset.name.clone()));
        let _lifecycle = self.lifecycle.lock().expect("lifecycle");
        self.start_clicker_inner(preset.config)
    }

    fn vk_for_macro_name(&self, name: &str) -> Option<u16> {
        self.macro_triggers
            .lock()
            .expect("triggers")
            .iter()
            .find(|(_, n)| n.as_str() == name)
            .map(|(binding, _)| binding.vk)
    }

    pub fn foreground_exe(&self) -> Option<String> {
        self.injector().foreground_exe()
    }

    fn start_via_for_named_macro(&self, name: &str) -> String {
        self.vk_for_macro_name(name)
            .map(format_vk_label)
            .unwrap_or_else(|| name.to_string())
    }

    pub fn activate_macro_by_name(
        &self,
        config_dir: &std::path::Path,
        name: &str,
    ) -> Result<EngineState, String> {
        use crate::macro_library::load_macro;
        self.wait_while_stopping(Duration::from_millis(1000));
        let loaded = self.loaded_macro();
        let same = loaded.as_ref().is_some_and(|d| d.name == name);
        let via = self.start_via_for_named_macro(name);
        let decision = {
            let active = *self.active.lock().expect("active lock");
            let state = self.state();
            (active, state)
        };
        match decision {
            (ActiveKind::Macro, EngineState::Running | EngineState::Paused) if same => {
                let handle = {
                    let _lifecycle = self.lifecycle.lock().expect("lifecycle");
                    self.stop_engine_begin_locked()
                };
                self.detach_or_join_worker(handle, true);
                Ok(self.state())
            }
            (ActiveKind::Macro, EngineState::Running | EngineState::Paused)
            | (ActiveKind::Script, EngineState::Running | EngineState::Paused) => {
                let handle = {
                    let _lifecycle = self.lifecycle.lock().expect("lifecycle");
                    self.stop_engine_begin_locked()
                };
                self.detach_or_join_worker(handle, true);
                let doc = load_macro(config_dir, name).map_err(|e| e.to_string())?;
                let _lifecycle = self.lifecycle.lock().expect("lifecycle");
                self.set_macro(doc);
                self.start_macro_inner(&via, None)
            }
            (ActiveKind::Clicker, _) => Err("clicker is active".into()),
            (ActiveKind::Record, _) => Ok(self.state()),
            _ => {
                let doc = load_macro(config_dir, name).map_err(|e| e.to_string())?;
                let _lifecycle = self.lifecycle.lock().expect("lifecycle");
                self.set_macro(doc);
                self.start_macro_inner(&via, None)
            }
        }
    }

    /// Load + run a saved macro starting at `from_path` (UI action path).
    pub fn activate_macro_by_name_from_path(
        &self,
        config_dir: &std::path::Path,
        name: &str,
        from_path: Vec<usize>,
    ) -> Result<EngineState, String> {
        use crate::macro_library::load_macro;
        self.wait_while_stopping(Duration::from_millis(1000));
        if matches!(
            *self.active.lock().expect("active lock"),
            ActiveKind::Clicker
        ) {
            return Err("clicker is active".into());
        }
        if matches!(
            self.state(),
            EngineState::Running | EngineState::Paused
        ) {
            let handle = {
                let _lifecycle = self.lifecycle.lock().expect("lifecycle");
                self.stop_engine_begin_locked()
            };
            self.detach_or_join_worker(handle, true);
        }
        let doc = load_macro(config_dir, name).map_err(|e| e.to_string())?;
        let via = format!("Tester depuis étape {}", from_path
            .iter()
            .map(|i| (i + 1).to_string())
            .collect::<Vec<_>>()
            .join("."));
        let _lifecycle = self.lifecycle.lock().expect("lifecycle");
        self.set_macro(doc);
        self.start_macro_inner(&via, Some(from_path))
    }

    /// Run a library script outside of a macro (M5). Cancel via F8 / `request_cancel`.
    pub fn start_script_session(&self, script_id: &str) -> Result<EngineState, String> {
        self.wait_while_stopping(Duration::from_millis(1000));
        let _lifecycle = self.lifecycle.lock().expect("lifecycle");
        self.ensure_idle_ready()?;
        let dir = self
            .macros_config_dir()
            .unwrap_or_else(crate::script_library::config_dir_default);
        let doc = crate::script_library::load_script(&dir, script_id)
            .map_err(|e| e.to_string())?;
        if doc.is_module {
            return Err("module_not_runnable".into());
        }
        let script_name = doc.name.clone();
        self.bus.publish(EngineEvent::Log {
            level: LogLevel::Info,
            message: format!("Script « {script_name} » · exécution autonome"),
        });
        self.note_recent_script(script_id);
        self.begin_run().map_err(|e| e.to_string())?;
        *self.active.lock().expect("active lock") = ActiveKind::Script;
        *self.active_script_name.lock().expect("script name") = Some(script_name.clone());

        let cancel = self.cancel.clone();
        let pause = self.pause.clone();
        let injector = Arc::clone(&self.injector);
        let bus = Arc::clone(&self.bus);
        let app = self.clone();
        let config_dir = dir.clone();
        let script_id_owned = script_id.to_string();

        let handle = std::thread::spawn(move || {
            let started = Instant::now();
            let mut env = crate::env::MacroEnv::new();
            for (k, v) in &doc.param_values {
                env.set(k.clone(), v.clone());
            }
            for def in crate::script_params::parse_param_defs(&doc.source) {
                if env.get(&def.name).is_none() {
                    if let Some(d) = def.default {
                        env.set(def.name, d);
                    }
                }
            }
            let mut opts = crate::script_runtime::ScriptOptions {
                allow_network: doc.allow_network,
                allow_clipboard: doc.allow_clipboard,
                allow_fs: doc.allow_fs,
                allow_macro_control: doc.allow_macro_control,
                allow_input: doc.allow_input,
                allow_process: doc.allow_process,
                language: doc.language,
                config_dir: config_dir.clone(),
                injector: Some(Arc::clone(&injector)),
                run_macro: None,
                call_depth: 0,
            };
            if opts.allow_macro_control {
                let inj = Arc::clone(&injector);
                let cancel_c = cancel.clone();
                let pause_c = pause.clone();
                let bus_ptr = &*bus as *const EventBus as usize;
                opts.run_macro = Some(Arc::new(move |macro_id: &str| {
                    let bus = unsafe { &*(bus_ptr as *const EventBus) };
                    crate::macro_vm::nest_run_macro(macro_id, &inj, &cancel_c, &pause_c, bus)
                }));
            }
            let status = match crate::script_runtime::run_script_with_options(
                &doc.source,
                60_000,
                &mut env,
                &bus,
                &cancel,
                &opts,
            ) {
                Ok(_) => {
                    bus.publish(EngineEvent::Log {
                        level: LogLevel::Info,
                        message: format!("Fin script « {script_name} »"),
                    });
                    crate::quick_access::RecentRunStatus::Ok
                }
                Err(e) => {
                    bus.publish(EngineEvent::Log {
                        level: LogLevel::Warn,
                        message: format!("Arrêt script « {script_name} » · {e}"),
                    });
                    if cancel.is_cancelled() {
                        crate::quick_access::RecentRunStatus::Cancelled
                    } else {
                        crate::quick_access::RecentRunStatus::Error
                    }
                }
            };
            app.finalize_recent_script(
                &script_id_owned,
                status,
                started.elapsed().as_millis() as u64,
            );
            *app.active_script_name.lock().expect("script name") = None;
            let _ = app.finish_run();
        });
        *self.worker.lock().expect("worker lock") = Some(handle);
        Ok(self.state())
    }

    pub fn install_hotkeys(&self) -> Result<(), String> {
        {
            let guard = self.hotkey_thread.lock().expect("hotkey thread");
            if guard.is_some() {
                return Ok(());
            }
        }
        self.hotkey_stop.store(false, Ordering::SeqCst);
        let app_down = self.clone();
        let app_up = self.clone();
        let app_macro = self.clone();
        let app_named = self.clone();
        let app_named_clicker = self.clone();
        let app_pause = self.clone();
        let app_em = self.clone();
        let stop = Arc::clone(&self.hotkey_stop);
        let bindings = self.hotkey_bindings();
        let handle = HotkeyHook::start(
            bindings,
            HotkeyCallbacks {
                on_action_down: Box::new(move || {
                    app_down.enqueue_hotkey(HotkeyCmd::ActionDown);
                }),
                on_action_up: Box::new(move || {
                    app_up.enqueue_hotkey(HotkeyCmd::ActionUp);
                }),
                on_macro_down: Box::new(move || {
                    app_macro.enqueue_hotkey(HotkeyCmd::ToggleMacro);
                }),
                on_named_macro: Box::new(move |name| {
                    app_named.enqueue_hotkey(HotkeyCmd::NamedMacro(name));
                }),
                on_named_clicker: Box::new(move |name| {
                    app_named_clicker.enqueue_hotkey(HotkeyCmd::NamedClicker(name));
                }),
                on_clicker_pause: Box::new(move || {
                    app_pause.enqueue_hotkey(HotkeyCmd::ToggleClickerPause);
                }),
                on_emergency: Box::new(move || {
                    app_em.enqueue_hotkey(HotkeyCmd::Emergency);
                }),
            },
            stop,
        )?;
        *self.hotkey_thread.lock().expect("hotkey thread") = Some(handle);
        let _ = self.rebuild_macro_triggers();
        let _ = self.rebuild_clicker_triggers();
        self.bus.publish(EngineEvent::Log {
            level: LogLevel::Info,
            message: format!(
                "hotkeys armed action=0x{:X} macro=0x{:X} pause=0x{:X} emergency=0x{:X}",
                bindings.action_vk, bindings.macro_vk, bindings.pause_vk, bindings.emergency_vk
            ),
        });
        Ok(())
    }

    pub fn shutdown_hotkeys(&self) {
        self.hotkey_stop.store(true, Ordering::SeqCst);
        if let Some(handle) = self.hotkey_thread.lock().expect("hotkey thread").take() {
            let _ = handle.join();
        }
        // Drop sender so the hotkey worker exits after draining.
        *self.hotkey_tx.lock().expect("hotkey tx") = None;
    }

    pub fn pick_point_after(&self, delay: Duration) -> Result<crate::picker::PickedPoint, String> {
        let token = CancellationToken::new();
        crate::picker::pick_after_delay(self.injector.as_ref(), &token, delay)
            .map_err(|e| e.to_string())
    }

    pub fn pick_point_now(&self) -> Result<crate::picker::PickedPoint, String> {
        crate::picker::pick_now(self.injector.as_ref()).map_err(|e| e.to_string())
    }

    /// Drag LMB to define a custom zone rectangle (up to `timeout`).
    pub fn draw_zone_rect(
        &self,
        timeout: Duration,
    ) -> Result<crate::picker::DrawnRect, String> {
        let token = CancellationToken::new();
        crate::picker::draw_zone_rect(self.injector.as_ref(), &token, timeout)
            .map_err(|e| e.to_string())
    }

    pub fn injector(&self) -> Arc<dyn MouseInjector> {
        Arc::clone(&self.injector)
    }

    #[cfg(test)]
    pub fn join_worker_for_test(&self) {
        self.join_worker();
        if self.state() == EngineState::Stopping {
            let _ = self.transition_to(EngineState::Idle);
        }
        if self.state() == EngineState::Running {
            std::thread::sleep(Duration::from_millis(50));
            self.join_worker();
        }
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

/// Parse trigger key stored as decimal (`"120"`) or hex (`"0x78"`).
pub fn parse_trigger_vk(key: &str) -> Option<u16> {
    let t = key.trim();
    if t.is_empty() {
        return None;
    }
    if let Some(hex) = t
        .strip_prefix("0x")
        .or_else(|| t.strip_prefix("0X"))
    {
        return u16::from_str_radix(hex, 16).ok();
    }
    t.parse::<u16>().ok()
}

/// WebView Ctrl+letter capture sometimes stores ASCII control codes (1–26).
pub fn normalize_trigger_vk(vk: u16, mods: crate::schema::KeyMods) -> u16 {
    if (1..=26).contains(&vk) && (mods.ctrl || mods.alt) {
        0x40 + vk
    } else {
        vk
    }
}

pub fn format_trigger_vk(vk: u16) -> String {
    format_vk_label(vk)
}

/// Human-readable label for common VKs (F-keys, letters, digits, navigation).
pub fn format_vk_label(vk: u16) -> String {
    match vk {
        0x70..=0x7B => format!("F{}", vk - 0x6F), // F1–F12
        0x30..=0x39 => format!("{}", (vk - 0x30) as u8), // 0–9
        0x41..=0x5A => format!("{}", char::from_u32(vk as u32).unwrap_or('?')),
        0x60..=0x69 => format!("Pavé {}", vk - 0x60),
        0x08 => "Retour".into(),
        0x09 => "Tab".into(),
        0x0D => "Entrée".into(),
        0x10 => "Shift".into(),
        0x11 => "Ctrl".into(),
        0x12 => "Alt".into(),
        0x13 => "Pause".into(),
        0x14 => "Verr Maj".into(),
        0x1B => "Échap".into(),
        0x20 => "Espace".into(),
        0x21 => "PgHaut".into(),
        0x22 => "PgBas".into(),
        0x23 => "Fin".into(),
        0x24 => "Début".into(),
        0x25 => "←".into(),
        0x26 => "↑".into(),
        0x27 => "→".into(),
        0x28 => "↓".into(),
        0x2D => "Inser".into(),
        0x2E => "Suppr".into(),
        0x5B | 0x5C => "Win".into(),
        0x5D => "Menu".into(),
        0x6A => "*".into(),
        0x6B => "+".into(),
        0x6C => "Sépar.".into(),
        0x6D => "-".into(),
        0x6E => ".".into(),
        0x6F => "/".into(),
        0x90 => "Verr Num".into(),
        0x91 => "Arrêt défil.".into(),
        _ => format!("0x{vk:X}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::input::{MouseButton, RecordingInjector};
    use crate::schema::{ActionNode, MacroProcessFilterMode, Trigger, SCHEMA_VERSION_CURRENT};
    use crate::settings::ProcessFilter;
    use std::sync::{Arc, Mutex};

    #[test]
    fn format_vk_label_common_keys() {
        assert_eq!(format_vk_label(0x13), "Pause");
        assert_eq!(format_vk_label(0x70), "F1");
        assert_eq!(format_vk_label(0x20), "Espace");
        assert_eq!(format_vk_label(0x0D), "Entrée");
        assert_eq!(format_vk_label(0xE8), "0xE8");
    }

    #[test]
    fn begin_run_emits_state_changed() {
        let app = AppState::with_injector(Arc::new(RecordingInjector::new()));
        let events = Arc::new(Mutex::new(Vec::new()));
        let events_clone = Arc::clone(&events);
        app.event_bus().subscribe(move |e| {
            events_clone.lock().unwrap().push(e);
        });

        app.begin_run().unwrap();
        assert_eq!(app.state(), EngineState::Running);

        let list = events.lock().unwrap();
        assert!(matches!(
            list.first(),
            Some(EngineEvent::StateChanged {
                from: EngineState::Idle,
                to: EngineState::Running
            })
        ));
    }

    #[test]
    fn request_cancel_sets_token() {
        let app = AppState::with_injector(Arc::new(RecordingInjector::new()));
        app.begin_run().unwrap();
        app.request_cancel();
        assert!(app.cancellation().is_cancelled());
    }

    #[test]
    fn start_clicker_emits_clicks_and_returns_idle() {
        let inj = Arc::new(RecordingInjector::new());
        let app = AppState::with_injector(Arc::clone(&inj) as Arc<dyn MouseInjector>);
        let cfg = ClickerConfig {
            button: MouseButton::Left,
            cps: 80.0,
            mode: ClickMode::Toggle,
            ..Default::default()
        };
        app.start_clicker(cfg).unwrap();
        assert_eq!(app.state(), EngineState::Running);

        std::thread::sleep(Duration::from_millis(80));
        app.stop_clicker();
        assert_eq!(app.state(), EngineState::Idle);
        assert!(inj.len() > 0);
        assert!(app.metrics().clicks_emitted > 0);
    }

    #[test]
    fn emergency_stop_returns_idle_quickly() {
        let inj = Arc::new(RecordingInjector::new());
        let app = AppState::with_injector(Arc::clone(&inj) as Arc<dyn MouseInjector>);
        app.start_clicker(ClickerConfig {
            button: MouseButton::Left,
            cps: 100.0,
            mode: ClickMode::Toggle,
            ..Default::default()
        })
        .unwrap();
        let t0 = std::time::Instant::now();
        app.emergency_stop();
        let elapsed = t0.elapsed();
        assert!(
            elapsed < Duration::from_millis(200),
            "emergency stop call took {elapsed:?}"
        );
        let deadline = std::time::Instant::now() + Duration::from_millis(500);
        while app.state() != EngineState::Idle && std::time::Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(5));
        }
        assert_eq!(app.state(), EngineState::Idle);
    }

    #[test]
    fn respects_max_clicks_from_config() {
        let inj = Arc::new(RecordingInjector::new());
        let app = AppState::with_injector(Arc::clone(&inj) as Arc<dyn MouseInjector>);
        let mut cfg = ClickerConfig {
            cps: 120.0,
            ..Default::default()
        };
        cfg.max_clicks = Some(5);
        app.start_clicker(cfg).unwrap();
        std::thread::sleep(Duration::from_millis(200));
        app.join_worker_for_test();
        assert_eq!(app.state(), EngineState::Idle);
        assert_eq!(inj.len(), 5);
    }

    #[test]
    fn start_macro_runs_and_excludes_clicker() {
        let inj = Arc::new(RecordingInjector::new());
        let app = AppState::with_injector(Arc::clone(&inj) as Arc<dyn MouseInjector>);
        app.set_macro(MacroDocument {
            schema_version: SCHEMA_VERSION_CURRENT,
            name: "t".into(),
            trigger: Trigger::Manual,
            repeat_count: 1,
            process_filter: MacroProcessFilterMode::default(),
            local_process_filter: ProcessFilter::default(),
            actions: vec![
                ActionNode::Delay {
                    id: "d0".into(),
                    ms: 500,
                },
                ActionNode::MouseClick {
                    id: "a1".into(),
                    button: "left".into(),
                    x: None,
                    y: None,
                },
            ],
        });
        app.start_macro().unwrap();
        assert_eq!(app.state(), EngineState::Running);
        assert!(app
            .start_clicker(ClickerConfig::default())
            .unwrap_err()
            .contains("active"));
        std::thread::sleep(Duration::from_millis(600));
        app.join_worker_for_test();
        assert_eq!(app.state(), EngineState::Idle);
        assert_eq!(inj.len(), 1);
    }

    #[test]
    fn pause_and_resume_macro() {
        let inj = Arc::new(RecordingInjector::new());
        let app = AppState::with_injector(Arc::clone(&inj) as Arc<dyn MouseInjector>);
        app.set_macro(MacroDocument {
            schema_version: SCHEMA_VERSION_CURRENT,
            name: "t".into(),
            trigger: Trigger::Manual,
            repeat_count: 1,
            process_filter: MacroProcessFilterMode::default(),
            local_process_filter: ProcessFilter::default(),
            actions: vec![
                ActionNode::Delay {
                    id: "d0".into(),
                    ms: 30,
                },
                ActionNode::MouseClick {
                    id: "a1".into(),
                    button: "left".into(),
                    x: None,
                    y: None,
                },
                ActionNode::Delay {
                    id: "d1".into(),
                    ms: 200,
                },
                ActionNode::MouseClick {
                    id: "a2".into(),
                    button: "left".into(),
                    x: None,
                    y: None,
                },
            ],
        });
        app.start_macro().unwrap();
        std::thread::sleep(Duration::from_millis(50));
        app.pause_macro().unwrap();
        assert_eq!(app.state(), EngineState::Paused);
        let mid = inj.len();
        std::thread::sleep(Duration::from_millis(80));
        assert_eq!(inj.len(), mid);
        app.resume_macro().unwrap();
        std::thread::sleep(Duration::from_millis(250));
        app.join_worker_for_test();
        assert_eq!(app.state(), EngineState::Idle);
        assert_eq!(inj.len(), 2);
    }

    #[test]
    fn record_refused_while_running() {
        let inj = Arc::new(RecordingInjector::new());
        let app = AppState::with_injector(Arc::clone(&inj) as Arc<dyn MouseInjector>);
        app.set_macro(MacroDocument {
            schema_version: SCHEMA_VERSION_CURRENT,
            name: "t".into(),
            trigger: Trigger::Manual,
            repeat_count: 1,
            process_filter: MacroProcessFilterMode::default(),
            local_process_filter: ProcessFilter::default(),
            actions: vec![ActionNode::Delay {
                id: "d0".into(),
                ms: 500,
            }],
        });
        app.start_macro().unwrap();
        let err = app.start_record(false, RecordOptions::default()).unwrap_err();
        assert!(err.contains("running"));
        app.stop_engine();
    }

    #[test]
    fn play_refused_while_recording_flag() {
        let inj = Arc::new(RecordingInjector::new());
        let app = AppState::with_injector(Arc::clone(&inj) as Arc<dyn MouseInjector>);
        // Simulate ActiveKind::Record without installing OS hooks (non-portable).
        // start_record will fail on non-Windows; on Windows we only check gate after force.
        // Gate via ensure_idle_ready: mark recording by calling start_record if possible.
        match app.start_record(false, RecordOptions::default()) {
            Ok(()) => {
                let err = app.start_macro().unwrap_err();
                assert!(err.contains("record"));
                let _ = app.stop_record();
            }
            Err(_) => {
                // Platform without hooks — still assert default macro hotkey is F9.
                assert_eq!(app.hotkey_bindings().macro_vk, 0x78);
            }
        }
    }

    #[test]
    fn start_script_session_refuses_module() {
        use crate::script_library::{save_script, ScriptDoc, ScriptLanguage};
        use std::collections::HashMap;
        use std::time::{SystemTime, UNIX_EPOCH};

        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis();
        let dir = std::env::temp_dir().join(format!("caster-mod-{stamp}"));
        let _ = std::fs::remove_dir_all(&dir);
        let doc = ScriptDoc {
            id: "mod1".into(),
            name: "Mod".into(),
            source: "module.exports = {};".into(),
            language: ScriptLanguage::Javascript,
            is_module: true,
            allow_network: false,
            allow_clipboard: false,
            allow_fs: false,
            allow_macro_control: false,
            allow_input: false,
            allow_process: false,
            param_values: HashMap::new(),
        };
        save_script(&dir, &doc).unwrap();

        let inj = Arc::new(RecordingInjector::new());
        let app = AppState::with_injector(Arc::clone(&inj) as Arc<dyn MouseInjector>);
        app.set_macros_config_dir(dir.clone());
        let err = app.start_script_session("mod1").unwrap_err();
        assert_eq!(err, "module_not_runnable");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
