use std::thread;
use std::time::{Duration, Instant};

use crate::cancel::CancellationToken;

/// Wait until a monotonic deadline (or until cancelled).
///
/// M0 uses a simple sleep loop. Real CPS SLO measurement lands in M1-A.
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
        let slice = remaining.min(Duration::from_millis(5));
        thread::sleep(slice);
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn intervals_stay_within_loose_tolerance() {
        let cancel = CancellationToken::new();
        let interval = Duration::from_millis(20);
        let count = 10;
        let start = Instant::now();
        let done = run_intervals(start, interval, count, &cancel);
        let elapsed = start.elapsed();
        assert_eq!(done, count);
        // Loose M0 placeholder: allow generous slack (not M1-A SLO).
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
}
