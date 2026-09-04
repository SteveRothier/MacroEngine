use std::sync::{Arc, Mutex};

use crate::state::EngineState;

/// Events emitted by the engine toward observers (Tauri shell, tests).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EngineEvent {
    StateChanged {
        from: EngineState,
        to: EngineState,
    },
    Log {
        level: LogLevel,
        message: String,
    },
    ActionStarted {
        index: usize,
        /// Path from root actions; for nested if: [ifIndex, 0|1, childIndex, ...]
        path: Vec<usize>,
        repeat: u32,
    },
    RecordProgress {
        count: usize,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogLevel {
    Debug,
    Info,
    Warn,
    Error,
}

type Listener = Arc<dyn Fn(EngineEvent) + Send + Sync>;

/// Synchronous in-process event bus.
#[derive(Default)]
pub struct EventBus {
    listeners: Mutex<Vec<Listener>>,
}

impl EventBus {
    pub fn new() -> Self {
        Self {
            listeners: Mutex::new(Vec::new()),
        }
    }

    pub fn subscribe<F>(&self, listener: F)
    where
        F: Fn(EngineEvent) + Send + Sync + 'static,
    {
        self.listeners
            .lock()
            .expect("event bus lock")
            .push(Arc::new(listener));
    }

    pub fn publish(&self, event: EngineEvent) {
        let listeners = self.listeners.lock().expect("event bus lock").clone();
        for listener in listeners {
            listener(event.clone());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[test]
    fn publishes_to_subscribers() {
        let bus = EventBus::new();
        let count = Arc::new(AtomicUsize::new(0));
        let count_clone = Arc::clone(&count);
        bus.subscribe(move |_| {
            count_clone.fetch_add(1, Ordering::SeqCst);
        });
        bus.publish(EngineEvent::Log {
            level: LogLevel::Info,
            message: "hello".into(),
        });
        assert_eq!(count.load(Ordering::SeqCst), 1);
    }
}
