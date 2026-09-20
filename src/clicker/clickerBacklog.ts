/**
 * Backlog produit Clicker — Phase 4.
 * Annoté au fur et à mesure des livraisons.
 */
export type ClickerBacklogItem = {
  id: string;
  title: string;
  summary: string;
  priority: number;
};

export const CLICKER_FEATURE_BACKLOG: readonly ClickerBacklogItem[] = [
  {
    id: "process-filter-feedback",
    title: "Feedback filtre process",
    summary:
      "Compteur de ticks bloqués par le filtre + ligne journal (évite « ça marche pas »).",
    priority: 1,
  },
  {
    id: "process-filter-per-preset",
    title: "Filtre process par preset",
    summary:
      "inherit / off / local + liste locale (parité macros processFilter).",
    priority: 2,
  },
  {
    id: "zone-start-session",
    title: "Zone Start = démarrer / reprendre",
    summary:
      "La zone Start lance ou reprend la session clicker (plus seulement unpause tick).",
    priority: 3,
  },
  {
    id: "multi-monitor-dpi",
    title: "Multi-moniteur / DPI",
    summary:
      "Géométrie cohérente overlay, pick, points et read_pixel hors écran principal.",
    priority: 4,
  },
  {
    id: "template-packs-save-preset",
    title: "Packs templates + sauver preset",
    summary:
      "Packs templates étendus et action « Sauver comme nouveau preset ».",
    priority: 5,
  },
  {
    id: "capture-to-points",
    title: "Capture → points clicker",
    summary:
      "Mode court : enregistrer des clics souris → ClickPoint[] (pas le record macro).",
    priority: 6,
  },
] as const;
