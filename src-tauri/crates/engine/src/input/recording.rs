use std::sync::Mutex;

use super::{InputError, MouseButton, MouseInjector};

/// Test double that records clicks instead of injecting OS input.
#[derive(Default)]
pub struct RecordingInjector {
    clicks: Mutex<Vec<MouseButton>>,
}

impl RecordingInjector {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn clicks(&self) -> Vec<MouseButton> {
        self.clicks.lock().expect("recording lock").clone()
    }

    pub fn clear(&self) {
        self.clicks.lock().expect("recording lock").clear();
    }

    pub fn len(&self) -> usize {
        self.clicks.lock().expect("recording lock").len()
    }
}

impl MouseInjector for RecordingInjector {
    fn click(&self, button: MouseButton) -> Result<(), InputError> {
        self.clicks.lock().expect("recording lock").push(button);
        Ok(())
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
}
