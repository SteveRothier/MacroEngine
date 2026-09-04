use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

/// Cooperative pause flag for macro playback (Running ↔ Paused).
#[derive(Debug, Clone, Default)]
pub struct PauseGate {
    paused: Arc<AtomicBool>,
}

impl PauseGate {
    pub fn new() -> Self {
        Self {
            paused: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn pause(&self) {
        self.paused.store(true, Ordering::SeqCst);
    }

    pub fn resume(&self) {
        self.paused.store(false, Ordering::SeqCst);
    }

    pub fn is_paused(&self) -> bool {
        self.paused.load(Ordering::SeqCst)
    }

    pub fn reset(&self) {
        self.paused.store(false, Ordering::SeqCst);
    }

    /// Block while paused; return false if `cancel_check` says cancelled.
    pub fn wait_while_paused<F>(&self, cancel_check: F) -> bool
    where
        F: Fn() -> bool,
    {
        while self.is_paused() {
            if cancel_check() {
                return false;
            }
            thread::sleep(Duration::from_millis(10));
        }
        !cancel_check()
    }
}
