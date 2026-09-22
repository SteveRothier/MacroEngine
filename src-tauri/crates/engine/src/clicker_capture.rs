//! Lightweight click-point capture for the clicker editor.
//!
//! This is *not* the macro recorder: it only collects left-button screen
//! positions and turns them into [`ClickPoint`]s. Repeated clicks on the same
//! spot bump `clicks` instead of appending a duplicate point. Esc / right-click
//! cancels.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use crate::clicker::ClickPoint;
use crate::input::{MouseInjector, Point};

const POLL: Duration = Duration::from_millis(8);
/// Same spot + quick repeat ⇒ one point with a higher `clicks` count.
const SAME_SPOT_PX: i32 = 3;
const SAME_SPOT_WINDOW: Duration = Duration::from_millis(900);
/// Drop a point recorded in the same gesture as clicking Stop in the UI.
const UI_STOP_DISCARD: Duration = Duration::from_millis(350);
/// Safety net so a forgotten capture never polls forever.
pub const CAPTURE_TIMEOUT: Duration = Duration::from_secs(300);

/// Accumulates captured points; pure logic so it can be unit tested.
#[derive(Debug, Default)]
pub struct CaptureBuffer {
    points: Vec<ClickPoint>,
    last_at: Option<Instant>,
}

impl CaptureBuffer {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn push(&mut self, p: Point, at: Instant) {
        let repeat = match (self.points.last(), self.last_at) {
            (Some(last), Some(prev)) => {
                (last.x - p.x).abs() <= SAME_SPOT_PX
                    && (last.y - p.y).abs() <= SAME_SPOT_PX
                    && at.duration_since(prev) <= SAME_SPOT_WINDOW
            }
            _ => false,
        };
        if repeat {
            if let Some(last) = self.points.last_mut() {
                last.clicks = last.clicks.saturating_add(1);
            }
        } else {
            self.points.push(ClickPoint {
                x: p.x,
                y: p.y,
                clicks: 1,
                radius: 0,
                pause_after_ms: 0,
            });
        }
        self.last_at = Some(at);
    }

    pub fn len(&self) -> usize {
        self.points.len()
    }

    pub fn is_empty(&self) -> bool {
        self.points.is_empty()
    }

    pub fn points(&self) -> Vec<ClickPoint> {
        self.points.clone()
    }

    /// Remove the last point if it was pushed within `max_age` (Stop-button click).
    pub fn discard_trailing_if_recent(&mut self, max_age: Duration) -> bool {
        match self.last_at {
            Some(at) if at.elapsed() <= max_age => {
                self.points.pop();
                self.last_at = None;
                true
            }
            _ => false,
        }
    }
}

struct CaptureShared {
    buffer: Mutex<CaptureBuffer>,
    stop: AtomicBool,
    running: AtomicBool,
    cancelled: AtomicBool,
}

/// One capture session: a polling thread plus its shared buffer.
pub struct ClickPointCapture {
    shared: Arc<CaptureShared>,
    thread: Mutex<Option<JoinHandle<()>>>,
}

impl ClickPointCapture {
    pub fn start(injector: Arc<dyn MouseInjector>) -> Self {
        let shared = Arc::new(CaptureShared {
            buffer: Mutex::new(CaptureBuffer::new()),
            stop: AtomicBool::new(false),
            running: AtomicBool::new(true),
            cancelled: AtomicBool::new(false),
        });
        let worker = Arc::clone(&shared);
        let handle = thread::Builder::new()
            .name("clicker-point-capture".into())
            .spawn(move || {
                capture_loop(worker.as_ref(), injector.as_ref());
            })
            .ok();
        if handle.is_none() {
            shared.running.store(false, Ordering::SeqCst);
        }
        Self {
            shared,
            thread: Mutex::new(handle),
        }
    }

    pub fn is_running(&self) -> bool {
        self.shared.running.load(Ordering::SeqCst)
    }

    pub fn was_cancelled(&self) -> bool {
        self.shared.cancelled.load(Ordering::SeqCst)
    }

    pub fn count(&self) -> usize {
        self.shared
            .buffer
            .lock()
            .map(|b| b.len())
            .unwrap_or(0)
    }

    /// Live snapshot without stopping the session (for overlay feedback).
    pub fn snapshot_points(&self) -> Vec<ClickPoint> {
        self.shared
            .buffer
            .lock()
            .map(|b| b.points())
            .unwrap_or_default()
    }

    /// Ask the thread to stop, join it, and return what was captured.
    /// A cancelled session (Esc) yields no points.
    /// The trailing point is dropped when it was recorded in the same gesture as
    /// Stop (clicking « Terminer » must not become a capture point).
    pub fn finish(&self) -> Vec<ClickPoint> {
        self.shared.stop.store(true, Ordering::SeqCst);
        if let Some(handle) = self.thread.lock().ok().and_then(|mut g| g.take()) {
            let _ = handle.join();
        }
        if self.was_cancelled() {
            return Vec::new();
        }
        let Ok(mut buffer) = self.shared.buffer.lock() else {
            return Vec::new();
        };
        let _ = buffer.discard_trailing_if_recent(UI_STOP_DISCARD);
        buffer.points()
    }
}

fn capture_loop(shared: &CaptureShared, injector: &dyn MouseInjector) {
    let deadline = Instant::now() + CAPTURE_TIMEOUT;
    let mut was_down = button_down();
    let mut was_escape = escape_down();
    let mut was_rbutton = right_button_down();
    while !shared.stop.load(Ordering::SeqCst) {
        if Instant::now() >= deadline {
            break;
        }
        let esc = escape_down();
        if esc && !was_escape {
            shared.cancelled.store(true, Ordering::SeqCst);
            break;
        }
        was_escape = esc;
        let rbutton = right_button_down();
        if rbutton && !was_rbutton {
            shared.cancelled.store(true, Ordering::SeqCst);
            break;
        }
        was_rbutton = rbutton;
        let down = button_down();
        if down && !was_down {
            if let Ok(p) = injector.cursor_position() {
                if let Ok(mut buffer) = shared.buffer.lock() {
                    buffer.push(p, Instant::now());
                }
            }
        }
        was_down = down;
        thread::sleep(POLL);
    }
    shared.running.store(false, Ordering::SeqCst);
}

/// One-shot screen color sample (same polling style as [`ClickPointCapture`]).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PixelSample {
    pub x: i32,
    pub y: i32,
    pub r: u8,
    pub g: u8,
    pub b: u8,
}

struct PixelCaptureShared {
    sample: Mutex<Option<PixelSample>>,
    stop: AtomicBool,
    running: AtomicBool,
    cancelled: AtomicBool,
    /// Ignore LMB edges until this instant (UI button that started capture).
    armed_at: Instant,
}

/// Wait for one left-click, then `read_pixel` at the cursor. Esc / RMB cancels.
pub struct PixelColorCapture {
    shared: Arc<PixelCaptureShared>,
    thread: Mutex<Option<JoinHandle<()>>>,
}

pub const PIXEL_CAPTURE_TIMEOUT: Duration = Duration::from_secs(60);

impl PixelColorCapture {
    pub fn start(injector: Arc<dyn MouseInjector>) -> Self {
        let shared = Arc::new(PixelCaptureShared {
            sample: Mutex::new(None),
            stop: AtomicBool::new(false),
            running: AtomicBool::new(true),
            cancelled: AtomicBool::new(false),
            armed_at: Instant::now() + UI_STOP_DISCARD,
        });
        let worker = Arc::clone(&shared);
        let handle = thread::Builder::new()
            .name("pixel-color-capture".into())
            .spawn(move || {
                pixel_capture_loop(worker.as_ref(), injector.as_ref());
            })
            .ok();
        if handle.is_none() {
            shared.running.store(false, Ordering::SeqCst);
        }
        Self {
            shared,
            thread: Mutex::new(handle),
        }
    }

    pub fn is_running(&self) -> bool {
        self.shared.running.load(Ordering::SeqCst)
    }

    pub fn was_cancelled(&self) -> bool {
        self.shared.cancelled.load(Ordering::SeqCst)
    }

    pub fn sample(&self) -> Option<PixelSample> {
        self.shared
            .sample
            .lock()
            .ok()
            .and_then(|g| *g)
    }

    /// Stop the thread and return the sample if one was taken (None if cancelled / empty).
    pub fn finish(&self) -> Option<PixelSample> {
        self.shared.stop.store(true, Ordering::SeqCst);
        if let Some(handle) = self.thread.lock().ok().and_then(|mut g| g.take()) {
            let _ = handle.join();
        }
        if self.was_cancelled() {
            return None;
        }
        self.sample()
    }
}

fn pixel_capture_loop(shared: &PixelCaptureShared, injector: &dyn MouseInjector) {
    let deadline = Instant::now() + PIXEL_CAPTURE_TIMEOUT;
    let mut was_down = button_down();
    let mut was_escape = escape_down();
    let mut was_rbutton = right_button_down();
    while !shared.stop.load(Ordering::SeqCst) {
        if Instant::now() >= deadline {
            shared.cancelled.store(true, Ordering::SeqCst);
            break;
        }
        let esc = escape_down();
        if esc && !was_escape {
            shared.cancelled.store(true, Ordering::SeqCst);
            break;
        }
        was_escape = esc;
        let rbutton = right_button_down();
        if rbutton && !was_rbutton {
            shared.cancelled.store(true, Ordering::SeqCst);
            break;
        }
        was_rbutton = rbutton;
        let down = button_down();
        if down && !was_down && Instant::now() >= shared.armed_at {
            if let Ok(p) = injector.cursor_position() {
                match injector.read_pixel(p.x, p.y) {
                    Ok((r, g, b)) => {
                        if let Ok(mut slot) = shared.sample.lock() {
                            *slot = Some(PixelSample {
                                x: p.x,
                                y: p.y,
                                r,
                                g,
                                b,
                            });
                        }
                        break;
                    }
                    Err(_) => {
                        // Keep waiting for another click if GetPixel fails once.
                    }
                }
            }
        }
        was_down = down;
        thread::sleep(POLL);
    }
    shared.running.store(false, Ordering::SeqCst);
}

#[cfg(windows)]
fn button_down() -> bool {
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON};
    let state = unsafe { GetAsyncKeyState(VK_LBUTTON.0 as i32) };
    state < 0
}

#[cfg(windows)]
fn right_button_down() -> bool {
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_RBUTTON};
    let state = unsafe { GetAsyncKeyState(VK_RBUTTON.0 as i32) };
    state < 0
}

#[cfg(windows)]
fn escape_down() -> bool {
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_ESCAPE};
    let state = unsafe { GetAsyncKeyState(VK_ESCAPE.0 as i32) };
    state < 0
}

// Off Windows the capture thread only waits for `stop` (no global hooks).
#[cfg(not(windows))]
fn button_down() -> bool {
    false
}

#[cfg(not(windows))]
fn right_button_down() -> bool {
    false
}

#[cfg(not(windows))]
fn escape_down() -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::input::RecordingInjector;

    #[test]
    fn distinct_clicks_become_distinct_points() {
        let mut buffer = CaptureBuffer::new();
        let now = Instant::now();
        buffer.push(Point { x: 10, y: 10 }, now);
        buffer.push(Point { x: 400, y: 300 }, now + Duration::from_millis(200));
        let points = buffer.points();
        assert_eq!(points.len(), 2);
        assert_eq!((points[0].x, points[0].y), (10, 10));
        assert_eq!(points[0].clicks, 1);
        assert_eq!(points[1].clicks, 1);
        assert_eq!(points[1].radius, 0);
        assert_eq!(points[0].pause_after_ms, 0);
        assert_eq!(points[1].pause_after_ms, 0);
    }

    #[test]
    fn repeated_clicks_on_same_spot_bump_click_count() {
        let mut buffer = CaptureBuffer::new();
        let now = Instant::now();
        buffer.push(Point { x: 50, y: 60 }, now);
        buffer.push(Point { x: 51, y: 61 }, now + Duration::from_millis(120));
        buffer.push(Point { x: 50, y: 60 }, now + Duration::from_millis(240));
        let points = buffer.points();
        assert_eq!(points.len(), 1);
        assert_eq!(points[0].clicks, 3);
    }

    #[test]
    fn slow_repeat_on_same_spot_adds_a_point() {
        let mut buffer = CaptureBuffer::new();
        let now = Instant::now();
        buffer.push(Point { x: 50, y: 60 }, now);
        buffer.push(Point { x: 50, y: 60 }, now + Duration::from_secs(2));
        assert_eq!(buffer.len(), 2);
    }

    #[test]
    fn discard_trailing_drops_only_recent_point() {
        let mut buffer = CaptureBuffer::new();
        buffer.push(Point { x: 10, y: 10 }, Instant::now());
        thread::sleep(Duration::from_millis(20));
        buffer.push(Point { x: 20, y: 20 }, Instant::now());
        assert_eq!(buffer.len(), 2);
        assert!(buffer.discard_trailing_if_recent(UI_STOP_DISCARD));
        assert_eq!(buffer.len(), 1);
        assert_eq!((buffer.points()[0].x, buffer.points()[0].y), (10, 10));
    }

    #[test]
    fn discard_trailing_keeps_old_last_point() {
        let mut buffer = CaptureBuffer::new();
        buffer.push(Point { x: 5, y: 5 }, Instant::now());
        thread::sleep(UI_STOP_DISCARD + Duration::from_millis(50));
        assert!(!buffer.discard_trailing_if_recent(UI_STOP_DISCARD));
        assert_eq!(buffer.len(), 1);
    }

    #[test]
    fn finish_stops_the_thread_and_returns_points() {
        let inj: Arc<dyn MouseInjector> = Arc::new(RecordingInjector::new());
        let capture = ClickPointCapture::start(inj);
        let points = capture.finish();
        assert!(points.is_empty());
        assert!(!capture.is_running());
        assert!(!capture.was_cancelled());
    }

    #[test]
    fn pixel_color_capture_finish_stops_cleanly() {
        let inj: Arc<dyn MouseInjector> = Arc::new(RecordingInjector::new());
        let capture = PixelColorCapture::start(inj);
        let sample = capture.finish();
        assert!(sample.is_none());
        assert!(!capture.is_running());
    }
}
