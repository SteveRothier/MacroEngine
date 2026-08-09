//! Long-running SLO harness for M1-A gate (ignored by default).
//!
//! Run short integrity checks always; enable long CPS runs with:
//! `cargo test --test slo_harness -- --ignored --nocapture`

use std::sync::Arc;
use std::time::{Duration, Instant};

use macroengine_engine::{
    AppState, ClickMode, ClickerConfig, MouseButton, MouseInjector, RecordingInjector,
};

fn cfg(cps: f64) -> ClickerConfig {
    ClickerConfig {
        button: MouseButton::Left,
        cps,
        mode: ClickMode::Toggle,
    }
}

#[test]
fn integrity_start_stop_cycles() {
    let inj = Arc::new(RecordingInjector::new());
    let app = AppState::with_injector(Arc::clone(&inj) as Arc<dyn MouseInjector>);
    for _ in 0..100 {
        app.start_clicker(cfg(120.0)).expect("start");
        std::thread::sleep(Duration::from_millis(8));
        app.stop_clicker();
        assert_eq!(
            format!("{:?}", app.state()).to_lowercase(),
            "idle"
        );
    }
}

#[test]
fn short_cps_window_within_15_percent() {
    let inj = Arc::new(RecordingInjector::new());
    let app = AppState::with_injector(Arc::clone(&inj) as Arc<dyn MouseInjector>);
    let target = 50.0;
    app.start_clicker(cfg(target)).unwrap();
    std::thread::sleep(Duration::from_secs(2));
    app.stop_clicker();
    let m = app.metrics();
    let ratio = m.measured_cps / target;
    assert!(
        (0.85..=1.15).contains(&ratio),
        "measured {} vs target {target} (clicks={})",
        m.measured_cps,
        m.clicks_emitted
    );
}

/// Approximate 10 CPS / 10 min SLO (±2%). Manual / ignored.
#[test]
#[ignore = "long M1-A gate: 10 CPS × 10 min"]
fn slo_10cps_10min() {
    run_cps_slo(10.0, Duration::from_secs(600), 0.02);
}

/// Approximate 50 CPS / 10 min SLO (±5%).
#[test]
#[ignore = "long M1-A gate: 50 CPS × 10 min"]
fn slo_50cps_10min() {
    run_cps_slo(50.0, Duration::from_secs(600), 0.05);
}

/// Approximate 200 CPS / 5 min SLO (±10%).
#[test]
#[ignore = "long M1-A gate: 200 CPS × 5 min"]
fn slo_200cps_5min() {
    run_cps_slo(200.0, Duration::from_secs(300), 0.10);
}

fn run_cps_slo(target: f64, duration: Duration, tol: f64) {
    let inj = Arc::new(RecordingInjector::new());
    let app = AppState::with_injector(Arc::clone(&inj) as Arc<dyn MouseInjector>);
    let start = Instant::now();
    app.start_clicker(cfg(target)).unwrap();
    while start.elapsed() < duration {
        std::thread::sleep(Duration::from_millis(200));
    }
    app.stop_clicker();
    let m = app.metrics();
    let ratio = (m.measured_cps - target).abs() / target;
    let hours = m.elapsed_ms as f64 / 3_600_000.0;
    let drift_per_hour = if hours > 0.0 {
        m.cumulative_deadline_error_ms / hours
    } else {
        0.0
    };
    println!(
        "target={target} measured={:.3} clicks={} drift_ms={:.1} drift_per_hour≈{:.1}",
        m.measured_cps, m.clicks_emitted, m.cumulative_deadline_error_ms, drift_per_hour
    );
    assert!(
        ratio <= tol,
        "CPS ratio error {ratio} > tol {tol} (measured {})",
        m.measured_cps
    );
    // Equivalent of <500ms/h at 10 CPS — scale loosely for shorter runs via per-hour rate.
    assert!(
        drift_per_hour < 500.0 || m.elapsed_ms < 60_000,
        "deadline drift too high: {drift_per_hour} ms/h"
    );
}
