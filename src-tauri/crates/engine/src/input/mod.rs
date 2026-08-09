//! Mouse input injection abstraction.
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
}

/// Injects mouse clicks and optional cursor moves.
pub trait MouseInjector: Send + Sync {
    fn click(&self, button: MouseButton) -> Result<(), InputError>;

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
