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

/** Phase 6 — polish UX clicker après Phase 5. */
export const CLICKER_PHASE_6_BACKLOG: readonly ClickerBacklogItem[] = [
  {
    id: "dedupe-preset-name-editors",
    title: "Un seul éditeur de nom",
    summary:
      "Éviter le doublon titlebar vs meta bar (livré — Nom + Raccourci fusionnés dans la titlebar via prop meta, comme MacroTitleBarTools).",
    priority: 1,
  },
  {
    id: "entry-trigger-hint",
    title: "Rappel déclencheur dans Entrée",
    summary:
      "Lien court vers la meta bar pour le raccourci preset (livré — hint sous Mode hotkey).",
    priority: 2,
  },
  {
    id: "session-stats-empty",
    title: "Empty state stats hors session",
    summary:
      "Panneau stats visible à l’arrêt avec message + export désactivé (livré).",
    priority: 3,
  },
  {
    id: "ci-clicker-coverage",
    title: "CI filet clicker",
    summary:
      "Vitest sessionStatsExport + cargo caster-engine déjà couverts par ci.yml (npm test / cargo test) (livré — rien à ajouter).",
    priority: 4,
  },
] as const;

/** Phase 7 — refonte UX studio (carte + scénario). */
export const CLICKER_PHASE_7_BACKLOG: readonly ClickerBacklogItem[] = [
  {
    id: "scenario-shell",
    title: "Layout scénario + carte",
    summary:
      "Quoi → Où → Cadence → Sécurité, carte toujours visible, plus d’onglets (livré).",
    priority: 1,
  },
  {
    id: "ready-checklist",
    title: "Checklist prêt + avancé replié",
    summary:
      "Puces dynamiques liées aux blocs ; filtre process et timing avancé en details (livré).",
    priority: 2,
  },
  {
    id: "guided-empty-templates",
    title: "Empty states + templates visibles",
    summary:
      "Hint où vide, bouton modèles dans la titlebar, CPS titlebar retiré (stats seules) (livré).",
    priority: 3,
  },
  {
    id: "flat-inspector-no-cards",
    title: "Inspector plat sans cartes",
    summary:
      "Retrait des cadres Quoi/Où numérotés ; map-first + titres plats + rangées points denses (livré).",
    priority: 4,
  },
  {
    id: "canvas-first-no-stats",
    title: "Canvas-first sans stats",
    summary:
      "Carte dominante + ToolStrip (modes/capture/cadence) ; Entrée/Sécurité en details ; Stats session retirées du studio (livré).",
    priority: 5,
  },
  {
    id: "primary-dock-frequency-first",
    title: "Dock primaire fréquence d’abord",
    summary:
      "Dock Entrée/Cadence/Cible toujours visible ; carte aperçu ; Sécurité/Avancé en details (livré).",
    priority: 6,
  },
  {
    id: "tabs-four-map-ondemand",
    title: "Retour 4 onglets",
    summary:
      "Entrée / Cible / Zones / Limites ; carte uniquement sur Cible et Zones ; pas de Stats ni dock (livré).",
    priority: 7,
  },
] as const;

/** Phase 8 — suite polish UX (après 4 onglets). */
export const CLICKER_PHASE_8_BACKLOG: readonly ClickerBacklogItem[] = [
  {
    id: "entry-details-process-timing",
    title: "Entrée allégée",
    summary:
      "Filtre process + timing avancé (CPS min/max, duty, ordre zones) en details fermés ; entrée/cadence toujours visibles (livré).",
    priority: 1,
  },
  {
    id: "target-cursor-hint-only",
    title: "Cible curseur simplifiée",
    summary:
      "Mode curseur = hint seul, sans rangée Capturer / liste points (livré).",
    priority: 2,
  },
  {
    id: "titlebar-runtime-strip",
    title: "Bandeau runtime titlebar",
    summary:
      "CPS mesuré ou cible, clics émis, indicateur pause — uniquement si session running (livré).",
    priority: 3,
  },
  {
    id: "zones-safety-vs-click",
    title: "Zones Sécurité / Clic",
    summary:
      "Blocs titrés Sécurité (coins/bords/custom safety) vs Clic ; empty + CTA Dessiner (livré).",
    priority: 4,
  },
  {
    id: "studio-orphan-components",
    title: "Dead code studio hors UI",
    summary:
      "ClickerPrimaryDock, ClickerToolStrip, ClickerMapPreview non montés (fichiers conservés hors UI).",
    priority: 5,
  },
] as const;

/** Phase 9 — guidage + parité UX (studio 4 onglets). */
export const CLICKER_PHASE_9_BACKLOG: readonly ClickerBacklogItem[] = [
  {
    id: "ready-checklist-tabs",
    title: "Checklist prêt → onglets",
    summary:
      "ClickerReadyChecklist remontée sous la nav ; blockId remappés entry/target/zones/limits (livré).",
    priority: 1,
  },
  {
    id: "filter-blocked-titlebar",
    title: "Filtre bloqué titlebar",
    summary:
      "Compteur filterBlockedTicks dans le bandeau runtime si > 0 (livré).",
    priority: 2,
  },
  {
    id: "zones-click-cta",
    title: "CTA Zones Clic",
    summary:
      "Empty + Dessiner (kind click) dans le bloc Clic ; empty global retiré (livré).",
    priority: 3,
  },
  {
    id: "target-sequence-jitter",
    title: "Jitter séquence Cible",
    summary:
      "Contrôle ±px global sur les points en mode séquence (livré).",
    priority: 4,
  },
  {
    id: "purge-orphan-studio",
    title: "Purge orphelins Phase 7",
    summary:
      "Suppression PrimaryDock, ToolStrip, MapPreview, FlatSection, What/Pace/Where/Safety (SessionStats retiré en Phase 12) (livré).",
    priority: 5,
  },
] as const;

/** Phase 10 — polish segmented / process / runtime / sliders. */
export const CLICKER_PHASE_10_BACKLOG: readonly ClickerBacklogItem[] = [
  {
    id: "unit-segmented",
    title: "Unité cadence segmented",
    summary:
      "Select Unité remplacé par caster-segmented (s / min / h / jour) (livré).",
    priority: 1,
  },
  {
    id: "process-summary-row",
    title: "Filtre process résumé visible",
    summary:
      "Ligne badge + mode toujours visible ; liste locale en details (livré).",
    priority: 2,
  },
  {
    id: "limits-progress-titlebar",
    title: "Progression limites titlebar",
    summary:
      "Clics et/ou temps restants dans le bandeau runtime si limites actives (livré).",
    priority: 3,
  },
  {
    id: "slider-theme",
    title: "Sliders thème caster",
    summary:
      "Track/thumb .caster-settings-range via --caster-accent (WebKit + Firefox) (livré).",
    priority: 4,
  },
  {
    id: "hygiene-listonly-ready",
    title: "Hygiène listOnly / ReadyChecklist",
    summary:
      "Prop listOnly retirée ; composant UI ReadyChecklist retiré, buildReadyItems conservé (livré).",
    priority: 5,
  },
] as const;

/** Phase 11 — Cible fixe / Entrée compacte / a11y. */
export const CLICKER_PHASE_11_BACKLOG: readonly ClickerBacklogItem[] = [
  {
    id: "fixed-pick-only",
    title: "Cible fixe = pick seul",
    summary:
      "Mode fixe : Pick + auto-fin au 1er clic ; capture multi-points réservée à séquence (livré).",
    priority: 1,
  },
  {
    id: "unit-compact-labels",
    title: "Unité cadence compacte",
    summary:
      "Labels /s /min /h /j avec title/aria longs (livré).",
    priority: 2,
  },
  {
    id: "duty-segmented",
    title: "dutyMode segmented",
    summary: "Pulse / Maintien % en caster-segmented (livré).",
    priority: 3,
  },
  {
    id: "tabs-a11y",
    title: "A11y onglets studio",
    summary:
      "tablist/tab/tabpanel liés ; navigation clavier ←/→ (livré).",
    priority: 4,
  },
  {
    id: "hygiene-ready-css",
    title: "Purge CSS ready",
    summary: "Règles .caster-clicker-ready* retirées (livré).",
    priority: 5,
  },
] as const;

/** Phase 12 — parité contrôles, capture, keep-alive, export stats. */
export const CLICKER_PHASE_12_BACKLOG: readonly ClickerBacklogItem[] = [
  {
    id: "process-mode-segmented",
    title: "Process mode segmented",
    summary:
      "Hérité / Off / Local en caster-segmented (Select allow/deny local conservé) (livré).",
    priority: 1,
  },
  {
    id: "capture-portal-banner",
    title: "Bannière capture / pick",
    summary:
      "Portal role=status pendant capturingPoints ; Annuler (fixe) / Terminer (séquence) (livré).",
    priority: 2,
  },
  {
    id: "tabs-keep-alive",
    title: "Onglets keep-alive",
    summary:
      "4 panneaux toujours montés ; hidden + inert ; scroll/details conservés (livré).",
    priority: 3,
  },
  {
    id: "limits-pixel-details",
    title: "Limites pixel details",
    summary:
      "RGB/live/refresh dans details ; Activée+Pick visibles ; aria macro + hint titlebar (livré).",
    priority: 4,
  },
  {
    id: "duty-holdpct-discoverable",
    title: "Duty holdPct découvrable",
    summary:
      "Slider Duty hors Timing avancé si dutyMode=holdPct ; pulse reste dans details (livré).",
    priority: 5,
  },
  {
    id: "stats-export-menu",
    title: "Export stats menu ⋯",
    summary:
      "Copier JSON / Exporter JSON·CSV depuis titlebar ; ClickerSessionStats + CSS purgés (livré).",
    priority: 6,
  },
  {
    id: "zones-single-scroll",
    title: "Scroll unique Cible/Zones",
    summary:
      "Pane --zones overflow:hidden ; zones-panel scrolle (livré).",
    priority: 7,
  },
] as const;

/** Phase 13 — checklist chips, advancedUi, hygiène. */
export const CLICKER_PHASE_13_BACKLOG: readonly ClickerBacklogItem[] = [
  {
    id: "ready-chips-nav",
    title: "Chips prêt sous la nav",
    summary:
      "Retiré volontairement (Raccourci/Cible/Cadence/Garde-fou) — ne pas reproposer l’UI chips sous la nav. buildReadyItems reste pour tests uniquement.",
    priority: 1,
  },
  {
    id: "advanced-ui-studio",
    title: "Mode Simple / Avancé studio",
    summary:
      "advancedUi toujours actif ; réglage Simple/Avancé retiré (livré).",
    priority: 2,
  },
    {
      id: "hygiene-orphans-process-tests",
      title: "Hygiène orphelins + tests process",
      summary:
        "Purge RunJournal/ClickerPanel ; Vitest processFilter (livré).",
      priority: 3,
    },
    {
      id: "journal-segmented-export",
      title: "Journal segmented + export fichier",
      summary: "Filtres caster-segmented + enregistrement .txt (livré).",
      priority: 4,
    },
    {
      id: "process-recents-local",
      title: "Récents exe persistants",
      summary: "sessionStorage → localStorage avec migration (livré).",
      priority: 5,
    },
    {
      id: "script-process-filter",
      title: "Filtre process scripts",
      summary: "processFilter local + gate moteur script (livré).",
      priority: 6,
    },
    {
      id: "auto-purge-trash",
      title: "Purge auto corbeille",
      summary: "Settings + purge au boot par âge (livré).",
      priority: 7,
    },
    {
      id: "macro-to-clicker",
      title: "Conversion macro → clicker",
      summary: "CPS trivial (clics+delays) → preset clicker (livré).",
      priority: 8,
    },
    {
      id: "graph-layout-hint",
      title: "Hint graphe layout-only",
      summary: "Option Graphe retirée — vue liste seule (livré).",
      priority: 9,
    },
  ] as const;

/** Phase 14 — hygiène palette/graphe, Accueil corbeille, DX macros/scripts. */
export const CLICKER_PHASE_14_BACKLOG: readonly ClickerBacklogItem[] = [
  {
    id: "hygiene-advanced-ui-graph",
    title: "Hygiène advancedUi + purge graphe",
    summary:
      "advancedUi forcé true hors API éditeur ; MacroCanvas/macroToGraph/graphToMacro retirés ; uiLayout ignoré au save (livré).",
    priority: 1,
  },
  {
    id: "purge-command-palette",
    title: "Purge palette Ctrl+K",
    summary:
      "CommandPalette + prefs commandPaletteEnabled + i18n associés retirés (livré).",
    priority: 2,
  },
  {
    id: "template-fixed-limited",
    title: "Template Cible fixe limitée",
    summary: "fixed-target-limited : point fixe + max 50 clics (livré).",
    priority: 3,
  },
  {
    id: "stats-export-empty",
    title: "Stats session empty state",
    summary:
      "Export ⋯ déjà livré ; empty state / libellés inchangés hors polish mineur (merge-only).",
    priority: 4,
  },
  {
    id: "prefs-confirm-appearance-merge-only",
    title: "confirmations / appearance merge-only",
    summary:
      "Pas d’UI Phase 14 — supersédé Phase 16 (prefs vivantes).",
    priority: 5,
  },
] as const;

/** Phase 16 — paramètres vivants (apparence, confirmations, Accueil, lancement). */
export const CLICKER_PHASE_16_BACKLOG: readonly ClickerBacklogItem[] = [
  {
    id: "appearance-shell",
    title: "Apparence → AppShell",
    summary:
      "density / accent / fontScale / reduceMotion : UI Settings + câblage AppShell (livré).",
    priority: 1,
  },
  {
    id: "confirmations-dialogs",
    title: "Confirmations honorées",
    summary:
      "UI Confirmations + skip dialogs deleteAction / closeDirtyTab / purgeTrash / resetClicker (livré).",
    priority: 2,
  },
  {
    id: "accueil-prefs-settings",
    title: "Prefs Accueil exposées",
    summary:
      "openOnSingleClick, confirmTrash/DeleteFolder, showScriptsInAll, tri défaut (livré).",
    priority: 3,
  },
  {
    id: "launch-prefs-settings",
    title: "Prefs lancement exposées",
    summary:
      "confirmLaunchFromHome, confirmStopSession, autoSaveBeforeRun (+ focusFollowsRun déjà) (livré).",
    priority: 4,
  },
  {
    id: "ux-search-journal-esc",
    title: "Polish Esc Accueil / journal",
    summary: "Clear + Esc recherche Accueil ; Esc ferme le journal (livré).",
    priority: 5,
  },
] as const;

/** Phase 17 — Accueil clavier, corbeille, hygiène prefs, conversion i18n. */
export const CLICKER_PHASE_17_BACKLOG: readonly ClickerBacklogItem[] = [
  {
    id: "accueil-keyboard",
    title: "Clavier Accueil",
    summary: "Delete/Backspace → corbeille ; F2 renommer (livré).",
    priority: 1,
  },
  {
    id: "trash-purge-accueil",
    title: "Vider corbeille depuis Accueil",
    summary:
      "Bouton Vider + empty state ; honoré confirmations.purgeTrash (livré).",
    priority: 2,
  },
  {
    id: "prefs-wire-or-purge",
    title: "Prefs hygiène",
    summary:
      "runFromRequiresSelection / showSessionPill / warnOnUnsavedQuit / recentListMax branchés ; doubleClickDelayMs purgé FE (livré).",
    priority: 3,
  },
  {
    id: "convert-report-i18n",
    title: "Conversion i18n",
    summary: "Warnings/tokens convert localisés côté FE (livré).",
    priority: 4,
  },
  {
    id: "smoke-no-graph",
    title: "Smoke sans graphe",
    summary: "Checklist smoke : plus de bascule Liste/Graphe (livré).",
    priority: 5,
  },
] as const;

/** Phase 18 — données, journal, convert multi-points, DX éditeurs. */
export const CLICKER_PHASE_18_BACKLOG: readonly ClickerBacklogItem[] = [
  {
    id: "library-backup-zip",
    title: "Backup bibliothèque ZIP",
    summary:
      "export/import_library_backup : macros, clickers, scripts, index (livré).",
    priority: 1,
  },
  {
    id: "journal-v2-light",
    title: "Journal v2 léger",
    summary:
      "Horodatage, recherche, filtre erreurs, auto-follow (livré).",
    priority: 2,
  },
  {
    id: "convert-multipoint",
    title: "Convert multi-points",
    summary:
      "macro↔clicker via ClickPoint[] / séquence (livré).",
    priority: 3,
  },
  {
    id: "actionlist-multiselect",
    title: "ActionList multi-sélection",
    summary: "Shift/Ctrl + barre bulk supprimer/déplacer (livré).",
    priority: 4,
  },
  {
    id: "folder-keyboard",
    title: "Dossiers Accueil clavier",
    summary: "F2/Delete sur dossier focusé (livré).",
    priority: 5,
  },
  {
    id: "scripts-snippets-api",
    title: "Scripts snippets + API + convert clicker",
    summary:
      "Snippets i18n, menu API élargi, → Clicker titlebar macro (livré).",
    priority: 6,
  },
] as const;

/** Phase 19 — shell tray, Accueil dossiers, DX macros/journal. */
export const CLICKER_PHASE_19_BACKLOG: readonly ClickerBacklogItem[] = [
  {
    id: "tray-relaunch-script",
    title: "Tray : relancer dernier script",
    summary:
      "Menu tray + lastScriptId / start_script_session (parité clicker/macro) (livré).",
    priority: 1,
  },
  {
    id: "tray-prefs-hygiene",
    title: "Prefs tray clarifiées",
    summary:
      "startInTray (démarrage caché) vs closeToTray ; alias minimizeToTray (livré).",
    priority: 2,
  },
  {
    id: "accueil-folder-reorder",
    title: "Accueil : réordonner dossiers",
    summary:
      "DnD en-têtes de section + persist sort_order (reorder_library_folders) (livré).",
    priority: 3,
  },
  {
    id: "actionlist-batch-undo",
    title: "ActionList bulk + undo groupé",
    summary:
      "Dupliquer multi ; delete/move/duplicate → une entrée d’historique (livré).",
    priority: 4,
  },
  {
    id: "journal-log-levels",
    title: "Journal LogLevel",
    summary:
      "Payload engine://log typé ; filtre Erreurs/warn sur level (livré).",
    priority: 5,
  },
  {
    id: "display-popover-clicker",
    title: "DisplayPopover + écran clicker",
    summary:
      "Esc / focus trap / dialog ; sélecteur moniteur titlebar clicker (livré).",
    priority: 6,
  },
  {
    id: "convert-script-clicker-empty",
    title: "Convert script→clicker + empty CTA",
    summary:
      "Via macro intermédiaire (+ stub si besoin) ; empty journal/console guidés (livré).",
    priority: 7,
  },
] as const;

/** Phase 20 — convert soft, points multi, dossiers imbriqués, journal disque, minimize→tray. */
export const CLICKER_PHASE_20_BACKLOG: readonly ClickerBacklogItem[] = [
  {
    id: "convert-best-effort",
    title: "Convert best-effort",
    summary:
      "macro↔clicker kept/dropped/warnings ; pas de hard-fail si au moins un clic (livré).",
    priority: 1,
  },
  {
    id: "clicker-points-multi",
    title: "Multi-sélection points clicker",
    summary:
      "Shift/Ctrl + barre bulk dupliquer/supprimer/réordonner ; undo groupé (livré).",
    priority: 2,
  },
  {
    id: "accueil-nested-folders",
    title: "Dossiers Accueil imbriqués",
    summary:
      "parentId, création enfant, arbo indent/collapse, DnD, plafond 3 niveaux (livré).",
    priority: 3,
  },
  {
    id: "journal-disk",
    title: "Journal persisté disque",
    summary:
      "JSONL sous config dir ; reload au boot ; cap journalMaxLines (livré).",
    priority: 4,
  },
  {
    id: "minimize-hides-to-tray",
    title: "Minimize → tray",
    summary:
      "Pref dédiée minimizeHidesToTray (≠ closeToTray / startInTray) (livré).",
    priority: 5,
  },
] as const;

/** Phase 21 — Accueil DX + polish éditeurs. */
export const CLICKER_PHASE_21_BACKLOG: readonly ClickerBacklogItem[] = [
  {
    id: "accueil-search-highlight",
    title: "Recherche Accueil : highlight + aller au dossier",
    summary: "Surlignage des matches ; expand / scroll vers le dossier parent (livré).",
    priority: 1,
  },
  {
    id: "accueil-recent-badges",
    title: "Favoris / récents cohérents",
    summary: "Badge récent Accueil (scripts inclus dans RecentAutomation) (livré).",
    priority: 2,
  },
  {
    id: "macro-paste-multi",
    title: "Macro : coller multi clipboard",
    summary: "Clipboard interne multi-actions ; paste après sélection (livré).",
    priority: 3,
  },
  {
    id: "script-jump-line",
    title: "Script : jump to line",
    summary: "Clic console / diagnostic → aller à la ligne CodeMirror (livré).",
    priority: 4,
  },
  {
    id: "clicker-zones-multi",
    title: "Zones clicker multi-select",
    summary: "Ctrl/Shift ; supprimer / amener devant en bulk (livré).",
    priority: 5,
  },
] as const;

/** Phase 22 — shell / qualité plateforme. */
export const CLICKER_PHASE_22_BACKLOG: readonly ClickerBacklogItem[] = [
  {
    id: "display-missing-feedback",
    title: "Écran actif absent",
    summary: "Feedback titlebar si displayId introuvable parmi list_displays (livré).",
    priority: 1,
  },
  {
    id: "purge-trash-age-ui",
    title: "Purge corbeille par âge",
    summary: "UI jours + preview count ; API purge_library_trash_older_than (livré).",
    priority: 2,
  },
  {
    id: "accueil-list-perf",
    title: "Perf Accueil content-visibility",
    summary: "content-visibility sur lignes quand liste longue (livré).",
    priority: 3,
  },
  {
    id: "tests-convert-folders",
    title: "Tests convert soft + nested folders",
    summary: "Vitest warnings soft-fail ; Rust set_library_folder_parent (livré).",
    priority: 4,
  },
] as const;

/** Phase 23 — feedback pixel + polish UX clicker. */
export const CLICKER_PHASE_23_BACKLOG: readonly ClickerBacklogItem[] = [
  {
    id: "pixel-runtime-feedback",
    title: "Feedback runtime condition pixel",
    summary:
      "Toast + journal FR quand hors tolérance (Arrêt / Pause edge) via EngineEvent::PixelFeedback → engine://pixel (livré).",
    priority: 1,
  },
  {
    id: "zones-click-outside-deselect",
    title: "Zones : clic dehors désélectionne",
    summary:
      "Parité points — clear zoneSelection + multi hors panneau (carte exclue) (livré).",
    priority: 2,
  },
  {
    id: "clicker-ux-pixel-points-infotip",
    title: "UX Limites / Points / InfoTip",
    summary:
      "Condition pixel cartes unifiées ; InfoTip i ; points une ligne + hover croix + désélection (livré).",
    priority: 3,
  },
] as const;
