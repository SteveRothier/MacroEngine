use std::sync::{Arc, Mutex};

use crate::cancel::CancellationToken;
use crate::event_bus::{EngineEvent, EventBus, LogLevel};
use crate::state::{EngineState, StateTransitionError};

/// Thread-safe handle to engine run state + cancellation.
#[derive(Clone)]
pub struct AppState {
    inner: Arc<Mutex<AppStateInner>>,
    cancel: CancellationToken,
    bus: Arc<EventBus>,
}

struct AppStateInner {
    state: EngineState,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(AppStateInner {
                state: EngineState::Idle,
            })),
            cancel: CancellationToken::new(),
            bus: Arc::new(EventBus::new()),
        }
    }

    pub fn state(&self) -> EngineState {
        self.inner.lock().expect("app state lock").state
    }

    pub fn cancellation(&self) -> &CancellationToken {
        &self.cancel
    }

    pub fn event_bus(&self) -> &EventBus {
        &self.bus
    }

    pub fn request_cancel(&self) {
        self.cancel.cancel();
        self.bus.publish(EngineEvent::Log {
            level: LogLevel::Info,
            message: "cancellation requested".into(),
        });
    }

    pub fn transition_to(&self, to: EngineState) -> Result<EngineState, StateTransitionError> {
        let mut guard = self.inner.lock().expect("app state lock");
        let from = guard.state;
        let next = from.transition(to)?;
        guard.state = next;
        drop(guard);
        self.bus.publish(EngineEvent::StateChanged { from, to: next });
        Ok(next)
    }

    /// Prepare a fresh run: clear cancel flag when returning to Idle / starting.
    pub fn begin_run(&self) -> Result<EngineState, StateTransitionError> {
        self.cancel.reset();
        self.transition_to(EngineState::Running)
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    #[test]
    fn begin_run_emits_state_changed() {
        let app = AppState::new();
        let events = Arc::new(Mutex::new(Vec::new()));
        let events_clone = Arc::clone(&events);
        app.event_bus().subscribe(move |e| {
            events_clone.lock().unwrap().push(e);
        });

        app.begin_run().unwrap();
        assert_eq!(app.state(), EngineState::Running);

        let list = events.lock().unwrap();
        assert!(matches!(
            list.first(),
            Some(EngineEvent::StateChanged {
                from: EngineState::Idle,
                to: EngineState::Running
            })
        ));
    }

    #[test]
    fn request_cancel_sets_token() {
        let app = AppState::new();
        app.begin_run().unwrap();
        app.request_cancel();
        assert!(app.cancellation().is_cancelled());
    }
}
