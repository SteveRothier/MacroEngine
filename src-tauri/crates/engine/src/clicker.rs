//! Dedicated autoclicker session (not MacroVm).

use std::sync::Arc;
use std::thread::{self, JoinHandle};

use serde::{Deserialize, Serialize};

use crate::cancel::CancellationToken;
use crate::event_bus::{EngineEvent, EventBus, LogLevel};
use crate::input::{InputError, MouseButton, MouseInjector};
use crate::metrics::MetricsCollector;
use crate::scheduler::run_cps_loop;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ClickMode {
    /// Session runs until cancelled (hotkey hold releases cancel externally).
    Hold,
    /// Session runs until cancelled / stopped (hotkey toggles).
    Toggle,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClickerConfig {
    pub button: MouseButton,
    /// Target clicks per second (must be > 0).
    pub cps: f64,
    pub mode: ClickMode,
}

impl Default for ClickerConfig {
    fn default() -> Self {
        Self {
            button: MouseButton::Left,
            cps: 10.0,
            mode: ClickMode::Toggle,
        }
    }
}

#[derive(Debug, thiserror::Error, Clone, PartialEq)]
pub enum ClickerError {
    #[error("invalid CPS: {0}")]
    InvalidCps(f64),
    #[error(transparent)]
    Input(#[from] InputError),
    #[error("clicker already running")]
    AlreadyRunning,
}

/// Spawns a background click loop. Caller owns join via returned handle.
pub struct ClickerSession;

impl ClickerSession {
    /// Run clicker on the current thread until cancel / max_clicks.
    pub fn run(
        config: &ClickerConfig,
        cancel: &CancellationToken,
        injector: &dyn MouseInjector,
        metrics: &MetricsCollector,
        bus: Option<&EventBus>,
        max_clicks: Option<u64>,
    ) -> Result<u64, ClickerError> {
        if config.cps <= 0.0 || !config.cps.is_finite() {
            return Err(ClickerError::InvalidCps(config.cps));
        }
        if let Some(bus) = bus {
            bus.publish(EngineEvent::Log {
                level: LogLevel::Info,
                message: format!(
                    "clicker start button={:?} cps={} mode={:?}",
                    config.button, config.cps, config.mode
                ),
            });
        }

        let button = config.button;
        let mut last_err: Option<InputError> = None;
        let completed = run_cps_loop(
            config.cps,
            cancel,
            Some(metrics),
            max_clicks,
            || match injector.click(button) {
                Ok(()) => true,
                Err(e) => {
                    last_err = Some(e);
                    false
                }
            },
        );

        if let Some(e) = last_err {
            return Err(ClickerError::Input(e));
        }
        if let Some(bus) = bus {
            bus.publish(EngineEvent::Log {
                level: LogLevel::Info,
                message: format!("clicker stopped after {completed} clicks"),
            });
        }
        Ok(completed)
    }

    /// Spawn clicker on a dedicated thread.
    pub fn spawn(
        config: ClickerConfig,
        cancel: CancellationToken,
        injector: Arc<dyn MouseInjector>,
        metrics: MetricsCollector,
        bus: Arc<EventBus>,
        max_clicks: Option<u64>,
    ) -> JoinHandle<Result<u64, ClickerError>> {
        thread::spawn(move || {
            Self::run(
                &config,
                &cancel,
                injector.as_ref(),
                &metrics,
                Some(bus.as_ref()),
                max_clicks,
            )
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::input::RecordingInjector;

    #[test]
    fn toggle_session_emits_clicks() {
        let cancel = CancellationToken::new();
        let inj = RecordingInjector::new();
        let metrics = MetricsCollector::new();
        let bus = EventBus::new();
        let cfg = ClickerConfig {
            button: MouseButton::Right,
            cps: 100.0,
            mode: ClickMode::Toggle,
        };
        let n = ClickerSession::run(&cfg, &cancel, &inj, &metrics, Some(&bus), Some(8)).unwrap();
        assert_eq!(n, 8);
        assert_eq!(inj.len(), 8);
        assert!(inj.clicks().iter().all(|b| *b == MouseButton::Right));
    }

    #[test]
    fn cancel_stops_session() {
        let cancel = CancellationToken::new();
        let inj = RecordingInjector::new();
        let metrics = MetricsCollector::new();
        let cfg = ClickerConfig {
            button: MouseButton::Left,
            cps: 50.0,
            mode: ClickMode::Hold,
        };
        let cancel_c = cancel.clone();
        let handle = thread::spawn(move || {
            thread::sleep(std::time::Duration::from_millis(30));
            cancel_c.cancel();
        });
        let n = ClickerSession::run(&cfg, &cancel, &inj, &metrics, None, None).unwrap();
        handle.join().unwrap();
        assert!(n < 50);
    }
}
