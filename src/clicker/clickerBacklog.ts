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
      "Compteur de ticks bloqués par le filtre + ligne journal (évite « ça marche pas ») (livré — métrique filterBlockedTicks, journal au 1er blocage puis tous les 100, compteur dans les stats de session).",
    priority: 1,
  },
  {
    id: "process-filter-per-preset",
    title: "Filtre process par preset",
    summary:
      "inherit / off / local + liste locale (parité macros processFilter) (livré — ClickerConfig.processFilter + localProcessFilter, résolution au démarrage comme les macros, sélecteur et éditeur de liste dans la section Entrée).",
    priority: 2,
  },
  {
    id: "zone-start-session",
    title: "Zone Start = démarrer / reprendre",
    summary:
      "La zone Start lance ou reprend la session clicker (livré — resume PauseGate pendant la session ; cold-start Idle→Running edge-triggered via watcher curseur + clicker_config()).",
    priority: 3,
  },
  {
    id: "multi-monitor-dpi",
    title: "Multi-moniteur / DPI",
    summary:
      "Géométrie cohérente overlay, pick, points et read_pixel hors écran principal (livré — clientToScreen projette via l’origine de l’écran actif, scaleFactor exposé dans ScreenGeomDto à titre informatif, set_active_display reçoit enfin displayId, tests zoneGeom).",
    priority: 4,
  },
  {
    id: "template-packs-save-preset",
    title: "Packs templates + sauver preset",
    summary:
      "Packs templates étendus et action « Sauver comme nouveau preset » (livré — modèles « Impulsion haute cadence » et « Sécurité coins seuls », action titlebar qui crée le preset et ouvre son onglet).",
    priority: 5,
  },
  {
    id: "capture-to-points",
    title: "Capture → points clicker",
    summary:
      "Mode court : enregistrer des clics souris → ClickPoint[] (pas le record macro) (livré — module clicker_capture, commandes start/stop/state, bouton « Capturer des points » dans la section Cible, clics répétés = compteur, Échap annule).",
    priority: 6,
  },
] as const;
