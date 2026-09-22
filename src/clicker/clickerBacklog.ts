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
  {
    id: "zone-start-last-preset",
    title: "Start zone = dernier preset",
    summary:
      "Cold-start Idle via zone Start charge le dernier preset (parité tray tray_relaunch_last + last_clicker_id) (livré — resolver AppState branché depuis Tauri).",
    priority: 7,
  },
  {
    id: "zone-runtime-feedback",
    title: "Feedback runtime zones",
    summary:
      "Journal FR + toast i18n pour Stop / Pause (edge) / Start resume / Start launch (livré — EngineEvent::ZoneFeedback → engine://zone).",
    priority: 8,
  },
] as const;

/** Phase 5 — prochaines livraisons clicker (non livré). */
export const CLICKER_PHASE_5_BACKLOG: readonly ClickerBacklogItem[] = [
  {
    id: "preset-export-import",
    title: "Export / import preset JSON",
    summary:
      "Sauvegarder et restaurer un preset clicker (config + zones + points) via fichier, pour partage et backup (livré — dialogues Tauri + titlebar Import/Export, toasts, ouverture d’onglet à l’import).",
    priority: 1,
  },
  {
    id: "session-stats-export",
    title: "Export stats de session",
    summary:
      "Copier ou exporter CSV/JSON des compteurs de session (ticks, filtres, durée) depuis le panneau stats (livré — Copier JSON, Enregistrer JSON/CSV via dialogue + write_text_file).",
    priority: 2,
  },
  {
    id: "point-per-click-delay",
    title: "Délai ms par point",
    summary:
      "Étendre ClickPoint avec pauseAfterMs et UI 2e rangée type macro (intervalle entre points de la séquence) (livré — champ ms par point, serde default, sleep annulable dans la boucle).",
    priority: 3,
  },
  {
    id: "clicker-hotkey-parity",
    title: "Parité hotkeys macro",
    summary:
      "Même UX capture/affichage des raccourcis clicker que dans l’éditeur macro (meta bar + conflits) (livré — ClickerMetaBar nom + raccourci style MacroMetaBar, conflits réservés / macros / clickers).",
    priority: 4,
  },
  {
    id: "engine-capture-tests",
    title: "Tests Rust capture / zones",
    summary:
      "Couverture clicker_capture et stop_zones (discard trailing click, Terminer sans point fantôme) (livré — tests CaptureBuffer / discard / finish + stop_zones zone_hit déjà en place).",
    priority: 5,
  },
] as const;
