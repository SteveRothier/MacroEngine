//! Caster core engine library.
//!
//! React must never own timing, hooks, input injection, or critical run state.
//! This crate holds those contracts; the Tauri shell only asks and observes.

pub mod actions;
pub mod app_state;
pub mod cancel;
pub mod clicker;
pub mod clicker_presets;
pub mod env;
pub mod event_bus;
pub mod hotkeys;
pub mod input;
pub mod json_path;
pub mod library_index;
pub mod macro_library;
pub mod macro_vm;
pub mod metrics;
pub mod pause;
pub mod picker;
pub mod quick_access;
pub mod record;
pub mod scheduler;
pub mod schema;
pub mod script_library;
pub mod script_runtime;
pub mod settings;
pub mod state;
pub mod stop_zones;
pub mod zone_native_overlay;

pub use actions::{
    ActionContext, ActionError, ActionHandler, ActionRegistry, LogHandler, NoopHandler,
};
pub use app_state::AppState;
pub use cancel::CancellationToken;
pub use clicker::{
    rate_to_per_second, ClickKind, ClickMode, ClickPoint, ClickTarget, ClickZoneOrder, ClickerConfig,
    ClickerError, ClickerSession, DutyMode, InputKind, LimitMode, RateUnit, TimingMode, CPS_SOFT_CAP,
};
pub use clicker_presets::{
    delete_preset, duplicate_preset, export_preset_to_path, import_preset_from_path,
    list_preset_summaries, list_presets, load_preset, rename_preset, save_preset,
    save_preset_with_trigger, ClickerPreset, ClickerPresetSummary, PresetError,
};
pub use library_index::{
    assert_not_locked, create_library_folder, delete_library_folder, enrich_macro_summaries,
    get_library_index, is_locked, list_library_items, load_index, move_library_item,
    purge_library_trash, remove_library_entry, rename_library_entry_key, rename_library_folder,
    restore_library_item,
    set_library_item_locked, trash_library_item, LibraryFolder, LibraryIndex, LibraryIndexDto,
    LibraryIndexError, LibraryItemDto, LibraryKind, ListLibraryQuery,
};
pub use env::MacroEnv;
pub use event_bus::{EngineEvent, EventBus, LogLevel};
pub use hotkeys::{default_bindings, HotkeyBindings, HotkeyCallbacks, HotkeyHook};
pub use input::{
    default_injector, list_visible_process_exes, InputError, MouseButton, MouseInjector, Point,
    RecordingInjector,
};
#[cfg(windows)]
pub use input::SendInputInjector;
pub use macro_library::{
    create_macro, delete_macro, duplicate_macro, list_macro_summaries, list_macros, load_macro,
    rename_macro, save_macro, save_macro_checked, MacroLibraryError, MacroSummary,
};
pub use macro_vm::MacroVm;
pub use metrics::{ClickerMetrics, MetricsCollector};
pub use pause::PauseGate;
pub use picker::{
    draw_zone_rect, pick_after_delay, pick_now, DrawnRect, PickedPoint, PickerError,
};
pub use quick_access::{
    load_quick_access, prune_orphans, push_recent, save_quick_access, set_favorite, Favorites, QuickAccess,
    QuickAccessError, QuickKind, RecentEntry, MAX_RECENT,
};
pub use record::{postprocess_actions, RecordOptions, RecordPostProcess, RecordSession};
pub use schema::{
    macro_to_json, parse_macro_json, ActionNode, CompareOp, Condition, HttpHeader, KeyMods,
    MacroDocument, MacroValue, Operand, SchemaError, Trigger, SCHEMA_VERSION_CURRENT,
    SCHEMA_VERSION_V1, SCHEMA_VERSION_V4, SCHEMA_VERSION_V5,
};
pub use script_library::{
    delete_script, list_scripts, load_script, save_script, ScriptDoc, ScriptLibraryError,
};
pub use settings::{
    clamp_overlay_opacity, load_settings, save_settings, settings_path, AppSettings, ProcessFilter,
    ProcessFilterMode, SettingsError, ThemeMode,
};
pub use state::{EngineError, EngineState, StateTransitionError};
pub use stop_zones::{
    overlay_bands, ClickSampleMode, OverlayBand, ScreenCorner, ScreenEdge, ScreenGeom, ScreenGeomDto,
    StopZone, ZoneAction, ZoneKind,
};
pub use zone_native_overlay::NativeZoneOverlay;
