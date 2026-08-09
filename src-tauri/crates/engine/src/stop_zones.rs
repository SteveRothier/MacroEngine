//! Stop zones: cancel when the cursor enters a corner or rectangle.

use serde::{Deserialize, Serialize};

use crate::input::Point;

const CORNER_SIZE: i32 = 8;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ScreenCorner {
    TopLeft,
    TopRight,
    BottomLeft,
    BottomRight,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum StopZone {
    Corner { corner: ScreenCorner },
    Rect { x: i32, y: i32, width: i32, height: i32 },
}

impl StopZone {
    pub fn contains(&self, point: Point, screen: (i32, i32)) -> bool {
        let (sw, sh) = screen;
        match self {
            StopZone::Corner { corner } => {
                let (x0, y0, x1, y1) = match corner {
                    ScreenCorner::TopLeft => (0, 0, CORNER_SIZE, CORNER_SIZE),
                    ScreenCorner::TopRight => (sw - CORNER_SIZE, 0, sw, CORNER_SIZE),
                    ScreenCorner::BottomLeft => (0, sh - CORNER_SIZE, CORNER_SIZE, sh),
                    ScreenCorner::BottomRight => (sw - CORNER_SIZE, sh - CORNER_SIZE, sw, sh),
                };
                point.x >= x0 && point.x < x1 && point.y >= y0 && point.y < y1
            }
            StopZone::Rect {
                x,
                y,
                width,
                height,
            } => {
                point.x >= *x
                    && point.x < *x + *width
                    && point.y >= *y
                    && point.y < *y + *height
            }
        }
    }
}

pub fn any_zone_hit(zones: &[StopZone], point: Point, screen: (i32, i32)) -> bool {
    zones.iter().any(|z| z.contains(point, screen))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn top_left_corner_hits() {
        let z = StopZone::Corner {
            corner: ScreenCorner::TopLeft,
        };
        assert!(z.contains(Point { x: 2, y: 2 }, (1920, 1080)));
        assert!(!z.contains(Point { x: 50, y: 50 }, (1920, 1080)));
    }

    #[test]
    fn rect_hits() {
        let z = StopZone::Rect {
            x: 10,
            y: 10,
            width: 20,
            height: 20,
        };
        assert!(z.contains(Point { x: 15, y: 15 }, (800, 600)));
        assert!(!z.contains(Point { x: 5, y: 5 }, (800, 600)));
    }
}
