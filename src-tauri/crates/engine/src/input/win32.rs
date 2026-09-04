use windows::Win32::Foundation::{CloseHandle, LPARAM, POINT};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::Foundation::HANDLE;
use windows::Win32::System::DataExchange::{
    CloseClipboard, EmptyClipboard, GetClipboardData, OpenClipboard, SetClipboardData,
};
use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, INPUT_MOUSE, KEYBDINPUT, KEYEVENTF_KEYUP,
    MAPVK_VK_TO_VSC, MOUSEEVENTF_ABSOLUTE, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP,
    MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP, MOUSEEVENTF_MOVE, MOUSEEVENTF_RIGHTDOWN,
    MOUSEEVENTF_RIGHTUP, MOUSEEVENTF_WHEEL, MOUSEINPUT, MOUSE_EVENT_FLAGS, VIRTUAL_KEY,
};
use windows::Win32::Graphics::Gdi::{GetDC, GetPixel, ReleaseDC, CLR_INVALID};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetCursorPos, GetForegroundWindow, GetSystemMetrics, GetWindowThreadProcessId,
    IsWindowVisible, SM_CXSCREEN, SM_CXVIRTUALSCREEN, SM_CYSCREEN, SM_CYVIRTUALSCREEN,
    SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN,
};

use super::{InputError, MouseButton, MouseInjector, Point, INJECT_EXTRA_INFO};
use crate::stop_zones::ScreenGeom;

/// Win32 `SendInput` injector (mouse + keyboard).
pub struct SendInputInjector;

impl SendInputInjector {
    pub fn new() -> Self {
        Self
    }
}

impl Default for SendInputInjector {
    fn default() -> Self {
        Self::new()
    }
}

fn mouse_flags(button: MouseButton) -> (MOUSE_EVENT_FLAGS, MOUSE_EVENT_FLAGS) {
    match button {
        MouseButton::Left => (MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP),
        MouseButton::Right => (MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP),
        MouseButton::Middle => (MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP),
    }
}

fn mouse_input(flags: MOUSE_EVENT_FLAGS, dx: i32, dy: i32) -> INPUT {
    mouse_input_data(flags, dx, dy, 0)
}

fn mouse_input_data(flags: MOUSE_EVENT_FLAGS, dx: i32, dy: i32, data: i32) -> INPUT {
    INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 {
            mi: MOUSEINPUT {
                dx,
                dy,
                mouseData: data as u32,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: INJECT_EXTRA_INFO,
            },
        },
    }
}

fn key_vk(name: &str) -> Result<VIRTUAL_KEY, InputError> {
    let upper = name.trim().to_ascii_uppercase();
    let code: u16 = match upper.as_str() {
        "ENTER" | "RETURN" => 0x0D,
        "ESC" | "ESCAPE" => 0x1B,
        "TAB" => 0x09,
        "SPACE" | " " => 0x20,
        "BACKSPACE" | "BACK" => 0x08,
        "DELETE" | "DEL" => 0x2E,
        "LEFT" => 0x25,
        "UP" => 0x26,
        "RIGHT" => 0x27,
        "DOWN" => 0x28,
        "SHIFT" => 0x10,
        "CTRL" | "CONTROL" => 0x11,
        "ALT" | "MENU" => 0x12,
        "HOME" => 0x24,
        "END" => 0x23,
        "PAGEUP" | "PRIOR" | "PGUP" => 0x21,
        "PAGEDOWN" | "NEXT" | "PGDN" => 0x22,
        "INSERT" | "INS" => 0x2D,
        ";" => 0xBA,
        "=" => 0xBB,
        "," => 0xBC,
        "-" => 0xBD,
        "." => 0xBE,
        "/" => 0xBF,
        "`" => 0xC0,
        "[" => 0xDB,
        "\\" => 0xDC,
        "]" => 0xDD,
        "'" => 0xDE,
        "F1" => 0x70,
        "F2" => 0x71,
        "F3" => 0x72,
        "F4" => 0x73,
        "F5" => 0x74,
        "F6" => 0x75,
        "F7" => 0x76,
        "F8" => 0x77,
        "F9" => 0x78,
        "F10" => 0x79,
        "F11" => 0x7A,
        "F12" => 0x7B,
        s if s.len() == 1 => {
            let c = s.chars().next().unwrap();
            if c.is_ascii_alphanumeric() {
                c as u16
            } else {
                return Err(InputError::UnknownKey(name.into()));
            }
        }
        _ => return Err(InputError::UnknownKey(name.into())),
    };
    Ok(VIRTUAL_KEY(code))
}

fn key_input(vk: VIRTUAL_KEY, up: bool) -> INPUT {
    let scan = unsafe {
        windows::Win32::UI::Input::KeyboardAndMouse::MapVirtualKeyW(vk.0 as u32, MAPVK_VK_TO_VSC)
    } as u16;
    let flags = if up {
        KEYEVENTF_KEYUP
    } else {
        windows::Win32::UI::Input::KeyboardAndMouse::KEYBD_EVENT_FLAGS(0)
    };
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: vk,
                wScan: scan,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: INJECT_EXTRA_INFO,
            },
        },
    }
}

fn send_inputs(inputs: &[INPUT]) -> Result<(), InputError> {
    let sent = unsafe { SendInput(inputs, std::mem::size_of::<INPUT>() as i32) };
    if sent as usize != inputs.len() {
        return Err(InputError::InjectionFailed(format!(
            "SendInput returned {sent}, expected {}",
            inputs.len()
        )));
    }
    Ok(())
}

impl MouseInjector for SendInputInjector {
    fn click(&self, button: MouseButton) -> Result<(), InputError> {
        let (down, up) = mouse_flags(button);
        send_inputs(&[mouse_input(down, 0, 0), mouse_input(up, 0, 0)])
    }

    fn mouse_down(&self, button: MouseButton) -> Result<(), InputError> {
        let (down, _) = mouse_flags(button);
        send_inputs(&[mouse_input(down, 0, 0)])
    }

    fn mouse_up(&self, button: MouseButton) -> Result<(), InputError> {
        let (_, up) = mouse_flags(button);
        send_inputs(&[mouse_input(up, 0, 0)])
    }

    fn move_to(&self, point: Point) -> Result<(), InputError> {
        let geom = self.screen_geom()?;
        if geom.w <= 1 || geom.h <= 1 {
            return Err(InputError::InjectionFailed("invalid screen size".into()));
        }
        let dx = ((point.x.saturating_sub(geom.x) as i64) * 65535 / (geom.w as i64 - 1)) as i32;
        let dy = ((point.y.saturating_sub(geom.y) as i64) * 65535 / (geom.h as i64 - 1)) as i32;
        let flags = MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE;
        let inputs = [mouse_input(flags, dx, dy)];
        let sent = unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) };
        if sent as usize != inputs.len() {
            return Err(InputError::InjectionFailed(format!(
                "SendInput move returned {sent}"
            )));
        }
        Ok(())
    }

    fn cursor_position(&self) -> Result<Point, InputError> {
        let mut pt = POINT::default();
        unsafe {
            GetCursorPos(&mut pt).map_err(|e| InputError::InjectionFailed(e.to_string()))?;
        }
        Ok(Point { x: pt.x, y: pt.y })
    }

    fn screen_size(&self) -> Result<(i32, i32), InputError> {
        let geom = self.screen_geom()?;
        Ok((geom.w, geom.h))
    }

    fn screen_geom(&self) -> Result<ScreenGeom, InputError> {
        let x = unsafe { GetSystemMetrics(SM_XVIRTUALSCREEN) };
        let y = unsafe { GetSystemMetrics(SM_YVIRTUALSCREEN) };
        let mut w = unsafe { GetSystemMetrics(SM_CXVIRTUALSCREEN) };
        let mut h = unsafe { GetSystemMetrics(SM_CYVIRTUALSCREEN) };
        if w <= 0 || h <= 0 {
            w = unsafe { GetSystemMetrics(SM_CXSCREEN) };
            h = unsafe { GetSystemMetrics(SM_CYSCREEN) };
            return Ok(ScreenGeom::from_size(w, h));
        }
        Ok(ScreenGeom { x, y, w, h })
    }

    fn read_pixel(&self, x: i32, y: i32) -> Result<(u8, u8, u8), InputError> {
        unsafe {
            let hdc = GetDC(None);
            if hdc.is_invalid() {
                return Err(InputError::InjectionFailed("GetDC failed".into()));
            }
            let color = GetPixel(hdc, x, y);
            let _ = ReleaseDC(None, hdc);
            if color.0 == CLR_INVALID {
                return Err(InputError::InjectionFailed("GetPixel failed".into()));
            }
            let raw = color.0;
            let r = (raw & 0xFF) as u8;
            let g = ((raw >> 8) & 0xFF) as u8;
            let b = ((raw >> 16) & 0xFF) as u8;
            Ok((r, g, b))
        }
    }

    fn key_tap(&self, key: &str) -> Result<(), InputError> {
        let vk = key_vk(key)?;
        send_inputs(&[key_input(vk, false), key_input(vk, true)])
    }

    fn key_tap_shifted(&self, key: &str, shift: bool) -> Result<(), InputError> {
        if !shift {
            return self.key_tap(key);
        }
        let shift_vk = key_vk("SHIFT")?;
        let vk = key_vk(key)?;
        send_inputs(&[
            key_input(shift_vk, false),
            key_input(vk, false),
            key_input(vk, true),
            key_input(shift_vk, true),
        ])
    }

    fn key_down_shifted(&self, key: &str, shift: bool) -> Result<(), InputError> {
        let vk = key_vk(key)?;
        if shift {
            let shift_vk = key_vk("SHIFT")?;
            send_inputs(&[key_input(shift_vk, false), key_input(vk, false)])
        } else {
            send_inputs(&[key_input(vk, false)])
        }
    }

    fn key_up_shifted(&self, key: &str, shift: bool) -> Result<(), InputError> {
        let vk = key_vk(key)?;
        if shift {
            let shift_vk = key_vk("SHIFT")?;
            send_inputs(&[key_input(vk, true), key_input(shift_vk, true)])
        } else {
            send_inputs(&[key_input(vk, true)])
        }
    }

    fn key_chord_down(&self, key: &str, ctrl: bool, alt: bool, shift: bool) -> Result<(), InputError> {
        send_inputs(&chord_inputs(key, ctrl, alt, shift, false)?)
    }

    fn key_chord_up(&self, key: &str, ctrl: bool, alt: bool, shift: bool) -> Result<(), InputError> {
        send_inputs(&chord_inputs(key, ctrl, alt, shift, true)?)
    }

    fn key_chord_tap(&self, key: &str, ctrl: bool, alt: bool, shift: bool) -> Result<(), InputError> {
        self.key_chord_down(key, ctrl, alt, shift)?;
        self.key_chord_up(key, ctrl, alt, shift)
    }

    fn mouse_wheel(&self, delta: i32) -> Result<(), InputError> {
        send_inputs(&[mouse_input_data(MOUSEEVENTF_WHEEL, 0, 0, delta)])
    }

    fn clipboard_set(&self, text: &str) -> Result<(), InputError> {
        clipboard_set_unicode(text)
    }

    fn clipboard_get(&self) -> Result<String, InputError> {
        clipboard_get_unicode()
    }

    fn foreground_exe(&self) -> Option<String> {
        foreground_process_exe()
    }
}

fn chord_inputs(
    key: &str,
    ctrl: bool,
    alt: bool,
    shift: bool,
    up: bool,
) -> Result<Vec<INPUT>, InputError> {
    let vk = key_vk(key)?;
    let mut mods = Vec::new();
    if ctrl {
        mods.push(key_vk("CTRL")?);
    }
    if alt {
        mods.push(key_vk("ALT")?);
    }
    if shift {
        mods.push(key_vk("SHIFT")?);
    }
    let mut out = Vec::with_capacity(mods.len() + 1);
    if up {
        out.push(key_input(vk, true));
        for m in mods.into_iter().rev() {
            out.push(key_input(m, true));
        }
    } else {
        for m in mods {
            out.push(key_input(m, false));
        }
        out.push(key_input(vk, false));
    }
    Ok(out)
}

fn clipboard_set_unicode(text: &str) -> Result<(), InputError> {
    let wide: Vec<u16> = text.encode_utf16().chain(std::iter::once(0)).collect();
    let bytes = wide.len() * std::mem::size_of::<u16>();
    unsafe {
        let hmem = GlobalAlloc(GMEM_MOVEABLE, bytes)
            .map_err(|e| InputError::InjectionFailed(e.to_string()))?;
        let ptr = GlobalLock(hmem);
        if ptr.is_null() {
            return Err(InputError::InjectionFailed("GlobalLock failed".into()));
        }
        std::ptr::copy_nonoverlapping(wide.as_ptr(), ptr.cast::<u16>(), wide.len());
        let _ = GlobalUnlock(hmem);
        OpenClipboard(None).map_err(|e| InputError::InjectionFailed(e.to_string()))?;
        if let Err(e) = EmptyClipboard() {
            let _ = CloseClipboard();
            return Err(InputError::InjectionFailed(e.to_string()));
        }
        let handle = HANDLE(hmem.0);
        if let Err(e) = SetClipboardData(13, Some(handle)) {
            let _ = CloseClipboard();
            return Err(InputError::InjectionFailed(e.to_string()));
        }
        CloseClipboard().map_err(|e| InputError::InjectionFailed(e.to_string()))?;
    }
    Ok(())
}

fn clipboard_get_unicode() -> Result<String, InputError> {
    unsafe {
        OpenClipboard(None).map_err(|e| InputError::InjectionFailed(e.to_string()))?;
        let handle = match GetClipboardData(13) {
            Ok(h) => h,
            Err(_) => {
                let _ = CloseClipboard();
                return Ok(String::new());
            }
        };
        if handle.0.is_null() {
            let _ = CloseClipboard();
            return Ok(String::new());
        }
        let hmem = windows::Win32::Foundation::HGLOBAL(handle.0);
        let ptr = GlobalLock(hmem);
        if ptr.is_null() {
            let _ = CloseClipboard();
            return Err(InputError::InjectionFailed("GlobalLock failed".into()));
        }
        let wide = std::slice::from_raw_parts(ptr.cast::<u16>(), 32_768);
        let len = wide.iter().position(|&c| c == 0).unwrap_or(wide.len());
        let text = String::from_utf16_lossy(&wide[..len]);
        let _ = GlobalUnlock(hmem);
        CloseClipboard().map_err(|e| InputError::InjectionFailed(e.to_string()))?;
        Ok(text)
    }
}

fn exe_for_pid(pid: u32) -> Option<String> {
    unsafe {
        if pid == 0 {
            return None;
        }
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = [0u16; 260];
        let mut size = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_WIN32,
            windows::core::PWSTR(buf.as_mut_ptr()),
            &mut size,
        )
        .is_ok();
        let _ = CloseHandle(handle);
        if !ok || size == 0 {
            return None;
        }
        Some(String::from_utf16_lossy(&buf[..size as usize]))
    }
}

fn foreground_process_exe() -> Option<String> {
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() {
            return None;
        }
        let mut pid = 0u32;
        let _ = GetWindowThreadProcessId(hwnd, Some(&mut pid));
        exe_for_pid(pid)
    }
}

unsafe extern "system" fn collect_visible_exe(
    hwnd: windows::Win32::Foundation::HWND,
    lparam: LPARAM,
) -> windows::core::BOOL {
    if !IsWindowVisible(hwnd).as_bool() {
        return windows::core::BOOL(1);
    }
    let mut pid = 0u32;
    let _ = GetWindowThreadProcessId(hwnd, Some(&mut pid));
    if let Some(path) = exe_for_pid(pid) {
        let names = &mut *(lparam.0 as *mut Vec<String>);
        let base = crate::settings::normalize_exe_name(&path);
        if !base.is_empty() && !names.iter().any(|n| n == &base) {
            names.push(base);
        }
    }
    windows::core::BOOL(1)
}

pub(crate) fn list_visible_process_exes() -> Vec<String> {
    let mut names: Vec<String> = Vec::new();
    unsafe {
        let _ = EnumWindows(Some(collect_visible_exe), LPARAM(&mut names as *mut _ as isize));
    }
    names.sort();
    names
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn send_input_click_succeeds() {
        let inj = SendInputInjector::new();
        inj.click(MouseButton::Left).expect("SendInput left click");
    }

    #[test]
    fn cursor_position_readable() {
        let inj = SendInputInjector::new();
        let _ = inj.cursor_position().expect("cursor");
    }

    #[test]
    fn key_tap_a_succeeds() {
        let inj = SendInputInjector::new();
        inj.key_tap("A").expect("key tap");
    }
}
