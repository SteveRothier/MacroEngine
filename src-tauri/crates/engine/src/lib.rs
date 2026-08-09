//! MacroEngine core engine library.
//!
//! React must never own timing, hooks, input injection, or critical run state.
//! This crate holds those contracts; the Tauri shell only asks and observes.

pub mod app_state;
pub mod cancel;
pub mod event_bus;
pub mod state;

pub use app_state::AppState;
pub use cancel::CancellationToken;
pub use event_bus::{EngineEvent, EventBus, LogLevel};
pub use state::{EngineError, EngineState, StateTransitionError};
