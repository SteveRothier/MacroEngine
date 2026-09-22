//! One click-through Win32 layered window covering the selected monitor.
//!
//! Bands and target markers are painted inside a fixed-size HWND. A dedicated
//! thread pumps WM_PAINT.

use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};

use crate::stop_zones::{darken_fill, OverlayBand, OverlayMarker, ScreenGeom};

#[cfg(windows)]
use windows::core::w;
#[cfg(windows)]
use windows::Win32::Foundation::{COLORREF, HWND, LPARAM, LRESULT, RECT, WPARAM};
#[cfg(windows)]
use windows::Win32::Graphics::Gdi::{
    BeginPaint, CreatePen, CreateSolidBrush, DeleteObject, Ellipse, EndPaint, FillRect, FrameRect,
    SelectObject, HBRUSH, PAINTSTRUCT, PS_SOLID,
};
#[cfg(windows)]
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
#[cfg(windows)]
use windows::Win32::System::Threading::GetCurrentThreadId;
#[cfg(windows)]
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, GetClientRect, GetMessageW,
    PeekMessageW, PostThreadMessageW, RegisterClassW, SetLayeredWindowAttributes, SetWindowPos,
    ShowWindow, TranslateMessage, CS_HREDRAW, CS_VREDRAW, HWND_TOPMOST, LWA_ALPHA, LWA_COLORKEY,
    PM_NOREMOVE, SWP_NOACTIVATE, SWP_SHOWWINDOW, SW_HIDE, SW_SHOWNOACTIVATE, WM_APP, WM_DESTROY,
    WM_ERASEBKGND, WM_NCHITTEST, WM_PAINT, WM_QUIT, WNDCLASSW, WS_EX_LAYERED, WS_EX_NOACTIVATE,
    WS_EX_TOOLWINDOW, WS_EX_TOPMOST, WS_EX_TRANSPARENT, WS_POPUP, WS_VISIBLE, MSG,
};

const ALPHA: u8 = 100;
#[cfg(windows)]
const WM_SYNC: u32 = WM_APP + 32;
#[cfg(windows)]
const COLOR_KEY: u32 = 255 | (0 << 8) | (255 << 16);
const DOT_RADIUS: i32 = 7;

#[derive(Clone)]
struct OverlayFrame {
    screen: ScreenGeom,
    bands: Vec<OverlayBand>,
    markers: Vec<OverlayMarker>,
}

impl OverlayFrame {
    fn hidden() -> Self {
        Self {
            screen: ScreenGeom {
                x: 0,
                y: 0,
                w: 0,
                h: 0,
            },
            bands: Vec::new(),
            markers: Vec::new(),
        }
    }

    fn is_hidden(&self) -> bool {
        self.screen.w <= 0
            || self.screen.h <= 0
            || (self.bands.is_empty() && self.markers.is_empty())
    }
}

pub struct NativeZoneOverlay {
    pending: Arc<Mutex<OverlayFrame>>,
    thread_id: Arc<AtomicU32>,
    join: Mutex<Option<JoinHandle<()>>>,
}

impl Default for NativeZoneOverlay {
    fn default() -> Self {
        Self::new()
    }
}

impl NativeZoneOverlay {
    pub fn new() -> Self {
        let pending = Arc::new(Mutex::new(OverlayFrame::hidden()));
        let thread_id = Arc::new(AtomicU32::new(0));
        let join = Mutex::new(None);

        #[cfg(windows)]
        {
            let pending_t = Arc::clone(&pending);
            let thread_id_t = Arc::clone(&thread_id);
            let (ready_tx, ready_rx) = mpsc::channel();
            let handle = thread::spawn(move || overlay_thread(pending_t, thread_id_t, ready_tx));
            let _ = ready_rx.recv();
            *join.lock().unwrap_or_else(|e| e.into_inner()) = Some(handle);
        }

        Self {
            pending,
            thread_id,
            join,
        }
    }

    pub fn hide(&self) {
        let _ = self.sync(ScreenGeom::from_size(0, 0), &[], &[]);
    }

    pub fn sync(
        &self,
        screen: ScreenGeom,
        bands: &[OverlayBand],
        markers: &[OverlayMarker],
    ) -> Result<(), String> {
        {
            let mut pending = self.pending.lock().map_err(|e| e.to_string())?;
            pending.screen = screen;
            pending.bands.clear();
            pending.bands.extend_from_slice(bands);
            pending.markers.clear();
            pending.markers.extend_from_slice(markers);
        }
        #[cfg(windows)]
        {
            let tid = self.thread_id.load(Ordering::SeqCst);
            if tid != 0 {
                unsafe {
                    let _ = PostThreadMessageW(tid, WM_SYNC, WPARAM(0), LPARAM(0));
                }
            }
        }
        #[cfg(not(windows))]
        {
            let _ = (screen, bands, markers);
        }
        Ok(())
    }
}

impl Drop for NativeZoneOverlay {
    fn drop(&mut self) {
        #[cfg(windows)]
        {
            let tid = self.thread_id.load(Ordering::SeqCst);
            if tid != 0 {
                unsafe {
                    let _ = PostThreadMessageW(tid, WM_QUIT, WPARAM(0), LPARAM(0));
                }
            }
        }
        if let Ok(mut join) = self.join.lock() {
            if let Some(handle) = join.take() {
                let _ = handle.join();
            }
        }
    }
}

#[cfg(windows)]
struct Host {
    hwnd: isize,
    screen: ScreenGeom,
}

#[cfg(windows)]
fn overlay_thread(
    pending: Arc<Mutex<OverlayFrame>>,
    thread_id: Arc<AtomicU32>,
    ready: mpsc::Sender<()>,
) {
    let _ = ensure_class();
    let mut msg = MSG::default();
    unsafe {
        let _ = PeekMessageW(&mut msg, None, 0, 0, PM_NOREMOVE);
    }
    thread_id.store(unsafe { GetCurrentThreadId() }, Ordering::SeqCst);
    let _ = ready.send(());

    let mut host: Option<Host> = None;
    apply_pending(&pending, &mut host);

    loop {
        let got = unsafe { GetMessageW(&mut msg, None, 0, 0) };
        if !got.as_bool() {
            break;
        }
        if msg.message == WM_SYNC {
            apply_pending(&pending, &mut host);
            continue;
        }
        unsafe {
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    }

    if let Some(host) = host.take() {
        unsafe {
            let hwnd = HWND(host.hwnd as *mut std::ffi::c_void);
            let _ = DestroyWindow(hwnd);
        }
    }
}

#[cfg(windows)]
fn apply_pending(pending: &Mutex<OverlayFrame>, host: &mut Option<Host>) {
    let frame = pending
        .lock()
        .map(|g| g.clone())
        .unwrap_or_else(|_| OverlayFrame::hidden());
    if frame.is_hidden() {
        if let Some(h) = host.take() {
            unsafe {
                let hwnd = HWND(h.hwnd as *mut std::ffi::c_void);
                let _ = ShowWindow(hwnd, SW_HIDE);
                let _ = DestroyWindow(hwnd);
            }
        }
        set_paint_frame(ScreenGeom::from_size(0, 0), &[], &[]);
        return;
    }
    match host {
        Some(h) => {
            let hwnd = HWND(h.hwnd as *mut std::ffi::c_void);
            if h.screen != frame.screen {
                unsafe {
                    let _ = SetWindowPos(
                        hwnd,
                        Some(HWND_TOPMOST),
                        frame.screen.x,
                        frame.screen.y,
                        frame.screen.w.max(1),
                        frame.screen.h.max(1),
                        SWP_NOACTIVATE | SWP_SHOWWINDOW,
                    );
                }
                h.screen = frame.screen;
            }
            set_paint_frame(frame.screen, &frame.bands, &frame.markers);
            unsafe {
                let _ = InvalidateRect(Some(hwnd), None, true);
            }
        }
        None => match create_host(frame.screen) {
            Ok(h) => {
                set_paint_frame(frame.screen, &frame.bands, &frame.markers);
                unsafe {
                    let hwnd = HWND(h.hwnd as *mut std::ffi::c_void);
                    let _ = InvalidateRect(Some(hwnd), None, true);
                }
                *host = Some(h);
            }
            Err(_) => {}
        },
    }
}

#[cfg(windows)]
use windows::Win32::Graphics::Gdi::InvalidateRect;

#[cfg(windows)]
fn create_host(screen: ScreenGeom) -> Result<Host, String> {
    ensure_class()?;
    let hwnd = unsafe {
        CreateWindowExW(
            WS_EX_LAYERED
                | WS_EX_TRANSPARENT
                | WS_EX_TOPMOST
                | WS_EX_TOOLWINDOW
                | WS_EX_NOACTIVATE,
            w!("Caster.ZoneBand"),
            w!(""),
            WS_POPUP | WS_VISIBLE,
            screen.x,
            screen.y,
            screen.w.max(1),
            screen.h.max(1),
            None,
            None,
            None,
            None,
        )
    }
    .map_err(|e| format!("CreateWindowExW: {e}"))?;
    unsafe {
        SetLayeredWindowAttributes(hwnd, COLORREF(COLOR_KEY), ALPHA, LWA_COLORKEY | LWA_ALPHA)
            .map_err(|e| format!("SetLayeredWindowAttributes: {e}"))?;
        let _ = SetWindowPos(
            hwnd,
            Some(HWND_TOPMOST),
            screen.x,
            screen.y,
            screen.w.max(1),
            screen.h.max(1),
            SWP_NOACTIVATE | SWP_SHOWWINDOW,
        );
        let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
    }
    Ok(Host {
        hwnd: hwnd.0 as isize,
        screen,
    })
}

#[cfg(windows)]
struct PaintState {
    screen: ScreenGeom,
    bands: Vec<OverlayBand>,
    markers: Vec<OverlayMarker>,
}

#[cfg(windows)]
fn paint_state() -> &'static Mutex<PaintState> {
    static STATE: std::sync::OnceLock<Mutex<PaintState>> = std::sync::OnceLock::new();
    STATE.get_or_init(|| {
        Mutex::new(PaintState {
            screen: ScreenGeom::from_size(0, 0),
            bands: Vec::new(),
            markers: Vec::new(),
        })
    })
}

#[cfg(windows)]
fn set_paint_frame(screen: ScreenGeom, bands: &[OverlayBand], markers: &[OverlayMarker]) {
    if let Ok(mut s) = paint_state().lock() {
        s.screen = screen;
        s.bands.clear();
        s.bands.extend_from_slice(bands);
        s.markers.clear();
        s.markers.extend_from_slice(markers);
    }
}

#[cfg(windows)]
unsafe fn paint_ellipse(
    hdc: windows::Win32::Graphics::Gdi::HDC,
    cx: i32,
    cy: i32,
    radius: i32,
    fill: u32,
) {
    let r = radius.clamp(1, 10_000);
    let fill_brush = CreateSolidBrush(COLORREF(fill));
    if fill_brush.0.is_null() {
        return;
    }
    let border = darken_fill(fill);
    let pen = CreatePen(PS_SOLID, 1, COLORREF(border));
    if pen.0.is_null() {
        let _ = DeleteObject(fill_brush.into());
        return;
    }
    let old_brush = SelectObject(hdc, fill_brush.into());
    let old_pen = SelectObject(hdc, pen.into());
    let _ = Ellipse(hdc, cx - r, cy - r, cx + r, cy + r);
    let _ = SelectObject(hdc, old_brush);
    let _ = SelectObject(hdc, old_pen);
    let _ = DeleteObject(fill_brush.into());
    let _ = DeleteObject(pen.into());
}

#[cfg(windows)]
unsafe extern "system" fn wnd_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match msg {
        WM_NCHITTEST => LRESULT(-1),
        WM_ERASEBKGND => LRESULT(1),
        WM_PAINT => {
            let mut ps = PAINTSTRUCT::default();
            let hdc = BeginPaint(hwnd, &mut ps);
            let mut rc = RECT::default();
            let _ = GetClientRect(hwnd, &mut rc);
            let key_brush = CreateSolidBrush(COLORREF(COLOR_KEY));
            let _ = FillRect(hdc, &rc, key_brush);
            let _ = DeleteObject(key_brush.into());
            // Clone then drop the lock before GDI work (avoid re-entrancy / deadlock).
            let snapshot = paint_state().lock().ok().map(|s| {
                (
                    s.screen.x,
                    s.screen.y,
                    s.bands.clone(),
                    s.markers.clone(),
                )
            });
            if let Some((ox, oy, bands, markers)) = snapshot {
                for band in &bands {
                    let fill = band.fill;
                    let border = darken_fill(fill);
                    let band_rc = RECT {
                        left: band.x - ox,
                        top: band.y - oy,
                        right: band.x - ox + band.w.max(1),
                        bottom: band.y - oy + band.h.max(1),
                    };
                    let fill_brush = CreateSolidBrush(COLORREF(fill));
                    let border_brush = CreateSolidBrush(COLORREF(border));
                    let _ = FillRect(hdc, &band_rc, fill_brush);
                    let _ = FrameRect(hdc, &band_rc, border_brush);
                    let _ = DeleteObject(fill_brush.into());
                    let _ = DeleteObject(border_brush.into());
                }
                for marker in &markers {
                    let cx = marker.x - ox;
                    let cy = marker.y - oy;
                    if marker.radius > 0 {
                        paint_ellipse(hdc, cx, cy, marker.radius, marker.fill);
                    }
                    paint_ellipse(hdc, cx, cy, DOT_RADIUS, marker.fill);
                }
            }
            let _ = EndPaint(hwnd, &ps);
            LRESULT(0)
        }
        WM_DESTROY => LRESULT(0),
        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}

#[cfg(windows)]
fn ensure_class() -> Result<(), String> {
    use std::sync::OnceLock;
    static CLASS: OnceLock<Result<(), String>> = OnceLock::new();
    CLASS
        .get_or_init(|| unsafe {
            let instance = GetModuleHandleW(None).map_err(|e| format!("GetModuleHandleW: {e}"))?;
            let wc = WNDCLASSW {
                style: CS_HREDRAW | CS_VREDRAW,
                lpfnWndProc: Some(wnd_proc),
                hInstance: instance.into(),
                lpszClassName: w!("Caster.ZoneBand"),
                hbrBackground: HBRUSH::default(),
                ..Default::default()
            };
            let _ = RegisterClassW(&wc);
            Ok(())
        })
        .clone()
}
