use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Lifecycle of the automation engine (click or macro).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EngineState {
    Idle,
    Running,
    Paused,
    Stopping,
    Error,
}

#[derive(Debug, Error, PartialEq, Eq)]
#[error("illegal transition from {from:?} to {to:?}")]
pub struct StateTransitionError {
    pub from: EngineState,
    pub to: EngineState,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum EngineError {
    #[error(transparent)]
    IllegalTransition(#[from] StateTransitionError),
}

impl EngineState {
    /// Valid transitions:
    /// - Idle → Running | Error
    /// - Running → Paused | Stopping | Error
    /// - Paused → Running | Stopping | Error
    /// - Stopping → Idle | Error
    /// - Error → Idle
    pub fn can_transition_to(self, to: EngineState) -> bool {
        matches!(
            (self, to),
            (EngineState::Idle, EngineState::Running)
                | (EngineState::Idle, EngineState::Error)
                | (EngineState::Running, EngineState::Paused)
                | (EngineState::Running, EngineState::Stopping)
                | (EngineState::Running, EngineState::Error)
                | (EngineState::Paused, EngineState::Running)
                | (EngineState::Paused, EngineState::Stopping)
                | (EngineState::Paused, EngineState::Error)
                | (EngineState::Stopping, EngineState::Idle)
                | (EngineState::Stopping, EngineState::Error)
                | (EngineState::Error, EngineState::Idle)
        )
    }

    pub fn transition(self, to: EngineState) -> Result<EngineState, StateTransitionError> {
        if self.can_transition_to(to) {
            Ok(to)
        } else {
            Err(StateTransitionError { from: self, to })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_idle_to_running() {
        assert_eq!(
            EngineState::Idle.transition(EngineState::Running).unwrap(),
            EngineState::Running
        );
    }

    #[test]
    fn rejects_idle_to_paused() {
        let err = EngineState::Idle
            .transition(EngineState::Paused)
            .unwrap_err();
        assert_eq!(err.from, EngineState::Idle);
        assert_eq!(err.to, EngineState::Paused);
    }

    #[test]
    fn allows_running_pause_resume_stop_idle() {
        let s = EngineState::Running
            .transition(EngineState::Paused)
            .unwrap()
            .transition(EngineState::Running)
            .unwrap()
            .transition(EngineState::Stopping)
            .unwrap()
            .transition(EngineState::Idle)
            .unwrap();
        assert_eq!(s, EngineState::Idle);
    }

    #[test]
    fn error_recovers_only_to_idle() {
        assert!(EngineState::Error
            .transition(EngineState::Running)
            .is_err());
        assert_eq!(
            EngineState::Error.transition(EngineState::Idle).unwrap(),
            EngineState::Idle
        );
    }
}
