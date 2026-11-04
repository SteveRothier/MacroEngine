/** Curated emoji set for Accueil library item icons. */
export const LIBRARY_ICON_CHOICES = [
  "⚡",
  "🎯",
  "🔥",
  "⭐",
  "🎮",
  "📌",
  "🖱️",
  "⌨️",
  "📦",
  "🛠️",
  "🚀",
  "💡",
  "🧩",
  "⏱️",
  "🛡️",
  "✨",
] as const;

export type LibraryIconChoice = (typeof LIBRARY_ICON_CHOICES)[number];
