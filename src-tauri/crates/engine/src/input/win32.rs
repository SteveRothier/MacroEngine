use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_MOUSE, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP,
    MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP, MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP,
    MOUSEINPUT, MOUSE_EVENT_FLAGS,
};

use super::{InputError, MouseButton, MouseInjector};

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

fn mouse_input(flags: MOUSE_EVENT_FLAGS) -> INPUT {
    INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 {
            mi: MOUSEINPUT {
                dx: 0,
                dy: 0,
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
        let inputs = [mouse_input(down), mouse_input(up)];
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
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn send_input_click_succeeds() {
        // Smoke: OS accepts the call. Does not assert cursor side-effects.
        let inj = SendInputInjector::new();
        inj.click(MouseButton::Left).expect("SendInput left click");
    }
}
