//! Point / rect picker: aim delay then sample cursor, or drag a zone rect.

use std::thread;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

use crate::cancel::CancellationToken;
use crate::input::{InputError, MouseInjector, Point};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PickedPoint {
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DrawnRect {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

#[derive(Debug, thiserror::Error, Clone, PartialEq, Eq)]
pub enum PickerError {
    #[error(transparent)]
    Input(#[from] InputError),
    #[error("picker cancelled")]
    Cancelled,
    #[error("zone draw timed out")]
    TimedOut,
}

/// Wait `delay`, then capture the current cursor position (unless cancelled).
pub fn pick_after_delay(
    injector: &dyn MouseInjector,
    cancel: &CancellationToken,
    delay: Duration,
) -> Result<PickedPoint, PickerError> {
    let deadline = Instant::now() + delay;
    while Instant::now() < deadline {
        if cancel.is_cancelled() {
            return Err(PickerError::Cancelled);
        }
        thread::sleep(Duration::from_millis(20));
    }
    if cancel.is_cancelled() {
        return Err(PickerError::Cancelled);
    }
    let p = injector.cursor_position()?;
    Ok(PickedPoint { x: p.x, y: p.y })
}

/// Capture cursor immediately.
pub fn pick_now(injector: &dyn MouseInjector) -> Result<PickedPoint, PickerError> {
    let p = injector.cursor_position()?;
    Ok(PickedPoint { x: p.x, y: p.y })
}

/// Convenience: treat a [`Point`] as picked.
pub fn from_point(p: Point) -> PickedPoint {
    PickedPoint { x: p.x, y: p.y }
}

/// Interactive zone draw: wait for LMB down → drag → LMB up (Windows).
/// Non-Windows / tests: capture two cursor samples after short delays.
pub fn draw_zone_rect(
    injector: &dyn MouseInjector,
    cancel: &CancellationToken,
    timeout: Duration,
) -> Result<DrawnRect, PickerError> {
    #[cfg(windows)]
    {
        draw_zone_rect_win32(injector, cancel, timeout)
    }
    #[cfg(not(windows))]
    {
        let _ = timeout;
        // Fallback: two delayed samples as opposite corners.
        let a = pick_after_delay(injector, cancel, Duration::from_millis(50))?;
        let b = pick_after_delay(injector, cancel, Duration::from_millis(50))?;
        Ok(normalize_rect(a.x, a.y, b.x, b.y))
    }
}

fn normalize_rect(x0: i32, y0: i32, x1: i32, y1: i32) -> DrawnRect {
    let x = x0.min(x1);
    let y = y0.min(y1);
    let width = (x0 - x1).abs().max(1);
    let height = (y0 - y1).abs().max(1);
    DrawnRect {
        x,
        y,
        width,
        height,
    }
}

#[cfg(windows)]
fn draw_zone_rect_win32(
    injector: &dyn MouseInjector,
    cancel: &CancellationToken,
    timeout: Duration,
) -> Result<DrawnRect, PickerError> {
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON};

    let deadline = Instant::now() + timeout;
    // Wait for button up first so a leftover click does not start the drag.
    while Instant::now() < deadline {
        if cancel.is_cancelled() {
            return Err(PickerError::Cancelled);
        }
        let down = unsafe { GetAsyncKeyState(VK_LBUTTON.0 as i32) } < 0;
        if !down {
            break;
        }
        thread::sleep(Duration::from_millis(10));
    }

    // Wait for press.
    let mut origin = None;
    while Instant::now() < deadline {
        if cancel.is_cancelled() {
            return Err(PickerError::Cancelled);
        }
        let down = unsafe { GetAsyncKeyState(VK_LBUTTON.0 as i32) } < 0;
        if down {
            let p = injector.cursor_position()?;
            origin = Some(p);
            break;
        }
        thread::sleep(Duration::from_millis(10));
    }
    let start = origin.ok_or(PickerError::TimedOut)?;

    // Wait for release.
    while Instant::now() < deadline {
        if cancel.is_cancelled() {
            return Err(PickerError::Cancelled);
        }
        let down = unsafe { GetAsyncKeyState(VK_LBUTTON.0 as i32) } < 0;
        if !down {
            let end = injector.cursor_position()?;
            return Ok(normalize_rect(start.x, start.y, end.x, end.y));
        }
        thread::sleep(Duration::from_millis(10));
    }
    Err(PickerError::TimedOut)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::input::RecordingInjector;

    #[test]
    fn pick_now_reads_cursor() {
        let inj = RecordingInjector::new();
        inj.set_cursor(Point { x: 7, y: 9 });
        let p = pick_now(&inj).unwrap();
        assert_eq!((p.x, p.y), (7, 9));
    }

    #[test]
    fn pick_after_delay_can_cancel() {
        let inj = RecordingInjector::new();
        let cancel = CancellationToken::new();
        cancel.cancel();
        let err = pick_after_delay(&inj, &cancel, Duration::from_millis(50)).unwrap_err();
        assert!(matches!(err, PickerError::Cancelled));
    }

    #[test]
    fn normalize_orders_corners() {
        let r = normalize_rect(100, 80, 40, 20);
        assert_eq!((r.x, r.y, r.width, r.height), (40, 20, 60, 60));
    }
}
