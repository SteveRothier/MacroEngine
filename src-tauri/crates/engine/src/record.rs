//! Input recording via low-level mouse + keyboard hooks (Windows).

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use crate::event_bus::{EngineEvent, EventBus, LogLevel};
use crate::hotkeys::HotkeyBindings;
use crate::input::INJECT_EXTRA_INFO;
use crate::schema::{ActionNode, KeyMods};

use serde::{Deserialize, Serialize};

#[cfg(windows)]
use windows::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
#[cfg(windows)]
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, PeekMessageW, SetWindowsHookExW, TranslateMessage,
    UnhookWindowsHookEx, KBDLLHOOKSTRUCT, MSLLHOOKSTRUCT, MSG, PM_REMOVE, WH_KEYBOARD_LL,
    WH_MOUSE_LL, WM_KEYDOWN, WM_KEYUP, WM_LBUTTONDOWN, WM_LBUTTONUP, WM_MBUTTONDOWN, WM_MBUTTONUP,
    WM_MOUSEMOVE, WM_MOUSEWHEEL, WM_QUIT, WM_RBUTTONDOWN, WM_RBUTTONUP, WM_SYSKEYDOWN, WM_SYSKEYUP,
};

struct RecordShared {
    actions: Mutex<Vec<ActionNode>>,
    last_event: Mutex<Instant>,
    stop: AtomicBool,
    paused: AtomicBool,
    mouse_only: bool,
    keyboard_only: bool,
    bindings: HotkeyBindings,
    skip_vks: Vec<u16>,
    gesture: Mutex<GestureRecorder>,
    keys: Mutex<KeyGestureRecorder>,
    mods: Mutex<KeyMods>,
    bus: Arc<EventBus>,
    id_counter: Mutex<u64>,
}

/// Capture filter for a recording session.
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RecordOptions {
    #[serde(default)]
    pub mouse_only: bool,
    #[serde(default)]
    pub keyboard_only: bool,
}

/// Heuristics applied when a session ends.
#[derive(Debug, Clone, Copy)]
pub struct RecordPostProcess {
    pub merge_delay_below_ms: u64,
    pub simplify_move_px: i32,
}

impl Default for RecordPostProcess {
    fn default() -> Self {
        Self {
            merge_delay_below_ms: 30,
            simplify_move_px: MOVE_PX,
        }
    }
}

const MOVE_PX: i32 = 8;
const CLICK_MS: u128 = 400;

#[derive(Debug, Clone)]
enum MouseRec {
    Click { button: String, x: i32, y: i32 },
    Down { button: String, x: i32, y: i32 },
    Move { x: i32, y: i32 },
    Up { button: String, x: i32, y: i32 },
}

struct ActivePress {
    button: String,
    x: i32,
    y: i32,
    at: Instant,
    flushed_down: bool,
    last_x: i32,
    last_y: i32,
}

struct GestureRecorder {
    press: Option<ActivePress>,
}

impl GestureRecorder {
    fn new() -> Self {
        Self { press: None }
    }

    fn on_down(&mut self, button: &str, x: i32, y: i32, now: Instant) -> Vec<MouseRec> {
        let mut out = Vec::new();
        if self.press.is_some() {
            out.extend(self.on_up(button, x, y, now));
        }
        self.press = Some(ActivePress {
            button: button.to_string(),
            x,
            y,
            at: now,
            flushed_down: false,
            last_x: x,
            last_y: y,
        });
        out
    }

    fn on_move(&mut self, x: i32, y: i32) -> Vec<MouseRec> {
        let Some(press) = self.press.as_mut() else {
            return Vec::new();
        };
        let dx = (x - press.last_x).abs();
        let dy = (y - press.last_y).abs();
        if dx < MOVE_PX && dy < MOVE_PX {
            return Vec::new();
        }
        let mut out = Vec::new();
        if !press.flushed_down {
            out.push(MouseRec::Down {
                button: press.button.clone(),
                x: press.x,
                y: press.y,
            });
            press.flushed_down = true;
        }
        press.last_x = x;
        press.last_y = y;
        out.push(MouseRec::Move { x, y });
        out
    }

    fn on_up(&mut self, button: &str, x: i32, y: i32, now: Instant) -> Vec<MouseRec> {
        let Some(press) = self.press.take() else {
            return vec![MouseRec::Up {
                button: button.to_string(),
                x,
                y,
            }];
        };
        if press.button != button {
            self.press = Some(press);
            return vec![MouseRec::Up {
                button: button.to_string(),
                x,
                y,
            }];
        }
        let held = now.saturating_duration_since(press.at).as_millis();
        let dx = (x - press.x).abs();
        let dy = (y - press.y).abs();
        if !press.flushed_down && held <= CLICK_MS && dx < MOVE_PX && dy < MOVE_PX {
            return vec![MouseRec::Click {
                button: press.button,
                x: press.x,
                y: press.y,
            }];
        }
        let mut out = Vec::new();
        if !press.flushed_down {
            out.push(MouseRec::Down {
                button: press.button.clone(),
                x: press.x,
                y: press.y,
            });
        }
        if (x - press.last_x).abs() >= MOVE_PX || (y - press.last_y).abs() >= MOVE_PX {
            out.push(MouseRec::Move { x, y });
        }
        out.push(MouseRec::Up {
            button: press.button,
            x,
            y,
        });
        out
    }
}

fn mouse_rec_to_action(id: String, rec: MouseRec) -> ActionNode {
    match rec {
        MouseRec::Click { button, x, y } => ActionNode::MouseClick {
            id,
            button,
            x: Some(x),
            y: Some(y),
        },
        MouseRec::Down { button, x, y } => ActionNode::MouseDown {
            id,
            button,
            x: Some(x),
            y: Some(y),
        },
        MouseRec::Move { x, y } => ActionNode::MouseMove { id, x, y },
        MouseRec::Up { button, x, y } => ActionNode::MouseUp {
            id,
            button,
            x: Some(x),
            y: Some(y),
        },
    }
}

const KEY_TAP_MS: u128 = 400;

#[derive(Debug, Clone)]
enum KeyRec {
    Tap { key: String, mods: KeyMods },
    Down { key: String, mods: KeyMods },
    Up { key: String, mods: KeyMods },
}

struct ActiveKey {
    key: String,
    mods: KeyMods,
    at: Instant,
    flushed_down: bool,
}

struct KeyGestureRecorder {
    press: Option<ActiveKey>,
}

impl KeyGestureRecorder {
    fn new() -> Self {
        Self { press: None }
    }

    fn on_down(&mut self, key: &str, mods: KeyMods, now: Instant) -> Vec<KeyRec> {
        let mut out = Vec::new();
        if self.press.is_some() {
            out.extend(self.flush_held());
        }
        self.press = Some(ActiveKey {
            key: key.to_string(),
            mods,
            at: now,
            flushed_down: false,
        });
        out
    }

    fn on_up(&mut self, key: &str, mods: KeyMods, now: Instant) -> Vec<KeyRec> {
        let Some(press) = self.press.take() else {
            return vec![KeyRec::Up {
                key: key.to_string(),
                mods,
            }];
        };
        if press.key != key {
            self.press = Some(press);
            return vec![KeyRec::Up {
                key: key.to_string(),
                mods,
            }];
        }
        let held = now.saturating_duration_since(press.at).as_millis();
        if !press.flushed_down && held <= KEY_TAP_MS {
            return vec![KeyRec::Tap {
                key: press.key,
                mods: press.mods,
            }];
        }
        let mut out = Vec::new();
        if !press.flushed_down {
            out.push(KeyRec::Down {
                key: press.key.clone(),
                mods: press.mods,
            });
        }
        out.push(KeyRec::Up {
            key: press.key,
            mods,
        });
        out
    }

    fn flush_held(&mut self) -> Vec<KeyRec> {
        let Some(press) = self.press.take() else {
            return Vec::new();
        };
        if press.flushed_down {
            self.press = Some(press);
            return Vec::new();
        }
        let rec = KeyRec::Down {
            key: press.key.clone(),
            mods: press.mods,
        };
        self.press = Some(ActiveKey {
            flushed_down: true,
            ..press
        });
        vec![rec]
    }

    fn finish(&mut self) -> Vec<KeyRec> {
        self.flush_held()
    }
}

fn key_rec_to_action(id: String, rec: KeyRec) -> ActionNode {
    match rec {
        KeyRec::Tap { key, mods } => ActionNode::KeyTap { id, key, mods },
        KeyRec::Down { key, mods } => ActionNode::KeyDown { id, key, mods },
        KeyRec::Up { key, mods } => ActionNode::KeyUp { id, key, mods },
    }
}

fn is_modifier_vk(vk: u16) -> bool {
    matches!(vk, 0x10 | 0x11 | 0x12 | 0xA0 | 0xA1 | 0xA2 | 0xA3 | 0xA4 | 0xA5)
}

fn apply_modifier(mods: &mut KeyMods, vk: u16, down: bool) {
    match vk {
        0x11 | 0xA2 | 0xA3 => mods.ctrl = down,
        0x12 | 0xA4 | 0xA5 => mods.alt = down,
        0x10 | 0xA0 | 0xA1 => mods.shift = down,
        _ => {}
    }
}

fn vk_to_key_name(vk: u16) -> Option<String> {
    match vk {
        0x0D => Some("Enter".into()),
        0x1B => Some("Escape".into()),
        0x09 => Some("Tab".into()),
        0x20 => Some("Space".into()),
        0x08 => Some("Backspace".into()),
        0x2E => Some("Delete".into()),
        0x25 => Some("Left".into()),
        0x26 => Some("Up".into()),
        0x27 => Some("Right".into()),
        0x28 => Some("Down".into()),
        0x24 => Some("Home".into()),
        0x23 => Some("End".into()),
        0x21 => Some("PageUp".into()),
        0x22 => Some("PageDown".into()),
        0x2D => Some("Insert".into()),
        0xBA => Some(";".into()),
        0xBB => Some("=".into()),
        0xBC => Some(",".into()),
        0xBD => Some("-".into()),
        0xBE => Some(".".into()),
        0xBF => Some("/".into()),
        0xC0 => Some("`".into()),
        0xDB => Some("[".into()),
        0xDC => Some("\\".into()),
        0xDD => Some("]".into()),
        0xDE => Some("'".into()),
        0x70..=0x7B => Some(format!("F{}", vk - 0x6F)),
        c if (0x30..=0x39).contains(&c) || (0x41..=0x5A).contains(&c) => {
            Some(((c as u8) as char).to_string())
        }
        _ => None,
    }
}

fn skip_record_vk(vk: u16, bindings: &HotkeyBindings, extra: &[u16]) -> bool {
    vk == bindings.action_vk
        || vk == bindings.macro_vk
        || vk == bindings.pause_vk
        || vk == bindings.emergency_vk
        || extra.contains(&vk)
}

static RECORD_STATE: OnceLock<Mutex<Option<Arc<RecordShared>>>> = OnceLock::new();

fn record_state() -> &'static Mutex<Option<Arc<RecordShared>>> {
    RECORD_STATE.get_or_init(|| Mutex::new(None))
}

fn next_id(shared: &RecordShared) -> String {
    let mut c = shared.id_counter.lock().expect("id");
    *c += 1;
    format!("r{c}")
}

fn push_with_delay(shared: &RecordShared, action: ActionNode) {
    if shared.paused.load(Ordering::SeqCst) {
        return;
    }
    let now = Instant::now();
    let mut last = shared.last_event.lock().expect("last");
    let elapsed = now.saturating_duration_since(*last);
    *last = now;
    drop(last);

    let mut actions = shared.actions.lock().expect("actions");
    if elapsed >= Duration::from_millis(30) && !actions.is_empty() {
        let id = {
            let mut c = shared.id_counter.lock().expect("id");
            *c += 1;
            format!("r{c}")
        };
        actions.push(ActionNode::Delay {
            id,
            ms: elapsed.as_millis() as u64,
        });
    }
    actions.push(action);
    let count = actions.len();
    drop(actions);
    shared.bus.publish(EngineEvent::RecordProgress { count });
}

#[cfg(windows)]
unsafe extern "system" fn mouse_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code >= 0 {
        if let Ok(guard) = record_state().lock() {
            if let Some(shared) = guard.as_ref() {
                if shared.keyboard_only {
                    return CallNextHookEx(None, code, wparam, lparam);
                }
                let info = &*(lparam.0 as *const MSLLHOOKSTRUCT);
                if info.dwExtraInfo == INJECT_EXTRA_INFO {
                    return CallNextHookEx(None, code, wparam, lparam);
                }
                let msg = wparam.0 as u32;
                let x = info.pt.x;
                let y = info.pt.y;
                let now = Instant::now();
                let recs = {
                    let mut g = shared.gesture.lock().expect("gesture");
                    match msg {
                        WM_LBUTTONDOWN => g.on_down("left", x, y, now),
                        WM_RBUTTONDOWN => g.on_down("right", x, y, now),
                        WM_MBUTTONDOWN => g.on_down("middle", x, y, now),
                        WM_LBUTTONUP => g.on_up("left", x, y, now),
                        WM_RBUTTONUP => g.on_up("right", x, y, now),
                        WM_MBUTTONUP => g.on_up("middle", x, y, now),
                        WM_MOUSEMOVE => g.on_move(x, y),
                        WM_MOUSEWHEEL => {
                            let delta = ((info.mouseData >> 16) as i16) as i32;
                            drop(g);
                            let id = next_id(shared);
                            push_with_delay(
                                shared,
                                ActionNode::MouseWheel {
                                    id,
                                    delta,
                                    x: Some(x),
                                    y: Some(y),
                                },
                            );
                            return CallNextHookEx(None, code, wparam, lparam);
                        }
                        _ => Vec::new(),
                    }
                };
                for rec in recs {
                    let id = next_id(shared);
                    push_with_delay(shared, mouse_rec_to_action(id, rec));
                }
            }
        }
    }
    CallNextHookEx(None, code, wparam, lparam)
}

#[cfg(windows)]
unsafe extern "system" fn keyboard_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code >= 0 {
        if let Ok(guard) = record_state().lock() {
            if let Some(shared) = guard.as_ref() {
                if shared.mouse_only {
                    return CallNextHookEx(None, code, wparam, lparam);
                }
                let kb = &*(lparam.0 as *const KBDLLHOOKSTRUCT);
                if kb.dwExtraInfo == INJECT_EXTRA_INFO {
                    return CallNextHookEx(None, code, wparam, lparam);
                }
                let msg = wparam.0 as u32;
                let vk = kb.vkCode as u16;
                if skip_record_vk(vk, &shared.bindings, &shared.skip_vks) {
                    return CallNextHookEx(None, code, wparam, lparam);
                }
                let down = msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN;
                let up = msg == WM_KEYUP || msg == WM_SYSKEYUP;
                if !down && !up {
                    return CallNextHookEx(None, code, wparam, lparam);
                }
                if is_modifier_vk(vk) {
                    let mut mods = shared.mods.lock().expect("mods");
                    apply_modifier(&mut mods, vk, down);
                    return CallNextHookEx(None, code, wparam, lparam);
                }
                let Some(key) = vk_to_key_name(vk) else {
                    return CallNextHookEx(None, code, wparam, lparam);
                };
                let mods = *shared.mods.lock().expect("mods");
                let now = Instant::now();
                let recs = {
                    let mut g = shared.keys.lock().expect("keys");
                    if down {
                        g.on_down(&key, mods, now)
                    } else {
                        g.on_up(&key, mods, now)
                    }
                };
                for rec in recs {
                    let id = next_id(shared);
                    push_with_delay(shared, key_rec_to_action(id, rec));
                }
            }
        }
    }
    CallNextHookEx(None, code, wparam, lparam)
}

pub fn postprocess_actions(
    actions: Vec<ActionNode>,
    cfg: &RecordPostProcess,
) -> Vec<ActionNode> {
    let merged = merge_short_delays(actions, cfg.merge_delay_below_ms);
    simplify_moves(merged, cfg.simplify_move_px)
}

fn merge_short_delays(actions: Vec<ActionNode>, threshold_ms: u64) -> Vec<ActionNode> {
    let mut out: Vec<ActionNode> = Vec::new();
    for action in actions {
        if let ActionNode::Delay { id, ms } = &action {
            if ms <= &threshold_ms {
                if let Some(ActionNode::Delay { ms: prev, .. }) = out.last_mut() {
                    *prev = prev.saturating_add(*ms);
                    continue;
                }
            }
            out.push(ActionNode::Delay { id: id.clone(), ms: *ms });
        } else {
            out.push(action);
        }
    }
    out
}

fn simplify_moves(actions: Vec<ActionNode>, min_px: i32) -> Vec<ActionNode> {
    let mut out: Vec<ActionNode> = Vec::new();
    let mut i = 0;
    while i < actions.len() {
        let action = &actions[i];
        if let ActionNode::MouseMove { id, x, y } = action {
            let mut last_x = *x;
            let mut last_y = *y;
            let mut last_id = id.clone();
            let mut j = i + 1;
            while j < actions.len() {
                match &actions[j] {
                    ActionNode::MouseMove { x, y, id } => {
                        let dx = (*x - last_x).abs();
                        let dy = (*y - last_y).abs();
                        if dx < min_px && dy < min_px {
                            j += 1;
                            continue;
                        }
                        last_x = *x;
                        last_y = *y;
                        last_id = id.clone();
                        j += 1;
                    }
                    _ => break,
                }
            }
            out.push(ActionNode::MouseMove {
                id: last_id,
                x: last_x,
                y: last_y,
            });
            i = j;
        } else {
            out.push(action.clone());
            i += 1;
        }
    }
    out
}

pub struct RecordSession;

impl RecordSession {
    pub fn start(
        bindings: HotkeyBindings,
        bus: Arc<EventBus>,
        skip_vks: Vec<u16>,
        options: RecordOptions,
    ) -> Result<(Arc<AtomicBool>, JoinHandle<Vec<ActionNode>>), String> {
        #[cfg(not(windows))]
        {
            let _ = (bindings, bus, skip_vks, options);
            return Err("record requires Windows".into());
        }
        #[cfg(windows)]
        {
            {
                let guard = record_state().lock().expect("record");
                if guard.is_some() {
                    return Err("record already active".into());
                }
            }
            let shared = Arc::new(RecordShared {
                actions: Mutex::new(Vec::new()),
                last_event: Mutex::new(Instant::now()),
                stop: AtomicBool::new(false),
                paused: AtomicBool::new(false),
                mouse_only: options.mouse_only,
                keyboard_only: options.keyboard_only,
                bindings,
                skip_vks,
                gesture: Mutex::new(GestureRecorder::new()),
                keys: Mutex::new(KeyGestureRecorder::new()),
                mods: Mutex::new(KeyMods::default()),
                bus: Arc::clone(&bus),
                id_counter: Mutex::new(0),
            });
            *record_state().lock().expect("record") = Some(Arc::clone(&shared));
            let stop_flag = Arc::new(AtomicBool::new(false));
            let stop_c = Arc::clone(&stop_flag);
            let shared_c = Arc::clone(&shared);

            let handle = thread::spawn(move || {
                let mouse = unsafe { SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_proc), None, 0) };
                let keyboard =
                    unsafe { SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_proc), None, 0) };
                if mouse.is_err() || keyboard.is_err() {
                    shared_c.bus.publish(EngineEvent::Log {
                        level: LogLevel::Error,
                        message: "failed to install record hooks".into(),
                    });
                }
                let mut msg = MSG::default();
                while !stop_c.load(Ordering::SeqCst) && !shared_c.stop.load(Ordering::SeqCst) {
                    let has = unsafe { PeekMessageW(&mut msg, None, 0, 0, PM_REMOVE) };
                    if has.as_bool() {
                        if msg.message == WM_QUIT {
                            break;
                        }
                        unsafe {
                            let _ = TranslateMessage(&msg);
                            DispatchMessageW(&msg);
                        }
                    } else {
                        thread::sleep(Duration::from_millis(10));
                    }
                }
                if let Ok(h) = mouse {
                    unsafe {
                        let _ = UnhookWindowsHookEx(h);
                    }
                }
                if let Ok(h) = keyboard {
                    unsafe {
                        let _ = UnhookWindowsHookEx(h);
                    }
                }
                *record_state().lock().expect("record") = None;
                {
                    let leftover = shared_c.keys.lock().expect("keys").finish();
                    for rec in leftover {
                        let id = next_id(&shared_c);
                        push_with_delay(&shared_c, key_rec_to_action(id, rec));
                    }
                }
                shared_c.actions.lock().expect("actions").clone()
            });

            bus.publish(EngineEvent::Log {
                level: LogLevel::Info,
                message: "record started".into(),
            });
            Ok((stop_flag, handle))
        }
    }

    pub fn request_stop(stop: &AtomicBool) {
        stop.store(true, Ordering::SeqCst);
        if let Ok(guard) = record_state().lock() {
            if let Some(shared) = guard.as_ref() {
                shared.stop.store(true, Ordering::SeqCst);
            }
        }
    }

    pub fn pause() -> Result<(), String> {
        let guard = record_state().lock().expect("record");
        let Some(shared) = guard.as_ref() else {
            return Err("record not active".into());
        };
        shared.paused.store(true, Ordering::SeqCst);
        Ok(())
    }

    pub fn resume() -> Result<(), String> {
        let guard = record_state().lock().expect("record");
        let Some(shared) = guard.as_ref() else {
            return Err("record not active".into());
        };
        shared.paused.store(false, Ordering::SeqCst);
        *shared.last_event.lock().expect("last") = Instant::now();
        Ok(())
    }

    pub fn is_paused() -> bool {
        record_state()
            .lock()
            .ok()
            .and_then(|g| g.as_ref().map(|s| s.paused.load(Ordering::SeqCst)))
            .unwrap_or(false)
    }

    /// Current recorded action count while a session is active (0 if idle).
    pub fn action_count() -> usize {
        let Ok(guard) = record_state().lock() else {
            return 0;
        };
        guard
            .as_ref()
            .map(|shared| shared.actions.lock().map(|a| a.len()).unwrap_or(0))
            .unwrap_or(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inject_tag_constant_stable() {
        assert_eq!(INJECT_EXTRA_INFO, 0x4D45_0001);
    }

    #[test]
    fn compact_click_without_drag() {
        let mut g = GestureRecorder::new();
        let t0 = Instant::now();
        assert!(g.on_down("left", 10, 10, t0).is_empty());
        let out = g.on_up("left", 11, 10, t0 + Duration::from_millis(80));
        assert!(matches!(
            &out[..],
            [MouseRec::Click {
                button,
                x: 10,
                y: 10
            }] if button == "left"
        ));
    }

    #[test]
    fn drag_emits_down_move_up() {
        let mut g = GestureRecorder::new();
        let t0 = Instant::now();
        assert!(g.on_down("left", 0, 0, t0).is_empty());
        let mid = g.on_move(40, 0);
        assert!(matches!(&mid[0], MouseRec::Down { x: 0, y: 0, .. }));
        assert!(matches!(&mid[1], MouseRec::Move { x: 40, y: 0 }));
        let up = g.on_up("left", 40, 0, t0 + Duration::from_millis(200));
        assert!(matches!(&up[..], [MouseRec::Up { x: 40, y: 0, .. }]));
    }

    #[test]
    fn skip_dedicated_trigger_vk() {
        let b = HotkeyBindings::default();
        assert!(skip_record_vk(b.macro_vk, &b, &[]));
        assert!(skip_record_vk(0x41, &b, &[0x41]));
        assert!(!skip_record_vk(0x42, &b, &[0x41]));
    }

    #[test]
    fn compact_key_tap() {
        let mut g = KeyGestureRecorder::new();
        let t0 = Instant::now();
        assert!(g.on_down("C", KeyMods { ctrl: true, ..KeyMods::default() }, t0).is_empty());
        let out = g.on_up("C", KeyMods { ctrl: true, ..KeyMods::default() }, t0 + Duration::from_millis(50));
        assert!(matches!(
            &out[..],
            [KeyRec::Tap { key, mods }] if key == "C" && mods.ctrl
        ));
    }

    #[test]
    fn held_key_emits_down() {
        let mut g = KeyGestureRecorder::new();
        let t0 = Instant::now();
        assert!(g.on_down("A", KeyMods::default(), t0).is_empty());
        let second = g.on_down("B", KeyMods::default(), t0 + Duration::from_millis(80));
        assert!(matches!(&second[..], [KeyRec::Down { key, .. }] if key == "A"));
        let up = g.on_up("B", KeyMods::default(), t0 + Duration::from_millis(120));
        assert!(matches!(&up[..], [KeyRec::Tap { key, .. }] if key == "B"));
    }

    #[test]
    fn merge_short_delays_combines() {
        let actions = vec![
            ActionNode::Delay {
                id: "d1".into(),
                ms: 10,
            },
            ActionNode::Delay {
                id: "d2".into(),
                ms: 15,
            },
            ActionNode::KeyTap {
                id: "k".into(),
                key: "A".into(),
                mods: KeyMods::default(),
            },
        ];
        let out = merge_short_delays(actions, 30);
        assert_eq!(out.len(), 2);
        assert!(matches!(&out[0], ActionNode::Delay { ms: 25, .. }));
    }

    #[test]
    fn simplify_moves_keeps_last_in_chain() {
        let actions = vec![
            ActionNode::MouseMove {
                id: "m1".into(),
                x: 0,
                y: 0,
            },
            ActionNode::MouseMove {
                id: "m2".into(),
                x: 2,
                y: 1,
            },
            ActionNode::MouseMove {
                id: "m3".into(),
                x: 40,
                y: 0,
            },
        ];
        let out = simplify_moves(actions, 8);
        assert_eq!(out.len(), 1);
        assert!(matches!(
            &out[0],
            ActionNode::MouseMove { x: 40, y: 0, .. }
        ));
    }

    #[test]
    fn maps_punctuation_and_nav() {
        assert_eq!(vk_to_key_name(0x24).as_deref(), Some("Home"));
        assert_eq!(vk_to_key_name(0xBA).as_deref(), Some(";"));
        assert_eq!(vk_to_key_name(0x11), None);
    }
}
