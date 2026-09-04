//! Mouse / keyboard input injection abstraction.
//!
//! Production path uses Win32 `SendInput`. Tests use [`RecordingInjector`].

mod recording;
#[cfg(windows)]
mod win32;

use serde::{Deserialize, Serialize};
use thiserror::Error;

pub use recording::RecordingInjector;
#[cfg(windows)]
pub use win32::SendInputInjector;

use crate::stop_zones::ScreenGeom;

/// Tagged into `dwExtraInfo` so record hooks can ignore our own injections.
pub const INJECT_EXTRA_INFO: usize = 0x4D45_0001; // "ME" + tag

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MouseButton {
    Left,
    Right,
    Middle,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Point {
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum InputError {
    #[error("input injection failed: {0}")]
    InjectionFailed(String),
    #[error("platform input unavailable")]
    UnsupportedPlatform,
    #[error("unknown key: {0}")]
    UnknownKey(String),
}

/// Injects mouse clicks, moves, and key taps.
pub trait MouseInjector: Send + Sync {
    fn click(&self, button: MouseButton) -> Result<(), InputError>;

    fn mouse_down(&self, button: MouseButton) -> Result<(), InputError> {
        let _ = button;
        Err(InputError::UnsupportedPlatform)
    }

    fn mouse_up(&self, button: MouseButton) -> Result<(), InputError> {
        let _ = button;
        Err(InputError::UnsupportedPlatform)
    }

    fn move_to(&self, point: Point) -> Result<(), InputError> {
        let _ = point;
        Err(InputError::UnsupportedPlatform)
    }

    fn cursor_position(&self) -> Result<Point, InputError> {
        Err(InputError::UnsupportedPlatform)
    }

    fn screen_size(&self) -> Result<(i32, i32), InputError> {
        Err(InputError::UnsupportedPlatform)
    }

    fn screen_geom(&self) -> Result<ScreenGeom, InputError> {
        let (w, h) = self.screen_size()?;
        Ok(ScreenGeom::from_size(w, h))
    }

    /// Read RGB at absolute screen coordinates (Win32 GetPixel).
    fn read_pixel(&self, x: i32, y: i32) -> Result<(u8, u8, u8), InputError> {
        let _ = (x, y);
        Err(InputError::UnsupportedPlatform)
    }

    fn key_tap(&self, key: &str) -> Result<(), InputError> {
        let _ = key;
        Err(InputError::UnsupportedPlatform)
    }

    fn key_tap_shifted(&self, key: &str, shift: bool) -> Result<(), InputError> {
        if !shift {
            return self.key_tap(key);
        }
        // Default: tap as "Shift+key" string for recorders; real injectors override.
        self.key_tap(&format!("Shift+{key}"))
    }

    fn key_down_shifted(&self, key: &str, shift: bool) -> Result<(), InputError> {
        let _ = (key, shift);
        Err(InputError::UnsupportedPlatform)
    }

    fn key_up_shifted(&self, key: &str, shift: bool) -> Result<(), InputError> {
        let _ = (key, shift);
        Err(InputError::UnsupportedPlatform)
    }

    fn key_chord_down(&self, key: &str, ctrl: bool, alt: bool, shift: bool) -> Result<(), InputError> {
        let _ = (key, ctrl, alt);
        self.key_down_shifted(key, shift)
    }

    fn key_chord_up(&self, key: &str, ctrl: bool, alt: bool, shift: bool) -> Result<(), InputError> {
        let _ = (key, ctrl, alt);
        self.key_up_shifted(key, shift)
    }

    fn key_chord_tap(&self, key: &str, ctrl: bool, alt: bool, shift: bool) -> Result<(), InputError> {
        self.key_chord_down(key, ctrl, alt, shift)?;
        self.key_chord_up(key, ctrl, alt, shift)
    }

    fn mouse_wheel(&self, delta: i32) -> Result<(), InputError> {
        let _ = delta;
        Err(InputError::UnsupportedPlatform)
    }

    fn clipboard_set(&self, text: &str) -> Result<(), InputError> {
        let _ = text;
        Err(InputError::UnsupportedPlatform)
    }

    fn clipboard_get(&self) -> Result<String, InputError> {
        Err(InputError::UnsupportedPlatform)
    }

    /// Foreground window process image name (`game.exe`), if known.
    fn foreground_exe(&self) -> Option<String> {
        None
    }
}

/// Default injector for the current platform.
pub fn default_injector() -> Result<std::sync::Arc<dyn MouseInjector>, InputError> {
    #[cfg(windows)]
    {
        Ok(std::sync::Arc::new(SendInputInjector::new()))
    }
    #[cfg(not(windows))]
    {
        Err(InputError::UnsupportedPlatform)
    }
}

/// Unique `.exe` basenames of visible top-level windows (Windows).
pub fn list_visible_process_exes() -> Vec<String> {
    #[cfg(windows)]
    {
        win32::list_visible_process_exes()
    }
    #[cfg(not(windows))]
    {
        Vec::new()
    }
}
