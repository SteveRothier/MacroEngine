//! MacroEngine core engine library.
//!
//! React must never own timing, hooks, input injection, or critical run state.
//! This crate holds those contracts; the Tauri shell only asks and observes.

pub mod actions;
pub mod app_state;
pub mod cancel;
pub mod clicker;
pub mod event_bus;
pub mod hotkeys;
pub mod input;
pub mod macro_vm;
pub mod metrics;
pub mod scheduler;
pub mod schema;
pub mod state;

pub use actions::{
    ActionContext, ActionError, ActionHandler, ActionRegistry, LogHandler, NoopHandler,
};
pub use app_state::AppState;
pub use cancel::CancellationToken;
pub use clicker::{ClickMode, ClickerConfig, ClickerError, ClickerSession};
pub use event_bus::{EngineEvent, EventBus, LogLevel};
pub use hotkeys::{default_bindings, HotkeyBindings, HotkeyCallbacks, HotkeyHook};
pub use input::{default_injector, InputError, MouseButton, MouseInjector, RecordingInjector};
#[cfg(windows)]
pub use input::SendInputInjector;
pub use macro_vm::MacroVm;
pub use metrics::{ClickerMetrics, MetricsCollector};
pub use schema::{parse_macro_json, ActionNode, MacroDocument, SchemaError, Trigger};
pub use state::{EngineError, EngineState, StateTransitionError};