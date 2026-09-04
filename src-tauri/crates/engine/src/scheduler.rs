use std::thread;
use std::time::{Duration, Instant};

use crate::cancel::CancellationToken;
use crate::metrics::MetricsCollector;

/// Wait until a monotonic deadline (or until cancelled).
///
/// Uses coarse sleep while far from the deadline, then short sleeps near it.
pub fn wait_until(deadline: Instant, cancel: &CancellationToken) -> bool {
    loop {
        if cancel.is_cancelled() {
            return false;
        }
        let now = Instant::now();
        if now >= deadline {
            return true;
        }
        let remaining = deadline - now;
        let slice = if remaining > Duration::from_millis(2) {
            remaining
                .saturating_sub(Duration::from_millis(1))
                .min(Duration::from_millis(5))
        } else {
            Duration::from_millis(0)
        };
        if slice.is_zero() {
            thread::yield_now();
        } else {
            thread::sleep(slice);
        }
    }
}

/// Run `n` intervals using monotonic deadlines: `start + i * interval`.
pub fn run_intervals(
    start: Instant,
    interval: Duration,
    count: u32,
    cancel: &CancellationToken,
) -> u32 {
    let mut completed = 0u32;
    for i in 1..=count {
        let deadline = start + interval * i;
        if !wait_until(deadline, cancel) {
            break;
        }
        completed += 1;
    }
    completed
}

/// CPS loop: invoke `on_tick` once per interval until cancelled or `max_clicks`.
///
/// Deadlines are `start + i * interval` (monotonic). Returns clicks completed.
pub fn run_cps_loop<F>(
    target_cps: f64,
    cancel: &CancellationToken,
    metrics: Option<&MetricsCollector>,
    max_clicks: Option<u64>,
    mut on_tick: F,
) -> u64
where
    F: FnMut() -> bool,
{
    if target_cps <= 0.0 {
        return 0;
    }
    let interval = Duration::from_secs_f64(1.0 / target_cps);
    if let Some(m) = metrics {
        m.begin(target_cps);
    }
    let start = Instant::now();
    let mut completed = 0u64;
    let mut i = 1u64;
    loop {
        if cancel.is_cancelled() {
            break;
        }
        if let Some(max) = max_clicks {
            if completed >= max {
                break;
            }
        }
        let deadline = start + Duration::from_secs_f64(interval.as_secs_f64() * i as f64);

        if !wait_until(deadline, cancel) {
            break;
        }
        let actual = Instant::now();
        if let Some(m) = metrics {
            m.record_tick(deadline, actual);
        }
        if !on_tick() {
            break;
        }
        completed += 1;
        i += 1;
    }
    if let Some(m) = metrics {
        m.finish();
    }
    completed
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::metrics::MetricsCollector;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::sync::Arc;

    #[test]
    fn intervals_stay_within_loose_tolerance() {
        let cancel = CancellationToken::new();
        let interval = Duration::from_millis(20);
        let count = 10;
        let start = Instant::now();
        let done = run_intervals(start, interval, count, &cancel);
        let elapsed = start.elapsed();
        assert_eq!(done, count);
        let expected = interval * count;
        assert!(
            elapsed >= expected.saturating_sub(Duration::from_millis(30)),
            "finished too early: {elapsed:?} vs {expected:?}"
        );
        assert!(
            elapsed <= expected + Duration::from_millis(200),
            "drift too high for stub: {elapsed:?} vs {expected:?}"
        );
    }

    #[test]
    fn wait_respects_cancel() {
        let cancel = CancellationToken::new();
        cancel.cancel();
        let ok = wait_until(Instant::now() + Duration::from_secs(5), &cancel);
        assert!(!ok);
    }

    #[test]
    fn cps_loop_hits_target_short_window() {
        let cancel = CancellationToken::new();
        let metrics = MetricsCollector::new();
        let ticks = Arc::new(AtomicU64::new(0));
        let ticks_c = Arc::clone(&ticks);
        let target = 50.0;
        let completed = run_cps_loop(target, &cancel, Some(&metrics), Some(25), move || {
            ticks_c.fetch_add(1, Ordering::SeqCst);
            true
        });
        assert_eq!(completed, 25);
        assert_eq!(ticks.load(Ordering::SeqCst), 25);
        let snap = metrics.snapshot();
        // Short window: allow ±15% (CI gate; long SLO in harness).
        let ratio = snap.measured_cps / target;
        assert!(
            (0.85..=1.15).contains(&ratio),
            "measured {} vs target {target}",
            snap.measured_cps
        );
    }
}
