/** Boot splash helpers — no artificial minimum delay (show-when-ready only). */

declare global {
  interface Window {
    __CASTER_BOOT_T0__?: number;
  }
}

const FADE_MS = 200;
const MAX_MS = 5000;

let dismissed = false;
let maxTimer: number | null = null;

function splashEl(): HTMLElement | null {
  return document.getElementById("boot-splash");
}

function finishDismiss(el: HTMLElement): void {
  if (dismissed) return;
  dismissed = true;
  if (maxTimer != null) {
    window.clearTimeout(maxTimer);
    maxTimer = null;
  }
  void el.offsetWidth;
  el.classList.add("is-out");
  el.style.pointerEvents = "none";
  window.setTimeout(() => {
    el.remove();
  }, FADE_MS);
}

/** Instant remove (overlay / picker / zones windows, or no splash markup). */
export function removeBootSplashImmediate(): void {
  if (dismissed) return;
  dismissed = true;
  if (maxTimer != null) {
    window.clearTimeout(maxTimer);
    maxTimer = null;
  }
  splashEl()?.remove();
}

/** Fade out splash if present; no-op when `#boot-splash` is absent. */
export function dismissBootSplash(): void {
  if (dismissed) return;
  const el = splashEl();
  if (!el) {
    dismissed = true;
    return;
  }
  finishDismiss(el);
}

/** Optional logo entrance when `#boot-splash-logo` exists (no min hold). */
export function startBootSplashEntrance(): void {
  const logo = document.getElementById("boot-splash-logo");
  if (!logo) return;
  requestAnimationFrame(() => {
    logo.classList.add("is-in");
  });
}

/** Arm max timeout so a stuck boot cannot leave a splash forever. */
export function armBootSplashMaxTimeout(): void {
  if (maxTimer != null || dismissed) return;
  if (!splashEl()) return;
  maxTimer = window.setTimeout(() => {
    maxTimer = null;
    dismissBootSplash();
  }, MAX_MS);
}
