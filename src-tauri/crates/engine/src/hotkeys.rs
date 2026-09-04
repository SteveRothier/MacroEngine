//! Global hotkeys (Win32 low-level keyboard hook).
//!
//! Emergency stop is handled entirely in Rust — never routed through React.
//! Bound keys are eaten so WebView2 does not see them (e.g. caret browsing).
//! Action hotkey supports modifier chords (Ctrl/Alt/Shift + VK).

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use crate::input::INJECT_EXTRA_INFO;
use crate::schema::KeyMods;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[cfg(windows)]
use windows::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
#[cfg(windows)]
use windows::Win32::UI::Input::KeyboardAndMouse::{VK_F6, VK_F8, VK_F9};
#[cfg(windows)]
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, PeekMessageW, SetWindowsHookExW, TranslateMessage,
    UnhookWindowsHookEx, KBDLLHOOKSTRUCT, MSG, PM_REMOVE, WH_KEYBOARD_LL, WM_KEYDOWN, WM_KEYUP,
    WM_QUIT, WM_SYSKEYDOWN, WM_SYSKEYUP,
};

const VK_CONTROL: u16 = 0x11;
const VK_LCONTROL: u16 = 0xA2;
const VK_RCONTROL: u16 = 0xA3;
const VK_MENU: u16 = 0x12; // Alt
const VK_LMENU: u16 = 0xA4;
const VK_RMENU: u16 = 0xA5;
const VK_SHIFT: u16 = 0x10;
const VK_LSHIFT: u16 = 0xA0;
const VK_RSHIFT: u16 = 0xA1;

/// LLKHF_INJECTED — key event came from SendInput / another process injection.
#[cfg(windows)]
const LLKHF_INJECTED: u32 = 0x0000_0010;

/// Virtual-key codes used by M2-B defaults (F6 / F9 / F8).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HotkeyBindings {
    /// Clicker toggle / hold (F6 by default).
    pub action_vk: u16,
    #[serde(default)]
    pub action_ctrl: bool,
    #[serde(default)]
    pub action_alt: bool,
    #[serde(default)]
    pub action_shift: bool,
    /// Macro play/stop toggle (F9 — avoids WebView F7 caret browsing for that role).
    pub macro_vk: u16,
    /// Clicker session pause / resume (F7 by default).
    #[serde(default = "default_pause_vk")]
    pub pause_vk: u16,
    /// Immediate emergency cancel (F8).
    pub emergency_vk: u16,
}

fn default_pause_vk() -> u16 {
    0x76 // VK_F7
}

impl Default for HotkeyBindings {
    fn default() -> Self {
        Self {
            action_vk: 0x75, // VK_F6
            action_ctrl: false,
            action_alt: false,
            action_shift: false,
            macro_vk: 0x78,     // VK_F9
            pause_vk: 0x76,     // VK_F7
            emergency_vk: 0x77, // VK_F8
        }
    }
}

impl HotkeyBindings {
    pub fn f6_f9_f8() -> Self {
        #[cfg(windows)]
        {
            Self {
                action_vk: VK_F6.0,
                action_ctrl: false,
                action_alt: false,
                action_shift: false,
                macro_vk: VK_F9.0,
                pause_vk: 0x76, // F7
                emergency_vk: VK_F8.0,
            }
        }
        #[cfg(not(windows))]
        {
            Self::default()
        }
    }

    pub fn action_matches(&self, vk: u16, ctrl: bool, alt: bool, shift: bool) -> bool {
        vk == self.action_vk
            && ctrl == self.action_ctrl
            && alt == self.action_alt
            && shift == self.action_shift
    }
}

/// Per-macro hotkey binding (VK + modifier chord).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct TriggerBinding {
    pub vk: u16,
    pub ctrl: bool,
    pub alt: bool,
    pub shift: bool,
}

impl TriggerBinding {
    pub fn from_mods(vk: u16, mods: KeyMods) -> Self {
        Self {
            vk,
            ctrl: mods.ctrl,
            alt: mods.alt,
            shift: mods.shift,
        }
    }

    pub fn matches(&self, vk: u16, ctrl: bool, alt: bool, shift: bool) -> bool {
        self.vk == vk && self.ctrl == ctrl && self.alt == alt && self.shift == shift
    }
}

pub struct HotkeyCallbacks {
    pub on_action_down: Box<dyn Fn() + Send + Sync>,
    pub on_action_up: Box<dyn Fn() + Send + Sync>,
    pub on_macro_down: Box<dyn Fn() + Send + Sync>,
    pub on_named_macro: Box<dyn Fn(String) + Send + Sync>,
    pub on_named_clicker: Box<dyn Fn(String) + Send + Sync>,
    pub on_clicker_pause: Box<dyn Fn() + Send + Sync>,
    pub on_emergency: Box<dyn Fn() + Send + Sync>,
}

struct HookShared {
    bindings: Mutex<HotkeyBindings>,
    callbacks: HotkeyCallbacks,
    /// Chord → macro library name for per-macro triggers.
    triggers: Mutex<HashMap<TriggerBinding, String>>,
    /// Chord → clicker preset name for per-preset triggers.
    clicker_triggers: Mutex<HashMap<TriggerBinding, String>>,
    action_down: AtomicBool,
    macro_down: AtomicBool,
    named_down: Mutex<HashSet<TriggerBinding>>,
    ctrl_down: AtomicBool,
    alt_down: AtomicBool,
    shift_down: AtomicBool,
}

static HOOK_STATE: OnceLock<Mutex<Option<Arc<HookShared>>>> = OnceLock::new();

fn hook_state() -> &'static Mutex<Option<Arc<HookShared>>> {
    HOOK_STATE.get_or_init(|| Mutex::new(None))
}

/// Live-update bindings without reinstalling the hook.
pub fn update_live_bindings(bindings: HotkeyBindings) {
    if let Ok(guard) = hook_state().lock() {
        if let Some(shared) = guard.as_ref() {
            *shared.bindings.lock().expect("bindings") = bindings;
        }
    }
}

/// Live-update per-macro trigger index.
pub fn update_live_macro_triggers(triggers: HashMap<TriggerBinding, String>) {
    if let Ok(guard) = hook_state().lock() {
        if let Some(shared) = guard.as_ref() {
            *shared.triggers.lock().expect("triggers") = triggers;
        }
    }
}

/// Live-update per-clicker-preset trigger index.
pub fn update_live_clicker_triggers(triggers: HashMap<TriggerBinding, String>) {
    if let Ok(guard) = hook_state().lock() {
        if let Some(shared) = guard.as_ref() {
            *shared.clicker_triggers.lock().expect("clicker triggers") = triggers;
        }
    }
}

fn is_modifier_vk(vk: u16) -> bool {
    matches!(
        vk,
        VK_CONTROL
            | VK_LCONTROL
            | VK_RCONTROL
            | VK_MENU
            | VK_LMENU
            | VK_RMENU
            | VK_SHIFT
            | VK_LSHIFT
            | VK_RSHIFT
    )
}

fn update_modifier_state(shared: &HookShared, vk: u16, is_down: bool) {
    match vk {
        VK_CONTROL | VK_LCONTROL | VK_RCONTROL => {
            shared.ctrl_down.store(is_down, Ordering::SeqCst);
        }
        VK_MENU | VK_LMENU | VK_RMENU => {
            shared.alt_down.store(is_down, Ordering::SeqCst);
        }
        VK_SHIFT | VK_LSHIFT | VK_RSHIFT => {
            shared.shift_down.store(is_down, Ordering::SeqCst);
        }
        _ => {}
    }
}

#[cfg(windows)]
unsafe extern "system" fn low_level_keyboard_proc(
    code: i32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    if code >= 0 {
        let kb = &*(lparam.0 as *const KBDLLHOOKSTRUCT);
        // Ignore keys we inject during macro/clicker playback (avoids F8/F9 feedback loops).
        let injected = (kb.flags.0 & LLKHF_INJECTED) != 0
            || kb.dwExtraInfo == INJECT_EXTRA_INFO;
        if injected {
            return CallNextHookEx(None, code, wparam, lparam);
        }
        let vk = kb.vkCode as u16;
        let msg = wparam.0 as u32;
        if let Ok(guard) = hook_state().lock() {
            if let Some(shared) = guard.as_ref() {
                let is_down = msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN;
                let is_up = msg == WM_KEYUP || msg == WM_SYSKEYUP;
                if is_down || is_up {
                    update_modifier_state(shared, vk, is_down);
                }
                let bindings = *shared.bindings.lock().expect("bindings");
                let ctrl = shared.ctrl_down.load(Ordering::SeqCst);
                let alt = shared.alt_down.load(Ordering::SeqCst);
                let shift = shared.shift_down.load(Ordering::SeqCst);
                let mut handled = false;
                if vk == bindings.emergency_vk && is_down {
                    (shared.callbacks.on_emergency)();
                    handled = true;
                } else {
                    let binding = TriggerBinding {
                        vk,
                        ctrl,
                        alt,
                        shift,
                    };
                    let macro_name = shared
                        .triggers
                        .lock()
                        .expect("triggers")
                        .get(&binding)
                        .cloned();
                    let clicker_name = shared
                        .clicker_triggers
                        .lock()
                        .expect("clicker triggers")
                        .get(&binding)
                        .cloned();
                    if let Some(name) = macro_name {
                        if is_down {
                            let mut named = shared.named_down.lock().expect("named");
                            if named.insert(binding) {
                                drop(named);
                                (shared.callbacks.on_named_macro)(name);
                            }
                        } else if is_up {
                            shared.named_down.lock().expect("named").remove(&binding);
                        }
                        handled = true;
                    } else if let Some(name) = clicker_name {
                        if is_down {
                            let mut named = shared.named_down.lock().expect("named");
                            if named.insert(binding) {
                                drop(named);
                                (shared.callbacks.on_named_clicker)(name);
                            }
                        } else if is_up {
                            shared.named_down.lock().expect("named").remove(&binding);
                        }
                        handled = true;
                    } else if vk == bindings.macro_vk {
                        if is_down {
                            if !shared.macro_down.swap(true, Ordering::SeqCst) {
                                (shared.callbacks.on_macro_down)();
                            }
                            handled = true;
                        } else if is_up {
                            shared.macro_down.store(false, Ordering::SeqCst);
                            handled = true;
                        }
                    } else if vk == bindings.pause_vk {
                        if is_down {
                            (shared.callbacks.on_clicker_pause)();
                            handled = true;
                        } else if is_up {
                            handled = true;
                        }
                    } else if !is_modifier_vk(vk)
                        && bindings.action_matches(vk, ctrl, alt, shift)
                    {
                        if is_down {
                            if !shared.action_down.swap(true, Ordering::SeqCst) {
                                (shared.callbacks.on_action_down)();
                            }
                            handled = true;
                        } else if is_up {
                            if shared.action_down.swap(false, Ordering::SeqCst) {
                                (shared.callbacks.on_action_up)();
                            }
                            handled = true;
                        }
                    } else if vk == bindings.action_vk && is_up {
                        // Release action even if modifiers changed before key-up.
                        if shared.action_down.swap(false, Ordering::SeqCst) {
                            (shared.callbacks.on_action_up)();
                            handled = true;
                        }
                    }
                }
                if handled {
                    return LRESULT(1);
                }
            }
        }
    }
    CallNextHookEx(None, code, wparam, lparam)
}

pub struct HotkeyHook;

impl HotkeyHook {
    pub fn start(
        bindings: HotkeyBindings,
        callbacks: HotkeyCallbacks,
        stop: Arc<AtomicBool>,
    ) -> Result<JoinHandle<()>, String> {
        #[cfg(not(windows))]
        {
            let _ = (bindings, callbacks, stop);
            Err("hotkeys require Windows".into())
        }
        #[cfg(windows)]
        {
            let shared = Arc::new(HookShared {
                bindings: Mutex::new(bindings),
                callbacks,
                triggers: Mutex::new(HashMap::new()),
                clicker_triggers: Mutex::new(HashMap::new()),
                action_down: AtomicBool::new(false),
                macro_down: AtomicBool::new(false),
                named_down: Mutex::new(HashSet::new()),
                ctrl_down: AtomicBool::new(false),
                alt_down: AtomicBool::new(false),
                shift_down: AtomicBool::new(false),
            });
            *hook_state().lock().expect("hook state") = Some(Arc::clone(&shared));

            Ok(thread::spawn(move || {
                let hook = unsafe {
                    SetWindowsHookExW(WH_KEYBOARD_LL, Some(low_level_keyboard_proc), None, 0)
                };
                match hook {
                    Ok(h) => {
                        let mut msg = MSG::default();
                        while !stop.load(Ordering::SeqCst) {
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
                        unsafe {
                            let _ = UnhookWindowsHookEx(h);
                        }
                    }
                    Err(e) => {
                        eprintln!("failed to install keyboard hook: {e}");
                    }
                }
                *hook_state().lock().expect("hook state") = None;
            }))
        }
    }
}

pub fn default_bindings() -> HotkeyBindings {
    HotkeyBindings::f6_f9_f8()
}

#[cfg(test)]
pub fn install_test_callbacks(callbacks: HotkeyCallbacks, bindings: HotkeyBindings) {
    *hook_state().lock().unwrap() = Some(Arc::new(HookShared {
        bindings: Mutex::new(bindings),
        callbacks,
        triggers: Mutex::new(HashMap::new()),
        clicker_triggers: Mutex::new(HashMap::new()),
        action_down: AtomicBool::new(false),
        macro_down: AtomicBool::new(false),
        named_down: Mutex::new(HashSet::new()),
        ctrl_down: AtomicBool::new(false),
        alt_down: AtomicBool::new(false),
        shift_down: AtomicBool::new(false),
    }));
}

#[cfg(test)]
pub fn simulate_key(vk: u16, down: bool) {
    simulate_key_with_mods(vk, down, false, false, false);
}

#[cfg(test)]
pub fn simulate_key_with_mods(vk: u16, down: bool, ctrl: bool, alt: bool, shift: bool) {
    let guard = hook_state().lock().unwrap();
    let shared = guard.as_ref().expect("test callbacks");
    shared.ctrl_down.store(ctrl, Ordering::SeqCst);
    shared.alt_down.store(alt, Ordering::SeqCst);
    shared.shift_down.store(shift, Ordering::SeqCst);
    let bindings = *shared.bindings.lock().unwrap();
    if vk == bindings.emergency_vk && down {
        (shared.callbacks.on_emergency)();
        return;
    }
    if vk == bindings.macro_vk {
        if down {
            if !shared.macro_down.swap(true, Ordering::SeqCst) {
                (shared.callbacks.on_macro_down)();
            }
        } else {
            shared.macro_down.store(false, Ordering::SeqCst);
        }
        return;
    }
    if bindings.action_matches(vk, ctrl, alt, shift) {
        if down {
            if !shared.action_down.swap(true, Ordering::SeqCst) {
                (shared.callbacks.on_action_down)();
            }
        } else {
            shared.action_down.store(false, Ordering::SeqCst);
            (shared.callbacks.on_action_up)();
        }
    }
}

#[cfg(test)]
pub fn clear_test_callbacks() {
    *hook_state().lock().unwrap() = None;
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicUsize;

    #[test]
    fn default_macro_is_f9() {
        assert_eq!(HotkeyBindings::default().macro_vk, 0x78);
    }

    #[test]
    fn emergency_fires_on_key() {
        let n = Arc::new(AtomicUsize::new(0));
        let n2 = Arc::clone(&n);
        install_test_callbacks(
            HotkeyCallbacks {
                on_action_down: Box::new(|| {}),
                on_action_up: Box::new(|| {}),
                on_macro_down: Box::new(|| {}),
                on_named_macro: Box::new(|_| {}),
                on_named_clicker: Box::new(|_| {}),
                on_clicker_pause: Box::new(|| {}),
                on_emergency: Box::new(move || {
                    n2.fetch_add(1, Ordering::SeqCst);
                }),
            },
            HotkeyBindings::default(),
        );
        simulate_key(0x77, true);
        assert_eq!(n.load(Ordering::SeqCst), 1);
        clear_test_callbacks();
    }

    #[test]
    fn macro_key_f9_fires_once() {
        let n = Arc::new(AtomicUsize::new(0));
        let n2 = Arc::clone(&n);
        install_test_callbacks(
            HotkeyCallbacks {
                on_action_down: Box::new(|| {}),
                on_action_up: Box::new(|| {}),
                on_macro_down: Box::new(move || {
                    n2.fetch_add(1, Ordering::SeqCst);
                }),
                on_named_macro: Box::new(|_| {}),
                on_named_clicker: Box::new(|_| {}),
                on_clicker_pause: Box::new(|| {}),
                on_emergency: Box::new(|| {}),
            },
            HotkeyBindings::default(),
        );
        simulate_key(0x78, true);
        simulate_key(0x78, true);
        assert_eq!(n.load(Ordering::SeqCst), 1);
        clear_test_callbacks();
    }

    #[test]
    fn action_chord_requires_ctrl() {
        let n = Arc::new(AtomicUsize::new(0));
        let n2 = Arc::clone(&n);
        let mut b = HotkeyBindings::default();
        b.action_vk = 0x59; // Y
        b.action_ctrl = true;
        install_test_callbacks(
            HotkeyCallbacks {
                on_action_down: Box::new(move || {
                    n2.fetch_add(1, Ordering::SeqCst);
                }),
                on_action_up: Box::new(|| {}),
                on_macro_down: Box::new(|| {}),
                on_named_macro: Box::new(|_| {}),
                on_named_clicker: Box::new(|_| {}),
                on_clicker_pause: Box::new(|| {}),
                on_emergency: Box::new(|| {}),
            },
            b,
        );
        simulate_key_with_mods(0x59, true, false, false, false);
        assert_eq!(n.load(Ordering::SeqCst), 0);
        simulate_key_with_mods(0x59, true, true, false, false);
        assert_eq!(n.load(Ordering::SeqCst), 1);
        clear_test_callbacks();
    }
}
