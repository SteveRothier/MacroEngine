export const TAB_LAYOUT = {
  MIN_W: 36,
  MAX_W: 180,
  STRIP_GAP_PX: 4,
} as const;

export type TabStripTokens = { minW: number; maxW: number };

function resolveTokens(tokens?: TabStripTokens): TabStripTokens {
  return tokens ?? { minW: TAB_LAYOUT.MIN_W, maxW: TAB_LAYOUT.MAX_W };
}

export function clampTabWidth(width: number, tokens?: TabStripTokens): number {
  const t = resolveTokens(tokens);
  return Math.min(t.maxW, Math.max(t.minW, width));
}

export function computeTargetTabWidth(
  scrollEl: HTMLElement,
  addBtnEl: HTMLElement | null,
  tabCount: number,
  tokens?: TabStripTokens,
): number {
  const t = resolveTokens(tokens);
  if (tabCount <= 0) return t.maxW;
  const addW = addBtnEl?.offsetWidth ?? t.minW;
  const gapTotal = tabCount * TAB_LAYOUT.STRIP_GAP_PX;
  const available = scrollEl.clientWidth - addW - gapTotal;
  return clampTabWidth(Math.floor(available / tabCount), t);
}
