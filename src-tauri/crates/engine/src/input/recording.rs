use std::sync::Mutex;

use super::{InputError, MouseButton, MouseInjector, Point};

/// Test double that records clicks / moves instead of injecting OS input.
pub struct RecordingInjector {
    clicks: Mutex<Vec<MouseButton>>,
    moves: Mutex<Vec<Point>>,
    cursor: Mutex<Point>,
    screen: (i32, i32),
}

impl RecordingInjector {
    pub fn new() -> Self {
        Self {
            clicks: Mutex::new(Vec::new()),
            moves: Mutex::new(Vec::new()),
            cursor: Mutex::new(Point { x: 100, y: 100 }),
            screen: (1920, 1080),
        }
    }

    pub fn clicks(&self) -> Vec<MouseButton> {
        self.clicks.lock().expect("recording lock").clone()
    }

    pub fn moves(&self) -> Vec<Point> {
        self.moves.lock().expect("recording lock").clone()
    }

    pub fn clear(&self) {
        self.clicks.lock().expect("recording lock").clear();
        self.moves.lock().expect("recording lock").clear();
    }

    pub fn len(&self) -> usize {
        self.clicks.lock().expect("recording lock").len()
    }

    pub fn set_cursor(&self, point: Point) {
        *self.cursor.lock().expect("cursor lock") = point;
    }
}

impl MouseInjector for RecordingInjector {
    fn click(&self, button: MouseButton) -> Result<(), InputError> {
        self.clicks.lock().expect("recording lock").push(button);
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
