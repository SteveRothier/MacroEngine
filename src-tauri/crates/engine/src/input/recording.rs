use std::sync::Mutex;

use super::{InputError, MouseButton, MouseInjector, Point};

fn chord_label(key: &str, ctrl: bool, alt: bool, shift: bool) -> String {
    let mut parts = Vec::new();
    if ctrl {
        parts.push("Ctrl");
    }
    if alt {
        parts.push("Alt");
    }
    if shift {
        parts.push("Shift");
    }
    parts.push(key);
    parts.join("+")
}

/// Test double that records clicks / moves instead of injecting OS input.
pub struct RecordingInjector {
    clicks: Mutex<Vec<MouseButton>>,
    downs: Mutex<Vec<MouseButton>>,
    ups: Mutex<Vec<MouseButton>>,
    moves: Mutex<Vec<Point>>,
    keys: Mutex<Vec<String>>,
    wheels: Mutex<Vec<i32>>,
    clipboard: Mutex<String>,
    cursor: Mutex<Point>,
    screen: (i32, i32),
    foreground_exe: Mutex<Option<String>>,
    /// Optional RGB returned by `read_pixel` (tests / mocks).
    pixel: Mutex<Option<(u8, u8, u8)>>,
}

impl RecordingInjector {
    pub fn new() -> Self {
        Self {
            clicks: Mutex::new(Vec::new()),
            downs: Mutex::new(Vec::new()),
            ups: Mutex::new(Vec::new()),
            moves: Mutex::new(Vec::new()),
            keys: Mutex::new(Vec::new()),
            wheels: Mutex::new(Vec::new()),
            clipboard: Mutex::new(String::new()),
            cursor: Mutex::new(Point { x: 100, y: 100 }),
            screen: (1920, 1080),
            foreground_exe: Mutex::new(None),
            pixel: Mutex::new(None),
        }
    }

    pub fn set_pixel(&self, rgb: Option<(u8, u8, u8)>) {
        *self.pixel.lock().expect("pixel lock") = rgb;
    }

    pub fn clicks(&self) -> Vec<MouseButton> {
        self.clicks.lock().expect("recording lock").clone()
    }

    pub fn downs(&self) -> Vec<MouseButton> {
        self.downs.lock().expect("recording lock").clone()
    }

    pub fn ups(&self) -> Vec<MouseButton> {
        self.ups.lock().expect("recording lock").clone()
    }

    pub fn moves(&self) -> Vec<Point> {
        self.moves.lock().expect("recording lock").clone()
    }

    pub fn keys(&self) -> Vec<String> {
        self.keys.lock().expect("recording lock").clone()
    }

    pub fn wheels(&self) -> Vec<i32> {
        self.wheels.lock().expect("recording lock").clone()
    }

    pub fn clipboard_text(&self) -> String {
        self.clipboard.lock().expect("clip lock").clone()
    }

    pub fn clear(&self) {
        self.clicks.lock().expect("recording lock").clear();
        self.downs.lock().expect("recording lock").clear();
        self.ups.lock().expect("recording lock").clear();
        self.moves.lock().expect("recording lock").clear();
        self.keys.lock().expect("recording lock").clear();
        self.wheels.lock().expect("recording lock").clear();
    }

    pub fn len(&self) -> usize {
        self.clicks.lock().expect("recording lock").len()
    }

    pub fn set_cursor(&self, point: Point) {
        *self.cursor.lock().expect("cursor lock") = point;
    }

    pub fn set_foreground_exe(&self, exe: Option<&str>) {
        *self.foreground_exe.lock().expect("exe lock") = exe.map(str::to_string);
    }
}

impl MouseInjector for RecordingInjector {
    fn click(&self, button: MouseButton) -> Result<(), InputError> {
        self.clicks.lock().expect("recording lock").push(button);
        Ok(())
    }

    fn mouse_down(&self, button: MouseButton) -> Result<(), InputError> {
        self.downs.lock().expect("recording lock").push(button);
        Ok(())
    }

    fn mouse_up(&self, button: MouseButton) -> Result<(), InputError> {
        self.ups.lock().expect("recording lock").push(button);
        Ok(())
    }

    fn move_to(&self, point: Point) -> Result<(), InputError> {
        self.moves.lock().expect("recording lock").push(point);
        *self.cursor.lock().expect("cursor lock") = point;
        Ok(())
    }

    fn cursor_position(&self) -> Result<Point, InputError> {
        Ok(*self.cursor.lock().expect("cursor lock"))
    }

    fn screen_size(&self) -> Result<(i32, i32), InputError> {
        Ok(self.screen)
    }

    fn foreground_exe(&self) -> Option<String> {
        self.foreground_exe.lock().expect("exe lock").clone()
    }

    fn read_pixel(&self, x: i32, y: i32) -> Result<(u8, u8, u8), InputError> {
        let _ = (x, y);
        self.pixel
            .lock()
            .expect("pixel lock")
            .ok_or_else(|| InputError::InjectionFailed("no mock pixel".into()))
    }

    fn key_tap(&self, key: &str) -> Result<(), InputError> {
        self.keys.lock().expect("recording lock").push(key.to_string());
        Ok(())
    }

    fn key_tap_shifted(&self, key: &str, shift: bool) -> Result<(), InputError> {
        let label = if shift {
            format!("Shift+{key}")
        } else {
            key.to_string()
        };
        self.keys.lock().expect("recording lock").push(label);
        Ok(())
    }

    fn key_down_shifted(&self, key: &str, shift: bool) -> Result<(), InputError> {
        let label = if shift {
            format!("down:Shift+{key}")
        } else {
            format!("down:{key}")
        };
        self.keys.lock().expect("recording lock").push(label);
        Ok(())
    }

    fn key_up_shifted(&self, key: &str, shift: bool) -> Result<(), InputError> {
        let label = if shift {
            format!("up:Shift+{key}")
        } else {
            format!("up:{key}")
        };
        self.keys.lock().expect("recording lock").push(label);
        Ok(())
    }

    fn key_chord_down(&self, key: &str, ctrl: bool, alt: bool, shift: bool) -> Result<(), InputError> {
        self.keys
            .lock()
            .expect("recording lock")
            .push(format!("down:{}", chord_label(key, ctrl, alt, shift)));
        Ok(())
    }

    fn key_chord_up(&self, key: &str, ctrl: bool, alt: bool, shift: bool) -> Result<(), InputError> {
        self.keys
            .lock()
            .expect("recording lock")
            .push(format!("up:{}", chord_label(key, ctrl, alt, shift)));
        Ok(())
    }

    fn key_chord_tap(&self, key: &str, ctrl: bool, alt: bool, shift: bool) -> Result<(), InputError> {
        self.keys
            .lock()
            .expect("recording lock")
            .push(chord_label(key, ctrl, alt, shift));
        Ok(())
    }

    fn mouse_wheel(&self, delta: i32) -> Result<(), InputError> {
        self.wheels.lock().expect("recording lock").push(delta);
        Ok(())
    }

    fn clipboard_set(&self, text: &str) -> Result<(), InputError> {
        *self.clipboard.lock().expect("clip lock") = text.to_string();
        Ok(())
    }

    fn clipboard_get(&self) -> Result<String, InputError> {
        Ok(self.clipboard.lock().expect("clip lock").clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn records_left_right_middle() {
        let inj = RecordingInjector::new();
        inj.click(MouseButton::Left).unwrap();
        inj.click(MouseButton::Right).unwrap();
        inj.click(MouseButton::Middle).unwrap();
        assert_eq!(
            inj.clicks(),
            vec![MouseButton::Left, MouseButton::Right, MouseButton::Middle]
        );
    }

    #[test]
    fn records_moves() {
        let inj = RecordingInjector::new();
        inj.move_to(Point { x: 10, y: 20 }).unwrap();
        assert_eq!(inj.moves(), vec![Point { x: 10, y: 20 }]);
        assert_eq!(inj.cursor_position().unwrap(), Point { x: 10, y: 20 });
    }
}
