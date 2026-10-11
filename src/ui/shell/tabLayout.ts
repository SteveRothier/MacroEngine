export const TAB_LAYOUT = {
  MIN_W: 36,
  /** Soft ceiling for layout math / animations — keep in sync with --caster-tab-max-w. */
  MAX_W: 160,
  STRIP_GAP_PX: 4,
  /** Min width of `.caster-doc-tabbar-drag-fill` (CSS flex-grows to fill leftover strip). */
  DRAG_FILL_W: 24,
} as const;

export type TabStripTokens = { minW: number; maxW: number };

function resolveTokens(tokens?: TabStripTokens): TabStripTokens {
  return tokens ?? { minW: TAB_LAYOUT.MIN_W, maxW: TAB_LAYOUT.MAX_W };
}

export function clampTabWidth(width: number, tokens?: TabStripTokens): number {
  const t = resolveTokens(tokens);
  return Math.min(t.maxW, Math.max(t.minW, width));
}

/**
 * Equal tab width for the current strip: fills available scroll width up to
 * maxW, keeps a drag-fill reserve, and floors at minW (strip may then scroll).
 *
 * Strip children: N tabs + add button + drag-fill → N+1 gaps.
 */
export function computeTargetTabWidth(
  scrollEl: HTMLElement,
  addBtnEl: HTMLElement | null,
  tabCount: number,
  tokens?: TabStripTokens,
): number {
  const t = resolveTokens(tokens);
  const addW = addBtnEl?.offsetWidth ?? t.minW;
  if (tabCount <= 0) {
    return t.maxW;
  }
  // Gaps between tabs, before add, and before drag-fill.
  const gapTotal = (tabCount + 1) * TAB_LAYOUT.STRIP_GAP_PX;
  const available =
    scrollEl.clientWidth - addW - TAB_LAYOUT.DRAG_FILL_W - gapTotal;
  return clampTabWidth(Math.floor(available / tabCount), t);
}
