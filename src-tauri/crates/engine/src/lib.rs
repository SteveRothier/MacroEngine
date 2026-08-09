//! MacroEngine core engine library.
//!
//! React must never own timing, hooks, input injection, or critical run state.
//! This crate holds those contracts; the Tauri shell only asks and observes.

pub mod cancel;
pub mod state;

pub use cancel::CancellationToken;
pub use state::{EngineError, EngineState, StateTransitionError};
