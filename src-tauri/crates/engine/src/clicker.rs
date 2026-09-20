//! Dedicated autoclicker session (not MacroVm).
//!
//! Process allow/deny is applied per tick via [`crate::settings::ProcessFilter`]:
//! a blocked foreground exe skips the click without stopping the session.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

use crate::cancel::CancellationToken;
use crate::event_bus::{EngineEvent, EventBus, LogLevel};
use crate::input::{InputError, MouseButton, MouseInjector, Point};
use crate::metrics::MetricsCollector;
use crate::pause::PauseGate;
use crate::scheduler::wait_until;
use crate::schema::MacroProcessFilterMode;
use crate::settings::ProcessFilter;
use crate::stop_zones::{zone_hit, ClickSampleMode, ScreenGeom, StopZone, ZoneAction};

/// Soft cap on effective clicks-per-second (Blur FAQ / Windows practical limit).
pub const CPS_SOFT_CAP: f64 = 500.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ClickMode {
    Hold,
    Toggle,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ClickKind {
    Single,
    Double,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum InputKind {
    #[default]
    Mouse,
    Keyboard,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum RateUnit {
    #[default]
    PerSecond,
    PerMinute,
    PerHour,
    PerDay,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum TimingMode {
    #[default]
    Rate,
    Interval,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum DutyMode {
    /// Skip ticks outside duty window (1s cycle) — legacy Blur “pulse”.
    #[default]
    Pulse,
    /// Real press hold for `duty_cycle × period`, then release.
    HoldPct,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum LimitMode {
    #[default]
    Clicks,
    Time,
    /// Stop at whichever threshold is reached first.
    Both,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum PixelConditionAction {
    #[default]
    Stop,
    Pause,
}

/// Stop or pause when screen pixel at (x,y) differs from the sample.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PixelCondition {
    #[serde(default)]
    pub enabled: bool,
    pub x: i32,
    pub y: i32,
    pub r: u8,
    pub g: u8,
    pub b: u8,
    #[serde(default = "default_pixel_tolerance")]
    pub tolerance: u8,
    #[serde(default)]
    pub action: PixelConditionAction,
}

fn default_pixel_tolerance() -> u8 {
    12
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ClickTarget {
    CurrentCursor,
    Fixed { x: i32, y: i32 },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClickPoint {
    pub x: i32,
    pub y: i32,
    #[serde(default = "default_point_clicks")]
    pub clicks: u32,
    #[serde(default)]
    pub radius: i32,
}

fn default_point_clicks() -> u32 {
    1
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum ClickZoneOrder {
    #[default]
    Random,
    Sequence,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClickerConfig {
    pub button: MouseButton,
    /// Rate value in [`rate_unit`] (legacy field name `cps`).
    pub cps: f64,
    pub mode: ClickMode,
    #[serde(default)]
    pub target: ClickTarget,
    /// Uniform jitter as fraction of interval (0.0–1.0). Kept for compat.
    #[serde(default)]
    pub cps_jitter: f64,
    /// Inclusive min rate (same unit as `cps`). `0` = use `cps`.
    #[serde(default)]
    pub cps_min: f64,
    /// Inclusive max rate (same unit as `cps`). `0` = use `cps`.
    #[serde(default)]
    pub cps_max: f64,
    #[serde(default)]
    pub rate_unit: RateUnit,
    #[serde(default)]
    pub timing_mode: TimingMode,
    /// Used when `timing_mode == Interval`.
    #[serde(default = "default_interval_ms")]
    pub interval_ms: f64,
    #[serde(default)]
    pub input_kind: InputKind,
    #[serde(default = "default_key")]
    pub key: String,
    #[serde(default)]
    pub key_shift: bool,
    #[serde(default)]
    pub click_kind: ClickKind,
    #[serde(default = "default_duty")]
    pub duty_cycle: f64,
    #[serde(default)]
    pub duty_mode: DutyMode,
    #[serde(default)]
    pub limits_enabled: bool,
    #[serde(default)]
    pub limit_mode: LimitMode,
    #[serde(default)]
    pub max_clicks: Option<u64>,
    #[serde(default)]
    pub max_duration_ms: Option<u64>,
    /// Macro library name to start after a natural session end.
    #[serde(default)]
    pub on_complete_macro: Option<String>,
    #[serde(default)]
    pub pixel_condition: Option<PixelCondition>,
    #[serde(default)]
    pub random_enabled: bool,
    /// Percent 0–100 mapped onto interval jitter.
    #[serde(default)]
    pub random_pct: f64,
    #[serde(default)]
    pub points_enabled: bool,
    #[serde(default)]
    pub points: Vec<ClickPoint>,
    #[serde(default)]
    pub stop_when_complete: bool,
    #[serde(default)]
    pub stop_zones: Vec<StopZone>,
    #[serde(default)]
    pub click_zone_order: ClickZoneOrder,
    /// Per-preset override of the global process filter (parity with macros).
    #[serde(default)]
    pub process_filter: MacroProcessFilterMode,
    #[serde(default)]
    pub local_process_filter: ProcessFilter,
}

fn default_duty() -> f64 {
    1.0
}

fn default_key() -> String {
    "A".into()
}

fn default_interval_ms() -> f64 {
    100.0
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
            cps_min: 0.0,
            cps_max: 0.0,
            rate_unit: RateUnit::PerSecond,
            timing_mode: TimingMode::Rate,
            interval_ms: default_interval_ms(),
            input_kind: InputKind::Mouse,
            key: default_key(),
            key_shift: false,
            click_kind: ClickKind::Single,
            duty_cycle: 1.0,
            duty_mode: DutyMode::Pulse,
            limits_enabled: false,
            limit_mode: LimitMode::Clicks,
            max_clicks: None,
            max_duration_ms: None,
            on_complete_macro: None,
            pixel_condition: None,
            random_enabled: false,
            random_pct: 0.0,
            points_enabled: false,
            points: Vec::new(),
            stop_when_complete: false,
            stop_zones: Vec::new(),
            click_zone_order: ClickZoneOrder::Random,
            process_filter: MacroProcessFilterMode::Inherit,
            local_process_filter: ProcessFilter::default(),
        }
    }
}

impl ClickerConfig {
    pub fn rate_range(&self) -> (f64, f64) {
        let mut lo = if self.cps_min > 0.0 {
            self.cps_min
        } else {
            self.cps
        };
        let mut hi = if self.cps_max > 0.0 {
            self.cps_max
        } else {
            self.cps
        };
        if lo > hi {
            std::mem::swap(&mut lo, &mut hi);
        }
        (lo.max(0.000_001), hi.max(0.000_001))
    }

    /// Effective jitter amplitude 0–0.95.
    pub fn jitter_amp(&self) -> f64 {
        if self.random_enabled {
            (self.random_pct / 100.0).clamp(0.0, 0.95)
        } else {
            self.cps_jitter.clamp(0.0, 0.95)
        }
    }

    /// Filter actually applied to ticks: global handle, none, or a local snapshot.
    pub fn effective_process_filter(
        &self,
        global: Option<Arc<Mutex<ProcessFilter>>>,
    ) -> Option<Arc<Mutex<ProcessFilter>>> {
        match self.process_filter {
            MacroProcessFilterMode::Inherit => global,
            MacroProcessFilterMode::Off => None,
            MacroProcessFilterMode::Local => {
                Some(Arc::new(Mutex::new(self.local_process_filter.clone())))
            }
        }
    }

    fn period_secs(&self, rng: &mut Rng) -> f64 {
        match self.timing_mode {
            TimingMode::Interval => {
                let ms = self.interval_ms.max(1.0);
                (ms / 1000.0).max(1.0 / CPS_SOFT_CAP)
            }
            TimingMode::Rate => {
                let (lo, hi) = self.rate_range();
                let sampled = rng.range(lo, hi);
                let per_sec = rate_to_per_second(sampled, self.rate_unit);
                1.0 / per_sec
            }
        }
    }
}

pub fn rate_to_per_second(rate: f64, unit: RateUnit) -> f64 {
    let per_sec = match unit {
        RateUnit::PerSecond => rate,
        RateUnit::PerMinute => rate / 60.0,
        RateUnit::PerHour => rate / 3_600.0,
        RateUnit::PerDay => rate / 86_400.0,
    };
    per_sec.clamp(0.000_001, CPS_SOFT_CAP)
}

#[derive(Debug, thiserror::Error, Clone, PartialEq)]
pub enum ClickerError {
    #[error("invalid CPS: {0}")]
    InvalidCps(f64),
    #[error("invalid duty cycle: {0}")]
    InvalidDuty(f64),
    #[error("invalid interval: {0}")]
    InvalidInterval(f64),
    #[error(transparent)]
    Input(#[from] InputError),
    #[error("clicker already running")]
    AlreadyRunning,
}

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

    fn jitter_factor(&mut self, amp: f64) -> f64 {
        if amp <= 0.0 {
            return 0.0;
        }
        (self.next_f64() * 2.0 - 1.0) * amp.clamp(0.0, 0.95)
    }

    fn range(&mut self, lo: f64, hi: f64) -> f64 {
        if (hi - lo).abs() < f64::EPSILON {
            return lo;
        }
        lo + self.next_f64() * (hi - lo)
    }

    fn offset_i32(&mut self, radius: i32) -> i32 {
        if radius <= 0 {
            return 0;
        }
        let r = radius as f64;
        ((self.next_f64() * 2.0 - 1.0) * r).round() as i32
    }

    fn index(&mut self, n: usize) -> usize {
        if n == 0 {
            return 0;
        }
        let i = (self.next_f64() * n as f64).floor() as usize;
        i.min(n - 1)
    }

    fn point_in_rect(&mut self, x: i32, y: i32, w: i32, h: i32) -> Point {
        let w = w.max(1);
        let h = h.max(1);
        let dx = (self.next_f64() * w as f64).floor() as i32;
        let dy = (self.next_f64() * h as f64).floor() as i32;
        Point {
            x: x + dx.min(w - 1).max(0),
            y: y + dy.min(h - 1).max(0),
        }
    }
}

fn click_zone_point(
    zones: &[StopZone],
    rng: &mut Rng,
    seq_idx: &mut usize,
    order: ClickZoneOrder,
) -> Option<Point> {
    let entries: Vec<(ClickSampleMode, i32, i32, i32, i32)> = zones
        .iter()
        .filter_map(|z| {
            z.click_rect()
                .map(|(x, y, w, h)| (z.click_sample(), x, y, w, h))
        })
        .collect();
    if entries.is_empty() {
        return None;
    }
    let i = match order {
        ClickZoneOrder::Random => rng.index(entries.len()),
        ClickZoneOrder::Sequence => {
            let i = *seq_idx % entries.len();
            *seq_idx = seq_idx.saturating_add(1);
            i
        }
    };
    let (mode, x, y, w, h) = entries[i];
    match mode {
        ClickSampleMode::Center => Some(Point {
            x: x + w.max(1) / 2,
            y: y + h.max(1) / 2,
        }),
        ClickSampleMode::Random => Some(rng.point_in_rect(x, y, w, h)),
    }
}

fn emit_pulse(
    config: &ClickerConfig,
    injector: &dyn MouseInjector,
    at: Option<Point>,
) -> Result<(), InputError> {
    if let Some(p) = at {
        injector.move_to(p)?;
    } else if let ClickTarget::Fixed { x, y } = config.target {
        if !config.points_enabled {
            injector.move_to(Point { x, y })?;
        }
    }
    match config.input_kind {
        InputKind::Mouse => {
            let clicks = match config.click_kind {
                ClickKind::Single => 1,
                ClickKind::Double => 2,
            };
            for i in 0..clicks {
                injector.click(config.button)?;
                if i + 1 < clicks {
                    thread::sleep(Duration::from_millis(30));
                }
            }
        }
        InputKind::Keyboard => {
            injector.key_tap_shifted(&config.key, config.key_shift)?;
        }
    }
    Ok(())
}

fn emit_hold(
    config: &ClickerConfig,
    injector: &dyn MouseInjector,
    at: Option<Point>,
    hold: Duration,
    cancel: &CancellationToken,
) -> Result<(), InputError> {
    if let Some(p) = at {
        injector.move_to(p)?;
    } else if let ClickTarget::Fixed { x, y } = config.target {
        if !config.points_enabled {
            injector.move_to(Point { x, y })?;
        }
    }
    match config.input_kind {
        InputKind::Mouse => {
            injector.mouse_down(config.button)?;
            let _ = wait_until(Instant::now() + hold, cancel);
            injector.mouse_up(config.button)?;
        }
        InputKind::Keyboard => {
            injector.key_down_shifted(&config.key, config.key_shift)?;
            let _ = wait_until(Instant::now() + hold, cancel);
            injector.key_up_shifted(&config.key, config.key_shift)?;
        }
    }
    Ok(())
}

pub struct ClickerSession;

fn resolve_zone_geom(
    injector: &dyn MouseInjector,
    zone_screen: &Option<Arc<Mutex<ScreenGeom>>>,
) -> Option<ScreenGeom> {
    if let Some(shared) = zone_screen {
        if let Ok(g) = shared.lock() {
            return Some(*g);
        }
    }
    injector.screen_geom().ok()
}

/// Safety-zone action under the cursor right now, if any.
fn current_zone_action(
    config: &ClickerConfig,
    injector: &dyn MouseInjector,
    zone_screen: &Option<Arc<Mutex<ScreenGeom>>>,
) -> Option<ZoneAction> {
    if config.stop_zones.is_empty() {
        return None;
    }
    let pos = injector.cursor_position().ok()?;
    let geom = resolve_zone_geom(injector, zone_screen)?;
    zone_hit(&config.stop_zones, pos, geom)
}

fn log_start_zone_resume(bus: Option<&EventBus>) {
    if let Some(bus) = bus {
        bus.publish(EngineEvent::Log {
            level: LogLevel::Info,
            message: "start zone resumed the clicker session".into(),
        });
    }
}

/// Block while the gate is paused. A Start zone under the cursor resumes the
/// session, so the pause gate is polled instead of simply waited on.
fn wait_while_paused_with_start_zone(
    gate: &PauseGate,
    config: &ClickerConfig,
    injector: &dyn MouseInjector,
    zone_screen: &Option<Arc<Mutex<ScreenGeom>>>,
    cancel: &CancellationToken,
    bus: Option<&EventBus>,
) -> bool {
    let has_start_zone = config
        .stop_zones
        .iter()
        .any(|z| z.is_safety() && z.action() == ZoneAction::Start);
    while gate.is_paused() {
        if cancel.is_cancelled() {
            return false;
        }
        if has_start_zone
            && current_zone_action(config, injector, zone_screen) == Some(ZoneAction::Start)
        {
            gate.resume();
            log_start_zone_resume(bus);
            break;
        }
        thread::sleep(Duration::from_millis(10));
    }
    !cancel.is_cancelled()
}

impl ClickerSession {
    pub fn run(
        config: &ClickerConfig,
        cancel: &CancellationToken,
        injector: &dyn MouseInjector,
        metrics: &MetricsCollector,
        bus: Option<&EventBus>,
    ) -> Result<u64, ClickerError> {
        Self::run_with_zone_screen(config, cancel, injector, metrics, bus, None, None, None, None)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn run_with_zone_screen(
        config: &ClickerConfig,
        cancel: &CancellationToken,
        injector: &dyn MouseInjector,
        metrics: &MetricsCollector,
        bus: Option<&EventBus>,
        zone_screen: Option<Arc<Mutex<ScreenGeom>>>,
        process_filter: Option<Arc<Mutex<ProcessFilter>>>,
        pause: Option<&PauseGate>,
        natural_complete: Option<&AtomicBool>,
    ) -> Result<u64, ClickerError> {
        if config.timing_mode == TimingMode::Rate {
            let (lo, hi) = config.rate_range();
            if !lo.is_finite() || !hi.is_finite() {
                return Err(ClickerError::InvalidCps(config.cps));
            }
        } else if !(config.interval_ms.is_finite() && config.interval_ms > 0.0) {
            return Err(ClickerError::InvalidInterval(config.interval_ms));
        }
        if !(config.duty_cycle > 0.0 && config.duty_cycle <= 1.0 && config.duty_cycle.is_finite())
        {
            return Err(ClickerError::InvalidDuty(config.duty_cycle));
        }
        if let Some(bus) = bus {
            bus.publish(EngineEvent::Log {
                level: LogLevel::Info,
                message: format!(
                    "clicker start kind={:?} timing={:?} mode={:?}",
                    config.input_kind, config.timing_mode, config.mode
                ),
            });
        }

        let mid = match config.timing_mode {
            TimingMode::Rate => {
                let (lo, hi) = config.rate_range();
                rate_to_per_second((lo + hi) / 2.0, config.rate_unit)
            }
            TimingMode::Interval => 1000.0 / config.interval_ms.max(1.0),
        };
        metrics.begin(mid.min(CPS_SOFT_CAP));
        let mut rng = Rng::from_entropy();
        let session_start = Instant::now();
        let mut completed = 0u64;
        let first_period = config.period_secs(&mut rng);
        let mut next_deadline = Instant::now() + Duration::from_secs_f64(first_period);
        let mut last_err: Option<InputError> = None;
        let duty = config.duty_cycle;
        let mut end_natural = true;

        let points: Vec<ClickPoint> = if config.points_enabled && !config.points.is_empty() {
            config.points.clone()
        } else {
            Vec::new()
        };
        let mut point_idx = 0usize;
        let mut clicks_on_point = 0u32;
        let mut points_done = false;
        let mut cached_exe: Option<String> = None;
        let mut cached_at: Option<Instant> = None;
        let mut click_zone_idx = 0usize;
        let mut pixel_check_at = Instant::now()
            .checked_sub(Duration::from_millis(80))
            .unwrap_or_else(Instant::now);

        loop {
            if cancel.is_cancelled() {
                end_natural = false;
                break;
            }
            if let Some(gate) = pause {
                if !wait_while_paused_with_start_zone(
                    gate,
                    config,
                    injector,
                    &zone_screen,
                    cancel,
                    bus,
                ) {
                    end_natural = false;
                    break;
                }
            }
            if points_done && config.stop_when_complete {
                break;
            }

            if config.limits_enabled {
                match config.limit_mode {
                    LimitMode::Clicks => {
                        if let Some(max) = config.max_clicks {
                            if completed >= max {
                                break;
                            }
                        }
                    }
                    LimitMode::Time => {
                        if let Some(max_ms) = config.max_duration_ms {
                            if session_start.elapsed() >= Duration::from_millis(max_ms) {
                                break;
                            }
                        }
                    }
                    LimitMode::Both => {
                        if let Some(max) = config.max_clicks {
                            if completed >= max {
                                break;
                            }
                        }
                        if let Some(max_ms) = config.max_duration_ms {
                            if session_start.elapsed() >= Duration::from_millis(max_ms) {
                                break;
                            }
                        }
                    }
                }
            }

            if let Some(pc) = config.pixel_condition.as_ref() {
                if pc.enabled && pixel_check_at.elapsed() >= Duration::from_millis(80) {
                    pixel_check_at = Instant::now();
                    if let Ok(rgb) = injector.read_pixel(pc.x, pc.y) {
                        let dr = (rgb.0 as i16 - pc.r as i16).unsigned_abs() as u8;
                        let dg = (rgb.1 as i16 - pc.g as i16).unsigned_abs() as u8;
                        let db = (rgb.2 as i16 - pc.b as i16).unsigned_abs() as u8;
                        let mismatched = dr > pc.tolerance || dg > pc.tolerance || db > pc.tolerance;
                        if mismatched {
                            match pc.action {
                                PixelConditionAction::Stop => {
                                    if let Some(bus) = bus {
                                        bus.publish(EngineEvent::Log {
                                            level: LogLevel::Warn,
                                            message: "pixel condition stop".into(),
                                        });
                                    }
                                    break;
                                }
                                PixelConditionAction::Pause => {
                                    if let Some(gate) = pause {
                                        gate.pause();
                                        if let Some(bus) = bus {
                                            bus.publish(EngineEvent::Log {
                                                level: LogLevel::Info,
                                                message: "pixel condition pause".into(),
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            let mut pause_tick = false;
            match current_zone_action(config, injector, &zone_screen) {
                Some(ZoneAction::Stop) => {
                    if let Some(bus) = bus {
                        bus.publish(EngineEvent::Log {
                            level: LogLevel::Warn,
                            message: "stop zone hit".into(),
                        });
                    }
                    // Natural end (zone safety stop) — allow chain.
                    break;
                }
                Some(ZoneAction::Pause) => {
                    pause_tick = true;
                }
                Some(ZoneAction::Start) => {
                    // Clears the pause-zone tick and lifts a paused session.
                    pause_tick = false;
                    if let Some(gate) = pause {
                        if gate.is_paused() {
                            gate.resume();
                            log_start_zone_resume(bus);
                        }
                    }
                }
                None => {}
            }

            let period = {
                let base = config.period_secs(&mut rng);
                let jitter = rng.jitter_factor(config.jitter_amp());
                let factor = (1.0 + jitter).max(0.05);
                (base / factor).max(1.0 / CPS_SOFT_CAP)
            };

            let in_duty = match config.duty_mode {
                DutyMode::Pulse => {
                    let ms = session_start.elapsed().as_millis() % 1000;
                    ms < ((duty * 1000.0) as u128)
                }
                DutyMode::HoldPct => true,
            };

            if !wait_until(next_deadline, cancel) {
                end_natural = false;
                break;
            }
            let actual = Instant::now();
            metrics.record_tick(next_deadline, actual);

            let filter_blocked = process_tick_blocked(
                process_filter.as_ref(),
                injector,
                &mut cached_exe,
                &mut cached_at,
            );

            if filter_blocked {
                let blocked = metrics.record_filter_block();
                // First block explains the silence, then one line per 100 ticks.
                if blocked == 1 || blocked % 100 == 0 {
                    if let Some(bus) = bus {
                        bus.publish(EngineEvent::Log {
                            level: LogLevel::Warn,
                            message: format!(
                                "clicker process filter blocked ({blocked} ticks)"
                            ),
                        });
                    }
                }
            }

            if pause_tick || filter_blocked || !in_duty {
                // skip emission (pause zone / process filter / duty pulse)
            } else {
                let at = if !points.is_empty() && !points_done {
                    let p = &points[point_idx];
                    Some(Point {
                        x: p.x + rng.offset_i32(p.radius),
                        y: p.y + rng.offset_i32(p.radius),
                    })
                } else if config.input_kind == InputKind::Mouse {
                    click_zone_point(
                        &config.stop_zones,
                        &mut rng,
                        &mut click_zone_idx,
                        config.click_zone_order,
                    )
                } else {
                    None
                };

                let result = match config.duty_mode {
                    DutyMode::Pulse => emit_pulse(config, injector, at),
                    DutyMode::HoldPct => {
                        let hold = Duration::from_secs_f64(period * duty.clamp(0.01, 1.0));
                        emit_hold(config, injector, at, hold, cancel)
                    }
                };
                if let Err(e) = result {
                    last_err = Some(e);
                    end_natural = false;
                    break;
                }
                completed += 1;

                if !points.is_empty() && !points_done {
                    clicks_on_point += 1;
                    let need = points[point_idx].clicks.max(1);
                    if clicks_on_point >= need {
                        clicks_on_point = 0;
                        point_idx += 1;
                        if point_idx >= points.len() {
                            if config.stop_when_complete {
                                points_done = true;
                            } else {
                                point_idx = 0;
                            }
                        }
                    }
                }
            }

            let step = Duration::from_secs_f64(period);
            next_deadline += step;
            if next_deadline + step < Instant::now() {
                next_deadline = Instant::now() + step;
            }
        }

        metrics.finish();
        if let Some(flag) = natural_complete {
            flag.store(end_natural && last_err.is_none(), Ordering::SeqCst);
        }
        if let Some(e) = last_err {
            return Err(ClickerError::Input(e));
        }
        if let Some(bus) = bus {
            bus.publish(EngineEvent::Log {
                level: LogLevel::Info,
                message: format!("clicker stopped after {completed} actions"),
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

const PROCESS_FILTER_CACHE: Duration = Duration::from_millis(80);

fn process_tick_blocked(
    process_filter: Option<&Arc<Mutex<ProcessFilter>>>,
    injector: &dyn MouseInjector,
    cached_exe: &mut Option<String>,
    cached_at: &mut Option<Instant>,
) -> bool {
    let Some(shared) = process_filter else {
        return false;
    };
    let Ok(filter) = shared.lock() else {
        return false;
    };
    if !filter.enabled {
        return false;
    }
    let now = Instant::now();
    let stale = cached_at
        .map(|t| now.duration_since(t) >= PROCESS_FILTER_CACHE)
        .unwrap_or(true);
    if stale {
        *cached_exe = injector.foreground_exe();
        *cached_at = Some(now);
    }
    !filter.allows(cached_exe.as_deref())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::input::RecordingInjector;
    use crate::settings::ProcessFilterMode;
    use crate::stop_zones::{ScreenCorner, ScreenEdge, StopZone, ZoneAction, ZoneKind};

    fn enable_click_limit(cfg: &mut ClickerConfig, n: u64) {
        cfg.limits_enabled = true;
        cfg.limit_mode = LimitMode::Clicks;
        cfg.max_clicks = Some(n);
    }

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
        enable_click_limit(&mut cfg, 8);
        let n = ClickerSession::run(&cfg, &cancel, &inj, &metrics, Some(&bus)).unwrap();
        assert_eq!(n, 8);
        assert_eq!(inj.len(), 8);
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
        enable_click_limit(&mut cfg, 3);
        ClickerSession::run(&cfg, &cancel, &inj, &metrics, None).unwrap();
        assert_eq!(inj.moves().len(), 3);
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
        enable_click_limit(&mut cfg, 2);
        ClickerSession::run(&cfg, &cancel, &inj, &metrics, None).unwrap();
        assert_eq!(inj.len(), 4);
    }

    #[test]
    fn stop_zone_ends_naturally() {
        let cancel = CancellationToken::new();
        let inj = RecordingInjector::new();
        inj.set_cursor(Point { x: 1, y: 1 });
        let metrics = MetricsCollector::new();
        let cfg = ClickerConfig {
            cps: 100.0,
            stop_zones: vec![StopZone::Corner {
                corner: ScreenCorner::TopLeft,
                size_px: 50,
                width_px: 0,
                height_px: 0,
                color: String::new(),
            }],
            ..Default::default()
        };
        let natural = AtomicBool::new(false);
        let n = ClickerSession::run_with_zone_screen(
            &cfg,
            &cancel,
            &inj,
            &metrics,
            None,
            None,
            None,
            None,
            Some(&natural),
        )
        .unwrap();
        assert_eq!(n, 0);
        assert!(!cancel.is_cancelled());
        assert!(natural.load(Ordering::SeqCst));
    }

    #[test]
    fn edge_stop_ends_naturally() {
        let cancel = CancellationToken::new();
        let inj = RecordingInjector::new();
        inj.set_cursor(Point { x: 2, y: 500 });
        let metrics = MetricsCollector::new();
        let cfg = ClickerConfig {
            cps: 100.0,
            stop_zones: vec![StopZone::Edge {
                edge: ScreenEdge::Left,
                margin_px: 40,
            }],
            ..Default::default()
        };
        let natural = AtomicBool::new(false);
        let n = ClickerSession::run_with_zone_screen(
            &cfg,
            &cancel,
            &inj,
            &metrics,
            None,
            None,
            None,
            None,
            Some(&natural),
        )
        .unwrap();
        assert_eq!(n, 0);
        assert!(!cancel.is_cancelled());
        assert!(natural.load(Ordering::SeqCst));
    }

    #[test]
    fn max_duration_stops() {
        let cancel = CancellationToken::new();
        let inj = RecordingInjector::new();
        let metrics = MetricsCollector::new();
        let cfg = ClickerConfig {
            cps: 100.0,
            limits_enabled: true,
            limit_mode: LimitMode::Time,
            max_duration_ms: Some(40),
            ..Default::default()
        };
        let n = ClickerSession::run(&cfg, &cancel, &inj, &metrics, None).unwrap();
        assert!(n < 20);
    }

    #[test]
    fn pixel_condition_stop_on_mismatch() {
        let cancel = CancellationToken::new();
        let inj = RecordingInjector::new();
        inj.set_pixel(Some((10, 20, 30)));
        let metrics = MetricsCollector::new();
        let mut cfg = ClickerConfig {
            cps: 100.0,
            pixel_condition: Some(PixelCondition {
                enabled: true,
                x: 0,
                y: 0,
                r: 200,
                g: 200,
                b: 200,
                tolerance: 5,
                action: PixelConditionAction::Stop,
            }),
            ..Default::default()
        };
        enable_click_limit(&mut cfg, 50);
        let natural = AtomicBool::new(false);
        let n = ClickerSession::run_with_zone_screen(
            &cfg,
            &cancel,
            &inj,
            &metrics,
            None,
            None,
            None,
            None,
            Some(&natural),
        )
        .unwrap();
        assert_eq!(n, 0);
        assert!(natural.load(Ordering::SeqCst));
    }

    #[test]
    fn limits_disabled_ignores_max_clicks() {
        let cancel = CancellationToken::new();
        let inj = RecordingInjector::new();
        let metrics = MetricsCollector::new();
        let cfg = ClickerConfig {
            cps: 200.0,
            limits_enabled: false,
            max_clicks: Some(1),
            max_duration_ms: Some(1),
            ..Default::default()
        };
        let cancel_c = cancel.clone();
        let handle = thread::spawn(move || {
            thread::sleep(Duration::from_millis(40));
            cancel_c.cancel();
        });
        let n = ClickerSession::run(&cfg, &cancel, &inj, &metrics, None).unwrap();
        handle.join().unwrap();
        assert!(n > 1, "expected continuous clicking when limits disabled, got {n}");
    }

    #[test]
    fn keyboard_mode_records_keys() {
        let cancel = CancellationToken::new();
        let inj = RecordingInjector::new();
        let metrics = MetricsCollector::new();
        let mut cfg = ClickerConfig {
            cps: 80.0,
            input_kind: InputKind::Keyboard,
            key: "A".into(),
            key_shift: true,
            ..Default::default()
        };
        enable_click_limit(&mut cfg, 3);
        ClickerSession::run(&cfg, &cancel, &inj, &metrics, None).unwrap();
        assert_eq!(inj.keys().len(), 3);
        assert!(inj.keys().iter().all(|k| k.contains('A')));
    }

    #[test]
    fn rate_per_minute_is_slower() {
        assert!((rate_to_per_second(60.0, RateUnit::PerMinute) - 1.0).abs() < 1e-9);
        assert!(rate_to_per_second(600.0, RateUnit::PerSecond) <= CPS_SOFT_CAP);
    }

    #[test]
    fn cps_range_uses_min_max() {
        let cfg = ClickerConfig {
            cps: 10.0,
            cps_min: 5.0,
            cps_max: 15.0,
            ..Default::default()
        };
        assert_eq!(cfg.rate_range(), (5.0, 15.0));
    }

    #[test]
    fn interval_mode_respects_max_clicks() {
        let cancel = CancellationToken::new();
        let inj = RecordingInjector::new();
        let metrics = MetricsCollector::new();
        let mut cfg = ClickerConfig {
            timing_mode: TimingMode::Interval,
            interval_ms: 5.0,
            max_clicks: Some(5),
            ..Default::default()
        };
        cfg.limits_enabled = true;
        cfg.limit_mode = LimitMode::Clicks;
        let n = ClickerSession::run(&cfg, &cancel, &inj, &metrics, None).unwrap();
        assert_eq!(n, 5);
    }

    #[test]
    fn hold_pct_records_down_up() {
        let cancel = CancellationToken::new();
        let inj = RecordingInjector::new();
        let metrics = MetricsCollector::new();
        let mut cfg = ClickerConfig {
            timing_mode: TimingMode::Interval,
            interval_ms: 20.0,
            duty_mode: DutyMode::HoldPct,
            duty_cycle: 0.5,
            max_clicks: Some(2),
            ..Default::default()
        };
        cfg.limits_enabled = true;
        ClickerSession::run(&cfg, &cancel, &inj, &metrics, None).unwrap();
        assert_eq!(inj.downs().len(), 2);
        assert_eq!(inj.ups().len(), 2);
    }

    #[test]
    fn limits_xor_time_ignores_clicks() {
        let cancel = CancellationToken::new();
        let inj = RecordingInjector::new();
        let metrics = MetricsCollector::new();
        let cfg = ClickerConfig {
            cps: 200.0,
            limits_enabled: true,
            limit_mode: LimitMode::Time,
            max_clicks: Some(1),
            max_duration_ms: Some(40),
            ..Default::default()
        };
        let n = ClickerSession::run(&cfg, &cancel, &inj, &metrics, None).unwrap();
        assert!(n > 1);
    }

    #[test]
    fn limits_both_stops_on_clicks_first() {
        let cancel = CancellationToken::new();
        let inj = RecordingInjector::new();
        let metrics = MetricsCollector::new();
        let cfg = ClickerConfig {
            timing_mode: TimingMode::Interval,
            interval_ms: 5.0,
            limits_enabled: true,
            limit_mode: LimitMode::Both,
            max_clicks: Some(3),
            max_duration_ms: Some(60_000),
            ..Default::default()
        };
        let n = ClickerSession::run(&cfg, &cancel, &inj, &metrics, None).unwrap();
        assert_eq!(n, 3);
    }

    #[test]
    fn limits_both_stops_on_duration_first() {
        let cancel = CancellationToken::new();
        let inj = RecordingInjector::new();
        let metrics = MetricsCollector::new();
        let cfg = ClickerConfig {
            cps: 200.0,
            limits_enabled: true,
            limit_mode: LimitMode::Both,
            max_clicks: Some(10_000),
            max_duration_ms: Some(35),
            ..Default::default()
        };
        let n = ClickerSession::run(&cfg, &cancel, &inj, &metrics, None).unwrap();
        assert!(n < 10_000);
        assert!(n > 0);
    }

    #[test]
    fn click_points_stop_when_complete() {
        let cancel = CancellationToken::new();
        let inj = RecordingInjector::new();
        let metrics = MetricsCollector::new();
        let cfg = ClickerConfig {
            cps: 100.0,
            points_enabled: true,
            stop_when_complete: true,
            points: vec![
                ClickPoint {
                    x: 10,
                    y: 10,
                    clicks: 2,
                    radius: 0,
                },
                ClickPoint {
                    x: 20,
                    y: 20,
                    clicks: 1,
                    radius: 0,
                },
            ],
            ..Default::default()
        };
        let n = ClickerSession::run(&cfg, &cancel, &inj, &metrics, None).unwrap();
        assert_eq!(n, 3);
        assert_eq!(inj.moves().len(), 3);
    }

    #[test]
    fn custom_pause_zone_skips() {
        let cancel = CancellationToken::new();
        let inj = RecordingInjector::new();
        inj.set_cursor(Point { x: 15, y: 15 });
        let metrics = MetricsCollector::new();
        let cancel_c = cancel.clone();
        thread::spawn(move || {
            thread::sleep(Duration::from_millis(40));
            cancel_c.cancel();
        });
        let cfg = ClickerConfig {
            cps: 100.0,
            stop_zones: vec![StopZone::Custom {
                id: "p".into(),
                x: 10,
                y: 10,
                width: 20,
                height: 20,
                action: ZoneAction::Pause,
                kind: ZoneKind::Safety,
                color: String::new(),
                click_mode: ClickSampleMode::Random,
            }],
            ..Default::default()
        };
        let n = ClickerSession::run(&cfg, &cancel, &inj, &metrics, None).unwrap();
        assert_eq!(n, 0);
    }

    #[test]
    fn start_zone_resumes_paused_session() {
        let cancel = CancellationToken::new();
        let inj = RecordingInjector::new();
        inj.set_cursor(Point { x: 15, y: 15 });
        let metrics = MetricsCollector::new();
        let pause = PauseGate::new();
        pause.pause();
        let mut cfg = ClickerConfig {
            cps: 200.0,
            stop_zones: vec![StopZone::Custom {
                id: "s".into(),
                x: 10,
                y: 10,
                width: 20,
                height: 20,
                action: ZoneAction::Start,
                kind: ZoneKind::Safety,
                color: String::new(),
                click_mode: ClickSampleMode::Random,
            }],
            ..Default::default()
        };
        enable_click_limit(&mut cfg, 2);
        let n = ClickerSession::run_with_zone_screen(
            &cfg,
            &cancel,
            &inj,
            &metrics,
            None,
            None,
            None,
            Some(&pause),
            None,
        )
        .unwrap();
        assert_eq!(n, 2, "start zone should lift the pause gate");
        assert!(!pause.is_paused());
    }

    #[test]
    fn paused_session_stays_paused_without_start_zone() {
        let cancel = CancellationToken::new();
        let inj = RecordingInjector::new();
        let metrics = MetricsCollector::new();
        let pause = PauseGate::new();
        pause.pause();
        let mut cfg = ClickerConfig {
            cps: 200.0,
            ..Default::default()
        };
        enable_click_limit(&mut cfg, 2);
        let cancel_c = cancel.clone();
        thread::spawn(move || {
            thread::sleep(Duration::from_millis(40));
            cancel_c.cancel();
        });
        let n = ClickerSession::run_with_zone_screen(
            &cfg,
            &cancel,
            &inj,
            &metrics,
            None,
            None,
            None,
            Some(&pause),
            None,
        )
        .unwrap();
        assert_eq!(n, 0);
        assert!(pause.is_paused());
    }

    #[test]
    fn click_zone_moves_inside_rect() {
        let cancel = CancellationToken::new();
        let inj = RecordingInjector::new();
        let metrics = MetricsCollector::new();
        let mut cfg = ClickerConfig {
            cps: 100.0,
            stop_zones: vec![StopZone::Custom {
                id: "c".into(),
                x: 100,
                y: 200,
                width: 50,
                height: 40,
                action: ZoneAction::Stop,
                kind: ZoneKind::Click,
                color: String::new(),
                click_mode: ClickSampleMode::Random,
            }],
            ..Default::default()
        };
        enable_click_limit(&mut cfg, 5);
        ClickerSession::run(&cfg, &cancel, &inj, &metrics, None).unwrap();
        let moves = inj.moves();
        assert_eq!(moves.len(), 5);
        for p in moves {
            assert!(p.x >= 100 && p.x < 150, "x={}", p.x);
            assert!(p.y >= 200 && p.y < 240, "y={}", p.y);
        }
    }

    #[test]
    fn click_zone_center_hits_midpoint() {
        let cancel = CancellationToken::new();
        let inj = RecordingInjector::new();
        let metrics = MetricsCollector::new();
        let mut cfg = ClickerConfig {
            cps: 100.0,
            stop_zones: vec![StopZone::Custom {
                id: "c".into(),
                x: 100,
                y: 200,
                width: 50,
                height: 40,
                action: ZoneAction::Stop,
                kind: ZoneKind::Click,
                color: String::new(),
                click_mode: ClickSampleMode::Center,
            }],
            ..Default::default()
        };
        enable_click_limit(&mut cfg, 3);
        ClickerSession::run(&cfg, &cancel, &inj, &metrics, None).unwrap();
        for p in inj.moves() {
            assert_eq!(p, Point { x: 125, y: 220 });
        }
    }

    #[test]
    fn click_zone_sequence_round_robin() {
        let cancel = CancellationToken::new();
        let inj = RecordingInjector::new();
        let metrics = MetricsCollector::new();
        let mut cfg = ClickerConfig {
            cps: 100.0,
            click_zone_order: ClickZoneOrder::Sequence,
            stop_zones: vec![
                StopZone::Custom {
                    id: "a".into(),
                    x: 0,
                    y: 0,
                    width: 10,
                    height: 10,
                    action: ZoneAction::Stop,
                    kind: ZoneKind::Click,
                    color: String::new(),
                    click_mode: ClickSampleMode::Center,
                },
                StopZone::Custom {
                    id: "b".into(),
                    x: 100,
                    y: 100,
                    width: 10,
                    height: 10,
                    action: ZoneAction::Stop,
                    kind: ZoneKind::Click,
                    color: String::new(),
                    click_mode: ClickSampleMode::Center,
                },
            ],
            ..Default::default()
        };
        enable_click_limit(&mut cfg, 4);
        ClickerSession::run(&cfg, &cancel, &inj, &metrics, None).unwrap();
        let xs: Vec<i32> = inj.moves().into_iter().map(|p| p.x).collect();
        assert_eq!(xs, vec![5, 105, 5, 105]);
    }

    #[test]
    fn random_enabled_maps_pct() {
        let cfg = ClickerConfig {
            random_enabled: true,
            random_pct: 50.0,
            cps_jitter: 0.0,
            ..Default::default()
        };
        assert!((cfg.jitter_amp() - 0.5).abs() < 1e-9);
    }

    #[test]
    fn process_deny_skips_listed_exe() {
        let cancel = CancellationToken::new();
        let inj = RecordingInjector::new();
        inj.set_foreground_exe(Some("notepad.exe"));
        let metrics = MetricsCollector::new();
        let cancel_c = cancel.clone();
        thread::spawn(move || {
            thread::sleep(Duration::from_millis(40));
            cancel_c.cancel();
        });
        let cfg = ClickerConfig {
            cps: 100.0,
            ..Default::default()
        };
        let filter = Arc::new(Mutex::new(ProcessFilter {
            enabled: true,
            mode: ProcessFilterMode::Deny,
            names: vec!["notepad.exe".into()],
        }));
        let n = ClickerSession::run_with_zone_screen(
            &cfg,
            &cancel,
            &inj,
            &metrics,
            None,
            None,
            Some(filter),
            None,
            None,
        )
        .unwrap();
        assert_eq!(n, 0);
        assert_eq!(inj.len(), 0);
    }

    #[test]
    fn process_deny_allows_other_exe() {
        let cancel = CancellationToken::new();
        let inj = RecordingInjector::new();
        inj.set_foreground_exe(Some("chrome.exe"));
        let metrics = MetricsCollector::new();
        let mut cfg = ClickerConfig {
            cps: 100.0,
            ..Default::default()
        };
        enable_click_limit(&mut cfg, 4);
        let filter = Arc::new(Mutex::new(ProcessFilter {
            enabled: true,
            mode: ProcessFilterMode::Deny,
            names: vec!["notepad.exe".into()],
        }));
        let n = ClickerSession::run_with_zone_screen(
            &cfg,
            &cancel,
            &inj,
            &metrics,
            None,
            None,
            Some(filter),
            None,
            None,
        )
        .unwrap();
        assert_eq!(n, 4);
        assert_eq!(inj.len(), 4);
    }

    #[test]
    fn process_allow_only_listed_exe() {
        let cancel = CancellationToken::new();
        let inj = RecordingInjector::new();
        inj.set_foreground_exe(Some("game.exe"));
        let metrics = MetricsCollector::new();
        let mut cfg = ClickerConfig {
            cps: 100.0,
            ..Default::default()
        };
        enable_click_limit(&mut cfg, 3);
        let filter = Arc::new(Mutex::new(ProcessFilter {
            enabled: true,
            mode: ProcessFilterMode::Allow,
            names: vec!["game.exe".into()],
        }));
        let n = ClickerSession::run_with_zone_screen(
            &cfg,
            &cancel,
            &inj,
            &metrics,
            None,
            None,
            Some(filter),
            None,
            None,
        )
        .unwrap();
        assert_eq!(n, 3);

        let cancel2 = CancellationToken::new();
        let inj2 = RecordingInjector::new();
        inj2.set_foreground_exe(Some("chrome.exe"));
        let metrics2 = MetricsCollector::new();
        let cancel_c = cancel2.clone();
        thread::spawn(move || {
            thread::sleep(Duration::from_millis(40));
            cancel_c.cancel();
        });
        let n2 = ClickerSession::run_with_zone_screen(
            &cfg,
            &cancel2,
            &inj2,
            &metrics2,
            None,
            None,
            Some(Arc::new(Mutex::new(ProcessFilter {
                enabled: true,
                mode: ProcessFilterMode::Allow,
                names: vec!["game.exe".into()],
            }))),
            None,
            None,
        )
        .unwrap();
        assert_eq!(n2, 0);
        assert_eq!(inj2.len(), 0);
    }

    fn global_deny(name: &str) -> Arc<Mutex<ProcessFilter>> {
        Arc::new(Mutex::new(ProcessFilter {
            enabled: true,
            mode: ProcessFilterMode::Deny,
            names: vec![name.into()],
        }))
    }

    #[test]
    fn preset_filter_off_ignores_global() {
        let cfg = ClickerConfig {
            process_filter: MacroProcessFilterMode::Off,
            ..Default::default()
        };
        assert!(cfg
            .effective_process_filter(Some(global_deny("notepad.exe")))
            .is_none());
    }

    #[test]
    fn preset_filter_inherit_keeps_global() {
        let cfg = ClickerConfig::default();
        let global = global_deny("notepad.exe");
        let effective = cfg
            .effective_process_filter(Some(Arc::clone(&global)))
            .expect("inherit keeps the global filter");
        assert!(Arc::ptr_eq(&effective, &global));
    }

    #[test]
    fn preset_filter_local_blocks_listed_exe() {
        let cancel = CancellationToken::new();
        let inj = RecordingInjector::new();
        inj.set_foreground_exe(Some("notepad.exe"));
        let metrics = MetricsCollector::new();
        let cfg = ClickerConfig {
            cps: 100.0,
            process_filter: MacroProcessFilterMode::Local,
            local_process_filter: ProcessFilter {
                enabled: true,
                mode: ProcessFilterMode::Deny,
                names: vec!["notepad.exe".into()],
            },
            ..Default::default()
        };
        let cancel_c = cancel.clone();
        thread::spawn(move || {
            thread::sleep(Duration::from_millis(40));
            cancel_c.cancel();
        });
        // Global filter is empty: only the preset-local list may block.
        let effective = cfg.effective_process_filter(None);
        assert!(effective.is_some());
        let n = ClickerSession::run_with_zone_screen(
            &cfg,
            &cancel,
            &inj,
            &metrics,
            None,
            None,
            effective,
            None,
            None,
        )
        .unwrap();
        assert_eq!(n, 0);
        assert!(metrics.snapshot().filter_blocked_ticks > 0);
    }

    #[test]
    fn filter_blocked_ticks_are_counted() {
        let cancel = CancellationToken::new();
        let inj = RecordingInjector::new();
        inj.set_foreground_exe(Some("notepad.exe"));
        let metrics = MetricsCollector::new();
        let cfg = ClickerConfig {
            cps: 200.0,
            ..Default::default()
        };
        let cancel_c = cancel.clone();
        thread::spawn(move || {
            thread::sleep(Duration::from_millis(60));
            cancel_c.cancel();
        });
        let bus = EventBus::new();
        let n = ClickerSession::run_with_zone_screen(
            &cfg,
            &cancel,
            &inj,
            &metrics,
            Some(&bus),
            None,
            Some(global_deny("notepad.exe")),
            None,
            None,
        )
        .unwrap();
        assert_eq!(n, 0);
        let snap = metrics.snapshot();
        assert!(snap.filter_blocked_ticks > 0);
        assert_eq!(snap.clicks_emitted, snap.filter_blocked_ticks);
    }
}
