//! Runtime metrics for clicker sessions (CPS, drift).

use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// Snapshot of clicker performance for UI / harness.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClickerMetrics {
    pub clicks_emitted: u64,
    pub target_cps: f64,
    pub measured_cps: f64,
    /// Sum of |actual_deadline - ideal_deadline| in milliseconds.
    pub cumulative_deadline_error_ms: f64,
    pub elapsed_ms: u64,
    pub running: bool,
}

impl Default for ClickerMetrics {
    fn default() -> Self {
        Self {
            clicks_emitted: 0,
            target_cps: 0.0,
            measured_cps: 0.0,
            cumulative_deadline_error_ms: 0.0,
            elapsed_ms: 0,
            running: false,
        }
    }
}

/// Mutable metrics collector shared across the clicker thread and observers.
#[derive(Clone, Default)]
pub struct MetricsCollector {
    inner: Arc<Mutex<MetricsInner>>,
}

struct MetricsInner {
    start: Option<Instant>,
    clicks: u64,
    target_cps: f64,
    cumulative_error: Duration,
    running: bool,
}

impl Default for MetricsInner {
    fn default() -> Self {
        Self {
            start: None,
            clicks: 0,
            target_cps: 0.0,
            cumulative_error: Duration::ZERO,
            running: false,
        }
    }
}

impl MetricsCollector {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn begin(&self, target_cps: f64) {
        let mut g = self.inner.lock().expect("metrics lock");
        *g = MetricsInner {
            start: Some(Instant::now()),
            clicks: 0,
            target_cps,
            cumulative_error: Duration::ZERO,
            running: true,
        };
    }

    pub fn record_tick(&self, ideal_deadline: Instant, actual: Instant) {
        let mut g = self.inner.lock().expect("metrics lock");
        g.clicks = g.clicks.saturating_add(1);
        let err = if actual >= ideal_deadline {
            actual - ideal_deadline
        } else {
            ideal_deadline - actual
        };
        g.cumulative_error = g.cumulative_error.saturating_add(err);
    }

    pub fn finish(&self) {
        let mut g = self.inner.lock().expect("metrics lock");
        g.running = false;
    }

    pub fn snapshot(&self) -> ClickerMetrics {
        let g = self.inner.lock().expect("metrics lock");
        let elapsed = g
            .start
            .map(|s| s.elapsed())
            .unwrap_or(Duration::ZERO);
        let elapsed_secs = elapsed.as_secs_f64().max(1e-9);
        let measured = g.clicks as f64 / elapsed_secs;
        ClickerMetrics {
            clicks_emitted: g.clicks,
            target_cps: g.target_cps,
            measured_cps: measured,
            cumulative_deadline_error_ms: g.cumulative_error.as_secs_f64() * 1000.0,
            elapsed_ms: elapsed.as_millis() as u64,
            running: g.running,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;

    #[test]
    fn measures_cps_from_ticks() {
        let m = MetricsCollector::new();
        m.begin(10.0);
        let start = Instant::now();
        for i in 1..=5 {
            let ideal = start + Duration::from_millis(100 * i);
            thread::sleep(Duration::from_millis(5));
            m.record_tick(ideal, Instant::now());
        }
        m.finish();
        let snap = m.snapshot();
        assert_eq!(snap.clicks_emitted, 5);
        assert!(!snap.running);
        assert!(snap.measured_cps > 0.0);
    }
}
