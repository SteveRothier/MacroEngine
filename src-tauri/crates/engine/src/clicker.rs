//! Dedicated autoclicker session (not MacroVm).

use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

use crate::cancel::CancellationToken;
use crate::event_bus::{EngineEvent, EventBus, LogLevel};
use crate::input::{InputError, MouseButton, MouseInjector, Point};
use crate::metrics::MetricsCollector;
use crate::scheduler::wait_until;
use crate::stop_zones::{any_zone_hit, StopZone};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ClickMode {
    /// Session runs until cancelled (hotkey hold releases cancel externally).
    Hold,
    /// Session runs until cancelled / stopped (hotkey toggles).
    Toggle,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ClickKind {
    Single,
    Double,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ClickTarget {
    CurrentCursor,
    Fixed { x: i32, y: i32 },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClickerConfig {
    pub button: MouseButton,
    /// Target clicks per second (must be > 0).
    pub cps: f64,
    pub mode: ClickMode,
    #[serde(default)]
    pub target: ClickTarget,
    /// Uniform jitter as fraction of interval (0.0–1.0). 0.1 = ±10%.
    #[serde(default)]
    pub cps_jitter: f64,
    #[serde(default)]
    pub click_kind: ClickKind,
    /// Active fraction of each second-scale window (0–1]. 1.0 = always on.
    #[serde(default = "default_duty")]
    pub duty_cycle: f64,
    #[serde(default)]
    pub max_clicks: Option<u64>,
    #[serde(default)]
    pub max_duration_ms: Option<u64>,
    #[serde(default)]
    pub stop_zones: Vec<StopZone>,
}

fn default_duty() -> f64 {
    1.0
}

impl Default for ClickTarget {
    fn default() -> Self {
        Self::CurrentCursor
    }
}

impl Default for ClickKind {
    fn default() -> Self {
        Self::Single
    }
}

impl Default for ClickerConfig {
    fn default() -> Self {
        Self {
            button: MouseButton::Left,
            cps: 10.0,
            mode: ClickMode::Toggle,
            target: ClickTarget::CurrentCursor,
            cps_jitter: 0.0,
            click_kind: ClickKind::Single,
            duty_cycle: 1.0,
            max_clicks: None,
            max_duration_ms: None,
            stop_zones: Vec::new(),
        }
    }
}

#[derive(Debug, thiserror::Error, Clone, PartialEq)]
pub enum ClickerError {
    #[error("invalid CPS: {0}")]
    InvalidCps(f64),
    #[error("invalid duty cycle: {0}")]
    InvalidDuty(f64),
    #[error(transparent)]
    Input(#[from] InputError),
    #[error("clicker already running")]
    AlreadyRunning,
}

/// Tiny LCG for jitter without extra deps.
struct Rng(u64);

impl Rng {
    fn from_entropy() -> Self {
        let nanos = Instant::now().elapsed().as_nanos() as u64;
        Self(nanos ^ 0xA5A5_5A5A_C3C3_3C3C)
    }

    fn next_f64(&mut self) -> f64 {
        self.0 = self
            .0
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1);
        (self.0 >> 33) as f64 / (u32::MAX as f64)
    }

    /// Uniform in [-amp, +amp].
    fn jitter_factor(&mut self, amp: f64) -> f64 {
        if amp <= 0.0 {
            return 0.0;
        }
        (self.next_f64() * 2.0 - 1.0) * amp.clamp(0.0, 0.95)
    }
}

/// Spawns a background click loop. Caller owns join via returned handle.
pub struct ClickerSession;

impl ClickerSession {
    /// Run clicker on the current thread until cancel / limits.
    pub fn run(
        config: &ClickerConfig,
        cancel: &CancellationToken,
        injector: &dyn MouseInjector,
        metrics: &MetricsCollector,
        bus: Option<&EventBus>,
    ) -> Result<u64, ClickerError> {
        if config.cps <= 0.0 || !config.cps.is_finite() {
            return Err(ClickerError::InvalidCps(config.cps));
        }
        if !(config.duty_cycle > 0.0 && config.duty_cycle <= 1.0 && config.duty_cycle.is_finite())
        {
            return Err(ClickerError::InvalidDuty(config.duty_cycle));
        }
        if let Some(bus) = bus {
            bus.publish(EngineEvent::Log {
                level: LogLevel::Info,
                message: format!(
                    "clicker start button={:?} cps={} mode={:?} kind={:?}",
                    config.button, config.cps, config.mode, config.click_kind
                ),
            });
        }

        metrics.begin(config.cps);
        let mut rng = Rng::from_entropy();
        let base_interval = Duration::from_secs_f64(1.0 / config.cps);
        let session_start = Instant::now();
        let max_duration = config
            .max_duration_ms
            .map(Duration::from_millis);
        let mut completed = 0u64;
        let mut next_deadline = Instant::now() + base_interval;
        let mut last_err: Option<InputError> = None;

        // Duty cycle: 1s windows with on_ms = duty * 1000.
        let duty = config.duty_cycle;

        loop {
            if cancel.is_cancelled() {
                break;
            }
            if let Some(max) = config.max_clicks {
                if completed >= max {
                    break;
                }
            }
            if let Some(max_d) = max_duration {
                if session_start.elapsed() >= max_d {
                    break;
                }
            }

            // Stop zones
            if !config.stop_zones.is_empty() {
                if let (Ok(pos), Ok(screen)) =
                    (injector.cursor_position(), injector.screen_size())
                {
                    if any_zone_hit(&config.stop_zones, pos, screen) {
                        if let Some(bus) = bus {
                            bus.publish(EngineEvent::Log {
                                level: LogLevel::Warn,
                                message: "stop zone hit".into(),
                            });
                        }
                        cancel.cancel();
                        break;
                    }
                }
            }

            // Duty off-phase: skip clicks but keep waiting.
            let in_duty = {
                let ms = session_start.elapsed().as_millis() % 1000;
                ms < ((duty * 1000.0) as u128)
            };

            if !wait_until(next_deadline, cancel) {
                break;
            }
            let actual = Instant::now();
            metrics.record_tick(next_deadline, actual);

            if in_duty {
                if let ClickTarget::Fixed { x, y } = config.target {
                    if let Err(e) = injector.move_to(Point { x, y }) {
                        last_err = Some(e);
                        break;
                    }
                }
                let clicks = match config.click_kind {
                    ClickKind::Single => 1,
                    ClickKind::Double => 2,
                };
                for i in 0..clicks {
                    if let Err(e) = injector.click(config.button) {
                        last_err = Some(e);
                        break;
                    }
                    if i + 1 < clicks {
                        thread::sleep(Duration::from_millis(30));
                    }
                }
                if last_err.is_some() {
                    break;
                }
                completed += 1;
            }

            let jitter = rng.jitter_factor(config.cps_jitter);
            let factor = (1.0 + jitter).max(0.05);
            let step = Duration::from_secs_f64(base_interval.as_secs_f64() * factor);
            next_deadline += step;
            // Prevent unbounded catch-up if we fell behind.
            if next_deadline + step < Instant::now() {
                next_deadline = Instant::now() + step;
            }
        }

        metrics.finish();
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

    pub fn spawn(
        config: ClickerConfig,
        cancel: CancellationToken,
        injector: Arc<dyn MouseInjector>,
        metrics: MetricsCollector,
        bus: Arc<EventBus>,
    ) -> JoinHandle<Result<u64, ClickerError>> {
        thread::spawn(move || {
            Self::run(
                &config,
                &cancel,
                injector.as_ref(),
                &metrics,
                Some(bus.as_ref()),
            )
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::input::RecordingInjector;
    use crate::stop_zones::{ScreenCorner, StopZone};

    #[test]
    fn toggle_session_emits_clicks() {
        let cancel = CancellationToken::new();
        let inj = RecordingInjector::new();
        let metrics = MetricsCollector::new();
        let bus = EventBus::new();
        let mut cfg = ClickerConfig {
            button: MouseButton::Right,
            cps: 100.0,
            mode: ClickMode::Toggle,
            ..Default::default()
        };
        cfg.max_clicks = Some(8);
        let n = ClickerSession::run(&cfg, &cancel, &inj, &metrics, Some(&bus)).unwrap();
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
            ..Default::default()
        };
        let cancel_c = cancel.clone();
        let handle = thread::spawn(move || {
            thread::sleep(Duration::from_millis(30));
            cancel_c.cancel();
        });
        let n = ClickerSession::run(&cfg, &cancel, &inj, &metrics, None).unwrap();
        handle.join().unwrap();
        assert!(n < 50);
    }

    #[test]
    fn fixed_target_moves_before_click() {
        let cancel = CancellationToken::new();
        let inj = RecordingInjector::new();
        let metrics = MetricsCollector::new();
        let mut cfg = ClickerConfig {
            cps: 80.0,
            target: ClickTarget::Fixed { x: 42, y: 99 },
            ..Default::default()
        };
        cfg.max_clicks = Some(3);
        ClickerSession::run(&cfg, &cancel, &inj, &metrics, None).unwrap();
        assert_eq!(inj.moves().len(), 3);
        assert!(inj.moves().iter().all(|p| *p == Point { x: 42, y: 99 }));
    }

    #[test]
    fn double_click_emits_two_inputs() {
        let cancel = CancellationToken::new();
        let inj = RecordingInjector::new();
        let metrics = MetricsCollector::new();
        let mut cfg = ClickerConfig {
            cps: 50.0,
            click_kind: ClickKind::Double,
            ..Default::default()
        };
        cfg.max_clicks = Some(2);
        ClickerSession::run(&cfg, &cancel, &inj, &metrics, None).unwrap();
        assert_eq!(inj.len(), 4);
    }

    #[test]
    fn stop_zone_cancels() {
        let cancel = CancellationToken::new();
        let inj = RecordingInjector::new();
        inj.set_cursor(Point { x: 1, y: 1 });
        let metrics = MetricsCollector::new();
        let cfg = ClickerConfig {
            cps: 100.0,
            stop_zones: vec![StopZone::Corner {
                corner: ScreenCorner::TopLeft,
            }],
            ..Default::default()
        };
        let n = ClickerSession::run(&cfg, &cancel, &inj, &metrics, None).unwrap();
        assert_eq!(n, 0);
        assert!(cancel.is_cancelled());
    }

    #[test]
    fn max_duration_stops() {
        let cancel = CancellationToken::new();
        let inj = RecordingInjector::new();
        let metrics = MetricsCollector::new();
        let cfg = ClickerConfig {
            cps: 100.0,
            max_duration_ms: Some(40),
            ..Default::default()
        };
        let n = ClickerSession::run(&cfg, &cancel, &inj, &metrics, None).unwrap();
        assert!(n < 20);
    }
}
