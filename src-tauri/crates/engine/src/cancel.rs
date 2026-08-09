use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

/// Shared cancellation flag for long-running engine work.
///
/// Emergency stop (M1-A) will set this from a Rust hotkey path, not via React alone.
#[derive(Debug, Clone, Default)]
pub struct CancellationToken {
    cancelled: Arc<AtomicBool>,
}

impl CancellationToken {
    pub fn new() -> Self {
        Self {
            cancelled: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }

    pub fn reset(&self) {
        self.cancelled.store(false, Ordering::SeqCst);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;

    #[test]
    fn cancel_is_visible_immediately() {
        let token = CancellationToken::new();
        assert!(!token.is_cancelled());
        token.cancel();
        assert!(token.is_cancelled());
    }

    #[test]
    fn cancel_is_shared_across_clones() {
        let token = CancellationToken::new();
        let clone = token.clone();
        let handle = thread::spawn(move || {
            clone.cancel();
        });
        handle.join().unwrap();
        assert!(token.is_cancelled());
    }

    #[test]
    fn reset_clears_flag() {
        let token = CancellationToken::new();
        token.cancel();
        token.reset();
        assert!(!token.is_cancelled());
    }
}
