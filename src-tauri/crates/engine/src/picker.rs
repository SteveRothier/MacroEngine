//! Point picker: wait until the cursor moves then settle, or sample on demand.
//!
//! M1-B uses a short poll of cursor position after an optional delay so the user
//! can aim, then captures `GetCursorPos` (no GPL code).

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

#[derive(Debug, thiserror::Error, Clone, PartialEq, Eq)]
pub enum PickerError {
    #[error(transparent)]
    Input(#[from] InputError),
    #[error("picker cancelled")]
    Cancelled,
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
}
