use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_MOUSE, MOUSEEVENTF_ABSOLUTE, MOUSEEVENTF_LEFTDOWN,
    MOUSEEVENTF_LEFTUP, MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP, MOUSEEVENTF_MOVE,
    MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP, MOUSEINPUT, MOUSE_EVENT_FLAGS,
};
use windows::Win32::UI::WindowsAndMessaging::{GetCursorPos, GetSystemMetrics, SM_CXSCREEN, SM_CYSCREEN};
use windows::Win32::Foundation::POINT;

use super::{InputError, MouseButton, MouseInjector, Point};

/// Win32 `SendInput` mouse click injector.
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
    INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 {
            mi: MOUSEINPUT {
                dx,
                dy,
                mouseData: 0,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}

impl MouseInjector for SendInputInjector {
    fn click(&self, button: MouseButton) -> Result<(), InputError> {
        let (down, up) = mouse_flags(button);
        let inputs = [mouse_input(down, 0, 0), mouse_input(up, 0, 0)];
        // SAFETY: `inputs` is a valid contiguous INPUT array of length 2.
        let sent = unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) };
        if sent as usize != inputs.len() {
            return Err(InputError::InjectionFailed(format!(
                "SendInput returned {sent}, expected {}",
                inputs.len()
            )));
        }
        Ok(())
    }

    fn move_to(&self, point: Point) -> Result<(), InputError> {
        let (w, h) = self.screen_size()?;
        if w <= 1 || h <= 1 {
            return Err(InputError::InjectionFailed("invalid screen size".into()));
        }
        // Absolute SendInput coordinates are in [0, 65535] mapped to the primary display.
        let dx = ((point.x as i64) * 65535 / (w as i64 - 1)) as i32;
        let dy = ((point.y as i64) * 65535 / (h as i64 - 1)) as i32;
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
        let w = unsafe { GetSystemMetrics(SM_CXSCREEN) };
        let h = unsafe { GetSystemMetrics(SM_CYSCREEN) };
        Ok((w, h))
    }
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
        let p = inj.cursor_position().expect("cursor");
        assert!(p.x >= 0 && p.y >= 0);
    }
}
