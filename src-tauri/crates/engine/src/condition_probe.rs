//! Live OS probes used while evaluating macro conditions.

use std::sync::Arc;

use crate::input::{MouseInjector, Point};
use crate::settings::normalize_exe_name;

/// Local wall-clock fields used by `time.compare`.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct LocalClock {
    pub hour: u32,
    pub minute: u32,
    /// 0=Sunday … 6=Saturday
    pub weekday: u32,
    /// Day of month 1–31
    pub day: u32,
    /// Month 1–12
    pub month: u32,
    pub year: u32,
}

/// Runtime lookups for predicate-based conditions (process, pixel, key, …).
pub trait ConditionProbe: Send + Sync {
    fn foreground_exe(&self) -> Option<String>;
    fn foreground_title(&self) -> Option<String>;
    fn is_process_running(&self, exe: &str) -> bool;
    fn cursor_xy(&self) -> Option<(i32, i32)>;
    fn pixel_rgb(&self, x: i32, y: i32) -> Option<(u8, u8, u8)>;
    fn is_key_down(&self, key: &str) -> bool;
    fn is_mod_down(&self, which: &str) -> bool;
    fn local_clock(&self) -> LocalClock;
    fn clipboard_text(&self) -> Option<String>;
    /// `left` | `right` | `middle`
    fn is_mouse_button_down(&self, button: &str) -> bool;
}

/// Production probe backed by the live injector + Win32 helpers.
pub struct InjectorConditionProbe {
    injector: Arc<dyn MouseInjector>,
}

impl InjectorConditionProbe {
    pub fn new(injector: Arc<dyn MouseInjector>) -> Self {
        Self { injector }
    }
}

impl ConditionProbe for InjectorConditionProbe {
    fn foreground_exe(&self) -> Option<String> {
        self.injector.foreground_exe()
    }

    fn foreground_title(&self) -> Option<String> {
        crate::input::foreground_window_title()
    }

    fn is_process_running(&self, exe: &str) -> bool {
        crate::input::is_process_running(exe)
    }

    fn cursor_xy(&self) -> Option<(i32, i32)> {
        self.injector
            .cursor_position()
            .ok()
            .map(|Point { x, y }| (x, y))
    }

    fn pixel_rgb(&self, x: i32, y: i32) -> Option<(u8, u8, u8)> {
        self.injector.read_pixel(x, y).ok()
    }

    fn is_key_down(&self, key: &str) -> bool {
        crate::input::is_key_down(key)
    }

    fn is_mod_down(&self, which: &str) -> bool {
        let key = match which.to_ascii_lowercase().as_str() {
            "ctrl" | "control" => "CTRL",
            "alt" | "menu" => "ALT",
            "shift" => "SHIFT",
            _ => return false,
        };
        crate::input::is_key_down(key)
    }

    fn local_clock(&self) -> LocalClock {
        crate::input::local_clock()
    }

    fn clipboard_text(&self) -> Option<String> {
        self.injector.clipboard_get().ok()
    }

    fn is_mouse_button_down(&self, button: &str) -> bool {
        crate::input::is_mouse_button_down(button)
    }
}

/// Test / mock probe with overridable fields.
#[derive(Debug, Clone, Default)]
pub struct MockConditionProbe {
    pub foreground_exe: Option<String>,
    pub foreground_title: Option<String>,
    pub running: Vec<String>,
    pub cursor: Option<(i32, i32)>,
    pub pixel: Option<(u8, u8, u8)>,
    pub keys_down: Vec<String>,
    pub clock: LocalClock,
    pub clipboard: Option<String>,
    pub mouse_buttons_down: Vec<String>,
}

impl ConditionProbe for MockConditionProbe {
    fn foreground_exe(&self) -> Option<String> {
        self.foreground_exe.clone()
    }

    fn foreground_title(&self) -> Option<String> {
        self.foreground_title.clone()
    }

    fn is_process_running(&self, exe: &str) -> bool {
        let needle = normalize_exe_name(exe);
        self.running
            .iter()
            .any(|p| normalize_exe_name(p) == needle)
    }

    fn cursor_xy(&self) -> Option<(i32, i32)> {
        self.cursor
    }

    fn pixel_rgb(&self, _x: i32, _y: i32) -> Option<(u8, u8, u8)> {
        self.pixel
    }

    fn is_key_down(&self, key: &str) -> bool {
        let k = key.trim().to_ascii_uppercase();
        self.keys_down
            .iter()
            .any(|d| d.trim().to_ascii_uppercase() == k)
    }

    fn is_mod_down(&self, which: &str) -> bool {
        let key = match which.to_ascii_lowercase().as_str() {
            "ctrl" | "control" => "CTRL",
            "alt" | "menu" => "ALT",
            "shift" => "SHIFT",
            _ => return false,
        };
        self.is_key_down(key)
    }

    fn local_clock(&self) -> LocalClock {
        self.clock
    }

    fn clipboard_text(&self) -> Option<String> {
        self.clipboard.clone()
    }

    fn is_mouse_button_down(&self, button: &str) -> bool {
        let b = button.trim().to_ascii_lowercase();
        self.mouse_buttons_down
            .iter()
            .any(|d| d.trim().to_ascii_lowercase() == b)
    }
}
