use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::Duration;

use crate::cancel::CancellationToken;
use crate::clicker::{ClickMode, ClickerConfig, ClickerError, ClickerSession};
use crate::event_bus::{EngineEvent, EventBus, LogLevel};
use crate::hotkeys::{default_bindings, HotkeyBindings, HotkeyCallbacks, HotkeyHook};
use crate::input::{default_injector, MouseInjector};
use crate::metrics::{ClickerMetrics, MetricsCollector};
use crate::state::{EngineState, StateTransitionError};

/// Thread-safe handle to engine run state + cancellation + clicker worker.
#[derive(Clone)]
pub struct AppState {
    inner: Arc<Mutex<AppStateInner>>,
    cancel: CancellationToken,
    bus: Arc<EventBus>,
    metrics: MetricsCollector,
    injector: Arc<dyn MouseInjector>,
    config: Arc<Mutex<ClickerConfig>>,
    worker: Arc<Mutex<Option<JoinHandle<Result<u64, ClickerError>>>>>,
    hotkey_stop: Arc<AtomicBool>,
    hotkey_thread: Arc<Mutex<Option<JoinHandle<()>>>>,
    bindings: HotkeyBindings,
}

struct AppStateInner {
    state: EngineState,
}

impl AppState {
    pub fn new() -> Self {
        let injector = default_injector().unwrap_or_else(|_| {
            // Fallback should not happen on Windows; keep process alive in exotic builds.
            Arc::new(crate::input::RecordingInjector::new())
        });
        Self::with_injector(injector)
    }

    pub fn with_injector(injector: Arc<dyn MouseInjector>) -> Self {
        Self {
            inner: Arc::new(Mutex::new(AppStateInner {
                state: EngineState::Idle,
            })),
            cancel: CancellationToken::new(),
            bus: Arc::new(EventBus::new()),
            metrics: MetricsCollector::new(),
            injector,
            config: Arc::new(Mutex::new(ClickerConfig::default())),
            worker: Arc::new(Mutex::new(None)),
            hotkey_stop: Arc::new(AtomicBool::new(false)),
            hotkey_thread: Arc::new(Mutex::new(None)),
            bindings: default_bindings(),
        }
    }

    pub fn state(&self) -> EngineState {
        self.inner.lock().expect("app state lock").state
    }

    pub fn cancellation(&self) -> &CancellationToken {
        &self.cancel
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

    pub fn hotkey_bindings(&self) -> HotkeyBindings {
        self.bindings
    }

    pub fn request_cancel(&self) {
        self.cancel.cancel();
        self.bus.publish(EngineEvent::Log {
            level: LogLevel::Info,
            message: "cancellation requested".into(),
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

    /// Prepare a fresh run: clear cancel flag when returning to Idle / starting.
    pub fn begin_run(&self) -> Result<EngineState, StateTransitionError> {
        self.cancel.reset();
        self.transition_to(EngineState::Running)
    }

    fn ensure_idle_ready(&self) -> Result<(), String> {
        self.join_worker();
        match self.state() {
            EngineState::Idle => Ok(()),
            EngineState::Error | EngineState::Stopping => {
                self.transition_to(EngineState::Idle)
                    .map_err(|e| e.to_string())?;
                Ok(())
            }
            EngineState::Running | EngineState::Paused => Err("engine already active".into()),
        }
    }

    fn join_worker(&self) {
        if let Some(handle) = self.worker.lock().expect("worker lock").take() {
            let _ = handle.join();
        }
    }

    /// Start the autoclicker worker with the given config.
    pub fn start_clicker(&self, config: ClickerConfig) -> Result<EngineState, String> {
        self.ensure_idle_ready()?;
        if config.cps <= 0.0 || !config.cps.is_finite() {
            return Err(format!("invalid CPS: {}", config.cps));
        }
        self.set_clicker_config(config.clone());
        self.begin_run().map_err(|e| e.to_string())?;

        let cancel = self.cancel.clone();
        let injector = Arc::clone(&self.injector);
        let metrics = self.metrics.clone();
        let bus = Arc::clone(&self.bus);
        let app = self.clone();

        let handle = std::thread::spawn(move || {
            let result =
                ClickerSession::run(&config, &cancel, injector.as_ref(), &metrics, Some(&bus), None);
            let _ = app.finish_clicker_run();
            result
        });
        *self.worker.lock().expect("worker lock") = Some(handle);
        Ok(self.state())
    }

    fn finish_clicker_run(&self) -> Result<(), StateTransitionError> {
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

    /// Soft stop: cancel token; worker transitions to Idle.
    pub fn stop_clicker(&self) -> EngineState {
        if matches!(self.state(), EngineState::Running | EngineState::Paused) {
            let _ = self.transition_to(EngineState::Stopping);
        }
        self.request_cancel();
        // Give the worker a brief moment; full join on next start.
        std::thread::sleep(Duration::from_millis(5));
        self.join_worker();
        if self.state() == EngineState::Stopping {
            let _ = self.transition_to(EngineState::Idle);
        }
        self.state()
    }

    /// Emergency stop — intended for hotkey path (no React).
    pub fn emergency_stop(&self) {
        self.bus.publish(EngineEvent::Log {
            level: LogLevel::Warn,
            message: "emergency stop".into(),
        });
        self.stop_clicker();
    }

    /// Toggle start/stop using the last stored config.
    pub fn toggle_clicker(&self) -> Result<EngineState, String> {
        match self.state() {
            EngineState::Running | EngineState::Paused | EngineState::Stopping => {
                Ok(self.stop_clicker())
            }
            _ => {
                let cfg = self.clicker_config();
                self.start_clicker(cfg)
            }
        }
    }

    /// Hold-mode: key down starts (if idle).
    pub fn on_action_key_down(&self) {
        let mode = self.clicker_config().mode;
        match mode {
            ClickMode::Hold => {
                if self.state() == EngineState::Idle {
                    let cfg = self.clicker_config();
                    let _ = self.start_clicker(cfg);
                }
            }
            ClickMode::Toggle => {
                let _ = self.toggle_clicker();
            }
        }
    }

    /// Hold-mode: key up stops.
    pub fn on_action_key_up(&self) {
        if self.clicker_config().mode == ClickMode::Hold {
            let _ = self.stop_clicker();
        }
    }

    /// Install global hotkeys (F6 action / F8 emergency). Idempotent.
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
        let app_em = self.clone();
        let stop = Arc::clone(&self.hotkey_stop);
        let handle = HotkeyHook::start(
            self.bindings,
            HotkeyCallbacks {
                on_action_down: Box::new(move || app_down.on_action_key_down()),
                on_action_up: Box::new(move || app_up.on_action_key_up()),
                on_emergency: Box::new(move || app_em.emergency_stop()),
            },
            stop,
        )?;
        *self.hotkey_thread.lock().expect("hotkey thread") = Some(handle);
        self.bus.publish(EngineEvent::Log {
            level: LogLevel::Info,
            message: format!(
                "hotkeys armed action_vk=0x{:X} emergency_vk=0x{:X}",
                self.bindings.action_vk, self.bindings.emergency_vk
            ),
        });
        Ok(())
    }

    pub fn shutdown_hotkeys(&self) {
        self.hotkey_stop.store(true, Ordering::SeqCst);
        if let Some(handle) = self.hotkey_thread.lock().expect("hotkey thread").take() {
            let _ = handle.join();
        }
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

impl Drop for AppState {
    fn drop(&mut self) {
        // Only shut down when last clone is dropped — Arc strong count on fields.
        // Skipping automatic drop of hotkeys here; shell calls shutdown_hotkeys explicitly.
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::input::{MouseButton, RecordingInjector};
    use std::sync::{Arc, Mutex};

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
        };
        app.start_clicker(cfg).unwrap();
        assert_eq!(app.state(), EngineState::Running);

        // Stop after a short burst.
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
        })
        .unwrap();
        let t0 = std::time::Instant::now();
        app.emergency_stop();
        let elapsed = t0.elapsed();
        assert_eq!(app.state(), EngineState::Idle);
        assert!(
            elapsed < Duration::from_millis(200),
            "emergency stop took {elapsed:?}"
        );
    }
}
