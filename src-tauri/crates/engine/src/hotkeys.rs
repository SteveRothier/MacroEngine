//! Global hotkeys (Win32 low-level keyboard hook).
//!
//! Emergency stop is handled entirely in Rust — never routed through React.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use serde::{Deserialize, Serialize};

#[cfg(windows)]
use windows::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
#[cfg(windows)]
use windows::Win32::UI::Input::KeyboardAndMouse::{VK_F6, VK_F8};
#[cfg(windows)]
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, PeekMessageW, SetWindowsHookExW, TranslateMessage,
    UnhookWindowsHookEx, KBDLLHOOKSTRUCT, MSG, PM_REMOVE, WH_KEYBOARD_LL, WM_KEYDOWN,
    WM_KEYUP, WM_QUIT, WM_SYSKEYDOWN, WM_SYSKEYUP,
};

/// Virtual-key codes used by M1-A defaults.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HotkeyBindings {
    /// Toggle start/stop (or hold key in Hold mode).
    pub action_vk: u16,
    /// Immediate emergency cancel.
    pub emergency_vk: u16,
}

impl Default for HotkeyBindings {
    fn default() -> Self {
        Self {
            action_vk: 0x75,    // VK_F6
            emergency_vk: 0x77, // VK_F8
        }
    }
}

impl HotkeyBindings {
    pub fn f6_f8() -> Self {
        #[cfg(windows)]
        {
            Self {
                action_vk: VK_F6.0,
                emergency_vk: VK_F8.0,
            }
        }
        #[cfg(not(windows))]
        {
            Self::default()
        }
    }
}

/// Callbacks invoked from the hook thread.
pub struct HotkeyCallbacks {
    pub on_action_down: Box<dyn Fn() + Send + Sync>,
    pub on_action_up: Box<dyn Fn() + Send + Sync>,
    pub on_emergency: Box<dyn Fn() + Send + Sync>,
}

struct HookShared {
    bindings: HotkeyBindings,
    callbacks: HotkeyCallbacks,
    /// Ignore key-repeat for action key.
    action_down: AtomicBool,
}

static HOOK_STATE: OnceLock<Mutex<Option<Arc<HookShared>>>> = OnceLock::new();

fn hook_state() -> &'static Mutex<Option<Arc<HookShared>>> {
    HOOK_STATE.get_or_init(|| Mutex::new(None))
}

#[cfg(windows)]
unsafe extern "system" fn low_level_keyboard_proc(
    code: i32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    if code >= 0 {
        let kb = &*(lparam.0 as *const KBDLLHOOKSTRUCT);
        let vk = kb.vkCode as u16;
        let msg = wparam.0 as u32;
        if let Ok(guard) = hook_state().lock() {
            if let Some(shared) = guard.as_ref() {
                let is_down = msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN;
                let is_up = msg == WM_KEYUP || msg == WM_SYSKEYUP;
                if vk == shared.bindings.emergency_vk && is_down {
                    (shared.callbacks.on_emergency)();
                } else if vk == shared.bindings.action_vk {
                    if is_down {
                        if !shared.action_down.swap(true, Ordering::SeqCst) {
                            (shared.callbacks.on_action_down)();
                        }
                    } else if is_up {
                        shared.action_down.store(false, Ordering::SeqCst);
                        (shared.callbacks.on_action_up)();
                    }
                }
            }
        }
    }
    CallNextHookEx(None, code, wparam, lparam)
}

/// Runs the keyboard hook message loop until `stop` is set.
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
                bindings,
                callbacks,
                action_down: AtomicBool::new(false),
            });
            *hook_state().lock().expect("hook state") = Some(Arc::clone(&shared));

            Ok(thread::spawn(move || {
                // SAFETY: installing a process-wide WH_KEYBOARD_LL hook.
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

/// Helper used by AppState: virtual-key defaults.
pub fn default_bindings() -> HotkeyBindings {
    HotkeyBindings::f6_f8()
}

/// Test-only: simulate key events against shared callbacks without Win32.
#[cfg(test)]
pub fn install_test_callbacks(callbacks: HotkeyCallbacks, bindings: HotkeyBindings) {
    *hook_state().lock().unwrap() = Some(Arc::new(HookShared {
        bindings,
        callbacks,
        action_down: AtomicBool::new(false),
    }));
}

#[cfg(test)]
pub fn simulate_key(vk: u16, down: bool) {
    let guard = hook_state().lock().unwrap();
    let shared = guard.as_ref().expect("test callbacks");
    if vk == shared.bindings.emergency_vk && down {
        (shared.callbacks.on_emergency)();
        return;
    }
    if vk == shared.bindings.action_vk {
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
    fn emergency_fires_on_key() {
        let n = Arc::new(AtomicUsize::new(0));
        let n2 = Arc::clone(&n);
        install_test_callbacks(
            HotkeyCallbacks {
                on_action_down: Box::new(|| {}),
                on_action_up: Box::new(|| {}),
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
    fn action_ignores_key_repeat() {
        let downs = Arc::new(AtomicUsize::new(0));
        let ups = Arc::new(AtomicUsize::new(0));
        let d2 = Arc::clone(&downs);
        let u2 = Arc::clone(&ups);
        install_test_callbacks(
            HotkeyCallbacks {
                on_action_down: Box::new(move || {
                    d2.fetch_add(1, Ordering::SeqCst);
                }),
                on_action_up: Box::new(move || {
                    u2.fetch_add(1, Ordering::SeqCst);
                }),
                on_emergency: Box::new(|| {}),
            },
            HotkeyBindings::default(),
        );
        simulate_key(0x75, true);
        simulate_key(0x75, true); // repeat
        simulate_key(0x75, false);
        assert_eq!(downs.load(Ordering::SeqCst), 1);
        assert_eq!(ups.load(Ordering::SeqCst), 1);
        clear_test_callbacks();
    }
}
