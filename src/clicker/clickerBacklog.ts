/**
 * Catalogue produit (comportement actuel).
 * Notes de capacités Clicker / Accueil / Settings / Shell — pas un journal de phases.
 */
export type ClickerBacklogItem = {
  id: string;
  title: string;
  summary: string;
  priority: number;
};

/** Runtime moteur : filtre process, zones, géométrie, feedback session. */
export const CLICKER_RUNTIME_NOTES: readonly ClickerBacklogItem[] = [
  {
    id: "process-filter-feedback",
    title: "Feedback filtre process",
    summary:
      "Métrique filterBlockedTicks ; journal au 1er blocage puis tous les 100 ; compteur dans le bandeau runtime titlebar si > 0.",
    priority: 1,
  },
  {
    id: "process-filter-per-preset",
    title: "Filtre process par preset",
    summary:
      "Modes inherit / off / local + localProcessFilter (parité macros). Résolution au démarrage ; badge + mode visibles dans Entrée, liste locale en details ; Hérité/Off/Local en caster-segmented.",
    priority: 2,
  },
  {
    id: "zone-start-session",
    title: "Zone Start = démarrer / reprendre",
    summary:
      "Resume PauseGate en session ; cold-start Idle→Running edge-triggered (watcher curseur + clicker_config). Charge le dernier preset (parité tray_relaunch_last / last_clicker_id).",
    priority: 3,
  },
  {
    id: "zone-runtime-feedback",
    title: "Feedback runtime zones",
    summary:
      "Journal + toast i18n pour Stop / Pause (edge) / Start resume / Start launch via EngineEvent::ZoneFeedback → engine://zone.",
    priority: 4,
  },
  {
    id: "pixel-runtime-feedback",
    title: "Feedback condition pixel",
    summary:
      "Toast + journal quand hors tolérance (Arrêt / Pause edge) via EngineEvent::PixelFeedback → engine://pixel.",
    priority: 5,
  },
  {
    id: "multi-monitor-dpi",
    title: "Multi-moniteur / DPI",
    summary:
      "clientToScreen projette via l’origine de l’écran actif ; scaleFactor dans ScreenGeomDto ; set_active_display(displayId) ; tests zoneGeom.",
    priority: 6,
  },
  {
    id: "status-overlay-session",
    title: "Overlay statut session",
    summary:
      "Pastille flottante en Running/Paused : clics · durée · CPS · pause ; Pause|Reprendre + Stop (request_cancel) ; zone texte → focus fenêtre principale.",
    priority: 7,
  },
] as const;

/** Studio clicker : onglets, cible, zones, limites, capture, titlebar. */
export const CLICKER_STUDIO_NOTES: readonly ClickerBacklogItem[] = [
  {
    id: "studio-tabs",
    title: "Studio 4 onglets",
    summary:
      "Entrée / Cible / Zones / Limites ; 4 panneaux keep-alive (hidden + inert) ; tablist a11y ←/→ ; carte uniquement sur Cible et Zones. Pas de chips « prêt » sous la nav (buildReadyItems = tests uniquement).",
    priority: 1,
  },
  {
    id: "entry-cadence",
    title: "Entrée et cadence",
    summary:
      "Mode + cadence toujours visibles ; filtre process et timing avancé (CPS min/max, duty, ordre zones) en details. Unité /s /min /h /j en segmented ; dutyMode Pulse / Maintien % ; slider Duty visible si holdPct.",
    priority: 2,
  },
  {
    id: "target-modes",
    title: "Modes cible",
    summary:
      "Curseur = hint seul. Fixe = Pick + auto-fin au 1er clic. Séquence = capture multi-points, ±px jitter global, délai ms par point (pauseAfterMs). Bannière portal Annuler/Terminer pendant capture.",
    priority: 3,
  },
  {
    id: "capture-to-points",
    title: "Capture → points",
    summary:
      "Module clicker_capture (start/stop/state) ; clics → ClickPoint[] ; Échap annule. Tests CaptureBuffer / discard / finish côté Rust.",
    priority: 4,
  },
  {
    id: "clicker-points-multi",
    title: "Multi-sélection points",
    summary:
      "Shift/Ctrl + barre bulk dupliquer/supprimer/réordonner ; undo groupé ; + Point resync multiIndices. Ligne dense X Y × R ms ; croix au survol ; clic dehors désélectionne.",
    priority: 5,
  },
  {
    id: "zones-safety-vs-click",
    title: "Zones Sécurité / Clic",
    summary:
      "Blocs Sécurité (coins/bords/custom safety) vs Clic ; empty + CTA Dessiner. Multi-select Ctrl/Shift ; bulk supprimer / amener devant ; clic hors panneau désélectionne. Scroll unique sur le panneau zones.",
    priority: 6,
  },
  {
    id: "limits-pixel",
    title: "Limites et pixel",
    summary:
      "Progression clics/temps restants dans le bandeau runtime si limites actives. Condition pixel : Activée+Pick visibles ; RGB/live/refresh en details.",
    priority: 7,
  },
  {
    id: "titlebar-runtime-strip",
    title: "Bandeau runtime titlebar",
    summary:
      "CPS mesuré ou cible, clics émis, pause — visible si session running. Export stats via menu ⋯ (Copier JSON / Exporter JSON·CSV). Nom + raccourci dans la titlebar (parité macro, conflits).",
    priority: 8,
  },
  {
    id: "preset-export-import",
    title: "Export / import preset",
    summary:
      "Dialogues Tauri Import/Export (config + zones + points) ; toasts ; ouverture d’onglet à l’import. Templates : Impulsion haute cadence, Sécurité coins seuls, Cible fixe limitée (max 50 clics). « Sauver comme nouveau preset » en titlebar.",
    priority: 9,
  },
  {
    id: "display-popover-clicker",
    title: "Sélecteur moniteur",
    summary:
      "DisplayPopover Esc / focus trap ; feedback titlebar si displayId absent de list_displays.",
    priority: 10,
  },
] as const;

/** Accueil : liste, sélection, dossiers, conversion. */
export const ACCUEIL_NOTES: readonly ClickerBacklogItem[] = [
  {
    id: "accueil-columns",
    title: "Colonnes adaptatives",
    summary:
      "Large : check · kind · nom (1fr) · Infos/hotkey/lastRun/trail à largeurs fixes (grille dense). Étroit (container ~720px) : Infos/hotkey/lastRun dans le subtitle. Hairlines + hover tokens ; dossiers teinte légère. Pas de colonnes État / Dossier / Type / #. Déclencheur masqué si Manuel ; lastRun sans tiret vide.",
    priority: 1,
  },
  {
    id: "accueil-open-selection",
    title: "Clic et sélection",
    summary:
      "Clic gauche ouvre toujours ; avec sélection : clear + ouvrir. Shift/Ctrl/Cmd+clic = coche additive ; Espace toggle, Entrée ouvre ; Esc ou clic dehors désélectionne. lastRun relatif rafraîchi ~45 s. Tri Nom↔Ordre explicite ; Infos/Déclencheur inertes.",
    priority: 2,
  },
  {
    id: "accueil-dock",
    title: "Dock multi-sélection",
    summary:
      "Ouvrir (tous si multi) · Lancer « nom » (premier) · Dupliquer · Corbeille (masquée si tout verrouillé) + menu Plus (favori/verrou/dossier/convert). Verrouillé = lecture seule (pas rename/dupliquer/corbeille/déplacer/convert/DnD ; éditeurs RO ; backend refuse trash/save/move/convert).",
    priority: 3,
  },
  {
    id: "accueil-filters",
    title: "Filtres et empty",
    summary:
      "Filtre vue + menu Types (Tous/Macro/Clicker/Script, compteurs). Sections dossier vides masquées ; empty kind dédié. Recherche : surlignage + aller au dossier (expand/scroll).",
    priority: 4,
  },
  {
    id: "accueil-folders",
    title: "Dossiers",
    summary:
      "parentId, arbo indent/collapse, DnD en-têtes (sort_order), plafond 3 niveaux. Clavier : F2 renommer, Delete/Backspace → corbeille (items et dossiers focusés).",
    priority: 5,
  },
  {
    id: "accueil-list-perf",
    title: "Perf liste longue",
    summary: "content-visibility sur les lignes quand la liste dépasse ~80 items.",
    priority: 6,
  },
  {
    id: "accueil-convert",
    title: "Conversion bibliothèque",
    summary:
      "macro↔clicker best-effort (ClickPoint[] / séquence, warnings soft). Script→clicker via macro intermédiaire. Tokens/warnings convert i18n côté FE.",
    priority: 7,
  },
  {
    id: "accueil-trash",
    title: "Corbeille Accueil",
    summary:
      "Bouton Vider + empty state ; confirmations.purgeTrash. Purge auto au boot par âge (Settings) + UI jours / preview count (purge_library_trash_older_than).",
    priority: 8,
  },
] as const;

/** Settings, shell, journal, macros/scripts DX. */
export const SETTINGS_SHELL_NOTES: readonly ClickerBacklogItem[] = [
  {
    id: "appearance-shell",
    title: "Apparence AppShell",
    summary:
      "density / accent / fontScale / reduceMotion : Settings → câblage AppShell.",
    priority: 1,
  },
  {
    id: "confirmations-dialogs",
    title: "Confirmations",
    summary:
      "Skip dialogs selon prefs : deleteAction, closeDirtyTab, purgeTrash, resetClicker, confirmTrash, confirmDeleteFolder, confirmLaunchFromHome, confirmStopSession.",
    priority: 2,
  },
  {
    id: "accueil-launch-prefs",
    title: "Prefs Accueil et lancement",
    summary:
      "openOnSingleClick, showScriptsInAll, tri défaut, confirmLaunchFromHome, confirmStopSession, autoSaveBeforeRun, focusFollowsRun. runFromRequiresSelection / showSessionPill / warnOnUnsavedQuit / recentListMax branchés.",
    priority: 3,
  },
  {
    id: "library-backup-zip",
    title: "Backup bibliothèque ZIP",
    summary:
      "export/import_library_backup : macros, clickers, scripts, index.",
    priority: 4,
  },
  {
    id: "journal",
    title: "Journal",
    summary:
      "JSONL disque (config dir), reload au boot, cap journalMaxLines. Horodatage, recherche, filtre Erreurs/warn (LogLevel), auto-follow, export .txt, filtres segmented. Esc ferme.",
    priority: 5,
  },
  {
    id: "tray-shell",
    title: "Tray et fenêtres",
    summary:
      "startInTray vs closeToTray vs minimizeHidesToTray. Tray : relancer dernier clicker/macro/script (lastScriptId + start_script_session).",
    priority: 6,
  },
  {
    id: "script-process-filter",
    title: "Filtre process scripts",
    summary: "processFilter local + gate moteur script ; récents exe en localStorage.",
    priority: 7,
  },
  {
    id: "macro-editor-dx",
    title: "DX éditeur macro",
    summary:
      "ActionList multi Shift/Ctrl + bulk (supprimer/déplacer/dupliquer) undo groupé ; clipboard multi-actions. Vue liste seule (pas de graphe). advancedUi toujours actif.",
    priority: 8,
  },
  {
    id: "script-editor-dx",
    title: "DX éditeur script",
    summary:
      "Snippets i18n, menu API élargi, jump-to-line depuis console/diagnostics CodeMirror.",
    priority: 9,
  },
] as const;

/** Ensemble plat pour parcours / recherche locale. */
export const CLICKER_FEATURE_BACKLOG: readonly ClickerBacklogItem[] = [
  ...CLICKER_RUNTIME_NOTES,
  ...CLICKER_STUDIO_NOTES,
  ...ACCUEIL_NOTES,
  ...SETTINGS_SHELL_NOTES,
] as const;
