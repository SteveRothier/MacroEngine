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
pub mod picker;
pub mod scheduler;
pub mod schema;
pub mod settings;
pub mod state;
pub mod stop_zones;

pub use actions::{
    ActionContext, ActionError, ActionHandler, ActionRegistry, LogHandler, NoopHandler,
};
pub use app_state::AppState;
pub use cancel::CancellationToken;
pub use clicker::{
    ClickKind, ClickMode, ClickTarget, ClickerConfig, ClickerError, ClickerSession,
};
pub use event_bus::{EngineEvent, EventBus, LogLevel};
pub use hotkeys::{default_bindings, HotkeyBindings, HotkeyCallbacks, HotkeyHook};
pub use input::{
    default_injector, InputError, MouseButton, MouseInjector, Point, RecordingInjector,
};
#[cfg(windows)]
pub use input::SendInputInjector;
pub use macro_vm::MacroVm;
pub use metrics::{ClickerMetrics, MetricsCollector};
pub use picker::{pick_after_delay, pick_now, PickedPoint, PickerError};
pub use schema::{parse_macro_json, ActionNode, MacroDocument, SchemaError, Trigger};
pub use settings::{load_settings, save_settings, settings_path, AppSettings, SettingsError};
pub use state::{EngineError, EngineState, StateTransitionError};
pub use stop_zones::{ScreenCorner, StopZone};