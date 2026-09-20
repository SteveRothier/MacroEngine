//! Stop zones: corners, edges, and custom rects with actions.

use serde::{Deserialize, Serialize};

use crate::input::Point;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ScreenCorner {
    TopLeft,
    TopRight,
    BottomLeft,
    BottomRight,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ScreenEdge {
    Left,
    Right,
    Top,
    Bottom,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum ZoneKind {
    #[default]
    Safety,
    Click,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum ClickSampleMode {
    #[default]
    Random,
    Center,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum ZoneAction {
    #[default]
    Stop,
    Pause,
    Start,
}

/// Desktop geometry (virtual screen origin + size).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ScreenGeom {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

impl ScreenGeom {
    pub fn from_size(w: i32, h: i32) -> Self {
        Self { x: 0, y: 0, w, h }
    }
}

/// IPC / UI form of [`ScreenGeom`].
///
/// `x/y/width/height` are physical pixels on the virtual desktop, so the UI can
/// map a pointer to screen coordinates without DPI math; `scale_factor` is
/// informational (labels, hints) and never used to scale those fields.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenGeomDto {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    #[serde(default = "default_scale_factor")]
    pub scale_factor: f64,
}

fn default_scale_factor() -> f64 {
    1.0
}

impl Default for ScreenGeomDto {
    fn default() -> Self {
        Self {
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
            scale_factor: default_scale_factor(),
        }
    }
}

impl ScreenGeomDto {
    pub fn with_scale_factor(mut self, scale_factor: f64) -> Self {
        self.scale_factor = if scale_factor.is_finite() && scale_factor > 0.0 {
            scale_factor
        } else {
            default_scale_factor()
        };
        self
    }
}

impl From<ScreenGeom> for ScreenGeomDto {
    fn from(g: ScreenGeom) -> Self {
        Self {
            x: g.x,
            y: g.y,
            width: g.w,
            height: g.h,
            scale_factor: default_scale_factor(),
        }
    }
}

impl From<ScreenGeomDto> for ScreenGeom {
    fn from(d: ScreenGeomDto) -> Self {
        Self {
            x: d.x,
            y: d.y,
            w: d.width,
            h: d.height,
        }
    }
}

/// Pixel rectangle on the virtual desktop, used by the native overlay.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct OverlayBand {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
    pub action: ZoneAction,
    /// COLORREF (R | G<<8 | B<<16).
    pub fill: u32,
}

pub fn overlay_bands(zones: &[StopZone], screen: ScreenGeom) -> Vec<OverlayBand> {
    zones
        .iter()
        .map(|z| z.overlay_band(screen))
        .filter(|b| b.w > 0 && b.h > 0)
        .collect()
}

fn default_corner_size() -> i32 {
    80
}

fn default_edge_margin() -> i32 {
    40
}

fn default_zero() -> i32 {
    0
}

pub const EDGE_FILL: u32 = 211 | (59 << 8) | (59 << 16);
pub const CORNER_FILL: u32 = 124 | (92 << 8) | (191 << 16);
pub const CLICK_FILL: u32 = 59 | (130 << 8) | (246 << 16);

pub fn parse_hex_fill(s: &str, fallback: u32) -> u32 {
    let t = s.trim().trim_start_matches('#');
    if t.len() != 6 {
        return fallback;
    }
    let Ok(n) = u32::from_str_radix(t, 16) else {
        return fallback;
    };
    let r = (n >> 16) & 0xff;
    let g = (n >> 8) & 0xff;
    let b = n & 0xff;
    r | (g << 8) | (b << 16)
}

pub fn darken_fill(fill: u32) -> u32 {
    let r = (fill & 0xff) * 3 / 4;
    let g = ((fill >> 8) & 0xff) * 3 / 4;
    let b = ((fill >> 16) & 0xff) * 3 / 4;
    r | (g << 8) | (b << 16)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum StopZone {
    #[serde(rename_all = "camelCase")]
    Corner {
        corner: ScreenCorner,
        #[serde(default = "default_corner_size")]
        size_px: i32,
        #[serde(default = "default_zero")]
        width_px: i32,
        #[serde(default = "default_zero")]
        height_px: i32,
        #[serde(default)]
        color: String,
    },
    #[serde(rename_all = "camelCase")]
    Edge {
        edge: ScreenEdge,
        #[serde(default = "default_edge_margin")]
        margin_px: i32,
    },
    /// Legacy plain rect (= Stop). Prefer [`StopZone::Custom`].
    Rect {
        x: i32,
        y: i32,
        width: i32,
        height: i32,
    },
    #[serde(rename_all = "camelCase")]
    Custom {
        id: String,
        x: i32,
        y: i32,
        width: i32,
        height: i32,
        #[serde(default)]
        action: ZoneAction,
        #[serde(default)]
        kind: ZoneKind,
        #[serde(default)]
        color: String,
        #[serde(default)]
        click_mode: ClickSampleMode,
    },
}

impl StopZone {
    fn corner_wh(size_px: i32, width_px: i32, height_px: i32) -> (i32, i32) {
        let w = if width_px > 0 {
            width_px
        } else {
            size_px.max(1)
        };
        let h = if height_px > 0 {
            height_px
        } else {
            size_px.max(1)
        };
        (w.max(1), h.max(1))
    }

    pub fn contains(&self, point: Point, screen: ScreenGeom) -> bool {
        let ScreenGeom {
            x: ox,
            y: oy,
            w: sw,
            h: sh,
        } = screen;
        match self {
            StopZone::Corner {
                corner,
                size_px,
                width_px,
                height_px,
                ..
            } => {
                let (cw, ch) = Self::corner_wh(*size_px, *width_px, *height_px);
                let (x0, y0, x1, y1) = match corner {
                    ScreenCorner::TopLeft => (ox, oy, ox + cw, oy + ch),
                    ScreenCorner::TopRight => (ox + sw - cw, oy, ox + sw, oy + ch),
                    ScreenCorner::BottomLeft => (ox, oy + sh - ch, ox + cw, oy + sh),
                    ScreenCorner::BottomRight => (ox + sw - cw, oy + sh - ch, ox + sw, oy + sh),
                };
                point.x >= x0 && point.x < x1 && point.y >= y0 && point.y < y1
            }
            StopZone::Edge { edge, margin_px } => {
                let m = (*margin_px).max(1);
                match edge {
                    ScreenEdge::Left => point.x >= ox && point.x < ox + m,
                    ScreenEdge::Right => point.x >= ox + sw - m && point.x < ox + sw,
                    ScreenEdge::Top => point.y >= oy && point.y < oy + m,
                    ScreenEdge::Bottom => point.y >= oy + sh - m && point.y < oy + sh,
                }
            }
            StopZone::Rect {
                x,
                y,
                width,
                height,
            }
            | StopZone::Custom {
                x,
                y,
                width,
                height,
                ..
            } => {
                point.x >= *x
                    && point.x < *x + *width
                    && point.y >= *y
                    && point.y < *y + *height
            }
        }
    }

    pub fn is_safety(&self) -> bool {
        match self {
            StopZone::Custom { kind, .. } => *kind == ZoneKind::Safety,
            _ => true,
        }
    }

    pub fn click_rect(&self) -> Option<(i32, i32, i32, i32)> {
        match self {
            StopZone::Custom {
                kind: ZoneKind::Click,
                x,
                y,
                width,
                height,
                ..
            } => Some((*x, *y, (*width).max(1), (*height).max(1))),
            _ => None,
        }
    }

    pub fn click_sample(&self) -> ClickSampleMode {
        match self {
            StopZone::Custom {
                kind: ZoneKind::Click,
                click_mode,
                ..
            } => *click_mode,
            _ => ClickSampleMode::Random,
        }
    }

    pub fn action(&self) -> ZoneAction {
        match self {
            StopZone::Custom { action, .. } => *action,
            _ => ZoneAction::Stop,
        }
    }

    pub fn overlay_band(&self, screen: ScreenGeom) -> OverlayBand {
        let ScreenGeom {
            x: ox,
            y: oy,
            w: sw,
            h: sh,
        } = screen;
        match self {
            StopZone::Corner {
                corner,
                size_px,
                width_px,
                height_px,
                color,
            } => {
                let (cw, ch) = Self::corner_wh(*size_px, *width_px, *height_px);
                let (x, y) = match corner {
                    ScreenCorner::TopLeft => (ox, oy),
                    ScreenCorner::TopRight => (ox + sw - cw, oy),
                    ScreenCorner::BottomLeft => (ox, oy + sh - ch),
                    ScreenCorner::BottomRight => (ox + sw - cw, oy + sh - ch),
                };
                OverlayBand {
                    x,
                    y,
                    w: cw,
                    h: ch,
                    action: ZoneAction::Stop,
                    fill: parse_hex_fill(color, CORNER_FILL),
                }
            }
            StopZone::Edge { edge, margin_px } => {
                let m = (*margin_px).max(1);
                let (x, y, w, h) = match edge {
                    ScreenEdge::Left => (ox, oy, m, sh),
                    ScreenEdge::Right => (ox + sw - m, oy, m, sh),
                    ScreenEdge::Top => (ox, oy, sw, m),
                    ScreenEdge::Bottom => (ox, oy + sh - m, sw, m),
                };
                OverlayBand {
                    x,
                    y,
                    w,
                    h,
                    action: ZoneAction::Stop,
                    fill: EDGE_FILL,
                }
            }
            StopZone::Rect {
                x,
                y,
                width,
                height,
            } => OverlayBand {
                x: *x,
                y: *y,
                w: *width,
                h: *height,
                action: ZoneAction::Stop,
                fill: EDGE_FILL,
            },
            StopZone::Custom {
                x,
                y,
                width,
                height,
                action,
                kind,
                color,
                ..
            } => OverlayBand {
                x: *x,
                y: *y,
                w: *width,
                h: *height,
                action: *action,
                fill: parse_hex_fill(
                    color,
                    if *kind == ZoneKind::Click {
                        CLICK_FILL
                    } else {
                        match action {
                            ZoneAction::Pause => 201 | (162 << 8) | (39 << 16),
                            ZoneAction::Start => 30 | (142 << 8) | (90 << 16),
                            ZoneAction::Stop => EDGE_FILL,
                        }
                    },
                ),
            },
        }
    }
}

/// First matching safety-zone action at point, if any.
/// Stop wins immediately; Start overrides Pause when both match.
pub fn zone_hit(
    zones: &[StopZone],
    point: Point,
    screen: ScreenGeom,
) -> Option<ZoneAction> {
    let mut hit: Option<ZoneAction> = None;
    for z in zones {
        if !z.is_safety() || !z.contains(point, screen) {
            continue;
        }
        match z.action() {
            ZoneAction::Stop => return Some(ZoneAction::Stop),
            ZoneAction::Start => hit = Some(ZoneAction::Start),
            ZoneAction::Pause => {
                if hit != Some(ZoneAction::Start) {
                    hit = Some(ZoneAction::Pause);
                }
            }
        }
    }
    hit
}

pub fn any_zone_hit(zones: &[StopZone], point: Point, screen: ScreenGeom) -> bool {
    zone_hit(zones, point, screen).is_some()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn top_left_corner_respects_size() {
        let z = StopZone::Corner {
            corner: ScreenCorner::TopLeft,
            size_px: 50,
            width_px: 0,
            height_px: 0,
            color: String::new(),
        };
        let scr = ScreenGeom::from_size(1920, 1080);
        assert!(z.contains(Point { x: 40, y: 40 }, scr));
        assert!(!z.contains(Point { x: 60, y: 60 }, scr));
    }

    #[test]
    fn top_left_corner_independent_width_height() {
        let z = StopZone::Corner {
            corner: ScreenCorner::TopLeft,
            size_px: 80,
            width_px: 120,
            height_px: 40,
            color: "#7c5cbf".into(),
        };
        let scr = ScreenGeom::from_size(1920, 1080);
        assert!(z.contains(Point { x: 100, y: 20 }, scr));
        assert!(!z.contains(Point { x: 50, y: 50 }, scr));
        let band = z.overlay_band(scr);
        assert_eq!(band.w, 120);
        assert_eq!(band.h, 40);
        assert_eq!(band.fill, parse_hex_fill("#7c5cbf", CORNER_FILL));
    }

    #[test]
    fn custom_pause_action() {
        let z = StopZone::Custom {
            id: "z1".into(),
            x: 10,
            y: 10,
            width: 20,
            height: 20,
            action: ZoneAction::Pause,
            kind: ZoneKind::Safety,
            color: String::new(),
            click_mode: ClickSampleMode::Random,
        };
        let scr = ScreenGeom::from_size(800, 600);
        assert_eq!(
            zone_hit(&[z], Point { x: 15, y: 15 }, scr),
            Some(ZoneAction::Pause)
        );
    }

    #[test]
    fn left_edge_hits() {
        let z = StopZone::Edge {
            edge: ScreenEdge::Left,
            margin_px: 40,
        };
        let scr = ScreenGeom::from_size(1920, 1080);
        assert!(z.contains(Point { x: 20, y: 500 }, scr));
        assert!(!z.contains(Point { x: 50, y: 500 }, scr));
    }

    #[test]
    fn overlay_band_matches_hit_rect() {
        let scr = ScreenGeom {
            x: 1920,
            y: 0,
            w: 1920,
            h: 1080,
        };
        let left = StopZone::Edge {
            edge: ScreenEdge::Left,
            margin_px: 960,
        };
        let band = left.overlay_band(scr);
        assert_eq!(band.x, 1920);
        assert_eq!(band.y, 0);
        assert_eq!(band.w, 960);
        assert_eq!(band.h, 1080);
        assert!(left.contains(Point { x: 1920 + 10, y: 10 }, scr));
        assert!(!left.contains(Point { x: 1920 + 970, y: 10 }, scr));
    }

    #[test]
    fn frontend_corner_and_edge_json_deserializes() {
        let corner: StopZone = serde_json::from_str(
            r#"{"type":"corner","corner":"topLeft","sizePx":80}"#,
        )
        .unwrap();
        let edge: StopZone = serde_json::from_str(
            r#"{"type":"edge","edge":"left","marginPx":960}"#,
        )
        .unwrap();
        let custom: StopZone = serde_json::from_str(
            r#"{"type":"custom","id":"z1","x":10,"y":20,"width":30,"height":40,"action":"stop"}"#,
        )
        .unwrap();
        let scr = ScreenGeom::from_size(1920, 1080);
        assert_eq!(corner.overlay_band(scr).w, 80);
        assert_eq!(corner.overlay_band(scr).h, 80);
        let rect: StopZone = serde_json::from_str(
            r##"{"type":"corner","corner":"topLeft","widthPx":120,"heightPx":40,"color":"#7c5cbf"}"##,
        )
        .unwrap();
        let b = rect.overlay_band(scr);
        assert_eq!(b.w, 120);
        assert_eq!(b.h, 40);
        assert_eq!(edge.overlay_band(scr).w, 960);
        assert_eq!(custom.overlay_band(scr).h, 40);
        match custom {
            StopZone::Custom { kind, .. } => assert_eq!(kind, ZoneKind::Safety),
            _ => panic!("expected custom"),
        }
        let click: StopZone = serde_json::from_str(
            r#"{"type":"custom","id":"z2","x":10,"y":20,"width":30,"height":40,"kind":"click"}"#,
        )
        .unwrap();
        assert!(click.click_rect().is_some());
        assert_eq!(
            zone_hit(&[click], Point { x: 15, y: 25 }, scr),
            None
        );
    }

    #[test]
    fn click_zone_ignored_by_hit() {
        let z = StopZone::Custom {
            id: "c1".into(),
            x: 10,
            y: 10,
            width: 20,
            height: 20,
            action: ZoneAction::Stop,
            kind: ZoneKind::Click,
            color: String::new(),
            click_mode: ClickSampleMode::Random,
        };
        let scr = ScreenGeom::from_size(800, 600);
        assert!(z.contains(Point { x: 15, y: 15 }, scr));
        assert_eq!(zone_hit(&[z.clone()], Point { x: 15, y: 15 }, scr), None);
        assert_eq!(z.click_rect(), Some((10, 10, 20, 20)));
    }

    #[test]
    fn start_zone_overrides_pause() {
        let pause = StopZone::Custom {
            id: "p".into(),
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            action: ZoneAction::Pause,
            kind: ZoneKind::Safety,
            color: String::new(),
            click_mode: ClickSampleMode::Random,
        };
        let start = StopZone::Custom {
            id: "s".into(),
            x: 50,
            y: 50,
            width: 20,
            height: 20,
            action: ZoneAction::Start,
            kind: ZoneKind::Safety,
            color: String::new(),
            click_mode: ClickSampleMode::Random,
        };
        let scr = ScreenGeom::from_size(800, 600);
        assert_eq!(
            zone_hit(&[pause, start], Point { x: 60, y: 60 }, scr),
            Some(ZoneAction::Start)
        );
    }
}
