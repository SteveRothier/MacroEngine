# Notes de version — Caster

## Phase 27

- Workspace Linear : **bibliothèque latérale** + éditeur (plus de page Accueil)
- Charte **Lavender** (`#A99ACB` défaut, accents blue/teal swapables via CSS vars) ; library resize 190–360 ; status bar
- Exécuter / Pause / Arrêter titlebars ; dock Propriétés macro ; console script repliée par défaut
- Suppression définitive depuis le panneau ; `+` crée dans le dossier focusé

## Phase 26

- Bibliothèque : import / export JSON & ZIP, conflits hotkey, filtre type
- (UI Accueil media-rows remplacée en Phase 27 par la sidebar)

## Phase 25

- Store : checklist Partner Center (`docs/STORE.md`) + listing FR/EN prêts à coller
- Trigger **titre de fenêtre** (macros / clickers / scripts) + poller contextuel partagé
- Triggers clicker & scripts : parité horaire / FG / titre (hotkey global « dernier script » en fallback)
- Convert script→clicker : heuristiques `click` / `moveTo` → points (+ warnings)
- Scripts : `caster.listWindows` / `activateWindow` (`allowInput`)

## Phase 24

- Store / MSIX : version sync `package.json`, signature (`sign-msix.ps1`), autostart HKCU Run seul, CI MakeAppx durcie, listing FR/EN (`docs/store/`)
- Triggers macro : **horaire** puis **processus au premier plan** (poller hors hook clavier)
- Scripts : `caster.screenSize` / `readPixel` / `foregroundTitle` / `foregroundExe` (`allowInput`)
- Permissions macro : menu titlebar (réseau / process) aligné scripts
- Docs : guide liste seule + Zone Start Idle→Running ; retrait `@xyflow/react`

## Phase 22

- Feedback si l’écran clicker actif n’est plus branché
- Corbeille : purge par âge (jours) + aperçu du nombre d’éléments
- Accueil : `content-visibility` sur les longues listes
- Tests : convert soft-fail (Vitest) + dossiers imbriqués (Rust)

## Phase 21

- Accueil : surlignage recherche + « aller au dossier » parent
- Badge « Récent » cohérent (macros / clickers / scripts)
- Macro : coller plusieurs actions depuis le clipboard interne
- Script : clic console / diagnostic → jump to line
- Clicker : multi-sélection zones (supprimer / amener devant)

## Phase 20

- Convert macro↔clicker **best-effort** (`kept` / `dropped` / `warnings`, pas de hard-fail si un clic utilisable)
- Points clicker : multi-sélection + barre bulk (dupliquer / supprimer / réordonner)
- Dossiers Accueil imbriqués (`parentId`, plafond 3 niveaux)
- Journal d’exécution persisté sur disque (JSONL, cap `journalMaxLines`)
- Pref **Réduire vers tray** (`minimizeHidesToTray`) distincte de Fermer / Démarrer caché

## Phase 19

- Tray : relancer le dernier script (`lastScriptId`) ; labels `startInTray` / `closeToTray` clarifiés
- Accueil : réordonner les dossiers (DnD + `sort_order`)
- ActionList : dupliquer multi + undo groupé (delete/move/duplicate)
- Journal : `LogLevel` structuré ; filtre Erreurs/warn réel
- DisplayPopover a11y ; sélecteur d’écran dans la titlebar clicker
- Convert script→clicker (via macro intermédiaire) ; empty states journal / console script

## Phase 18

- Backup / restore bibliothèque (ZIP macros + clickers + scripts + index)
- Journal : horodatage, recherche, filtre erreurs, auto-follow
- Conversion macro↔clicker multi-points (`ClickPoint[]`)
- ActionList multi-sélection + barre bulk ; F2/Delete dossiers Accueil
- Scripts : snippets localisés, menu API élargi ; macro → clicker depuis titlebar

## Phase 17

- Accueil : Delete/Backspace → corbeille, F2 renommer ; Vider la corbeille depuis le filtre
- Prefs : runFromRequiresSelection, pastille session, warnOnUnsavedQuit, recentListMax ; doubleClickDelayMs retiré FE
- Conversion : warnings/tokens localisés ; smoke checklist sans vue graphe

## Phase 16

- Apparence : densité, accent, échelle texte, reduceMotion → AppShell
- Confirmations : prefs UI + honorées (action macro, onglet dirty, purge, reset clicker)
- Accueil / lancement : prefs exposées dans Paramètres (clic, corbeille, tri, launch, stop, auto-save)
- Polish : clear + Esc recherche Accueil ; Esc ferme le journal

## Phase 15

- Accueil : grille CSS partagée en-tête ↔ lignes (plus de vide Nom/Type)
- Tri colonnes Dernière exé et État ; libellés d’en-tête raccourcis
- Macro liste : barre de recherche locale retirée (scroll activePath conservé)

## Phase 14

- Palette Ctrl+K / CommandPalette retirée
- Hygiène : advancedUi toujours on (hors API UI), graphe macro orphelin purgé, uiLayout ignoré
- Accueil : filtre Corbeille + restauration batch ; journalMaxLines (40–500)
- Macro liste : focus activePath au run
- Scripts : presets démarrage visibles + erreurs humanisées (timeout / input / process filter)
- Conversion macro→clicker : clics curseur → CurrentCursor ; template clicker « Cible fixe limitée »
- Prefs confirmations/appearance : merge-only Phase 14 → UI Phase 16

## Qualité & plateforme

- CI GitHub Actions : typecheck + Vitest + `cargo test` caster-engine sur chaque PR
- Release sur tags `v*` : build **NSIS + MSI** + pack MSIX (`scripts/pack-msix.ps1`) + artefacts GitHub Release
- Préparation Microsoft Store : voir [`docs/STORE.md`](STORE.md) (privacy/EULA, `runFullTrust`, sideload)
- Macros schema v9 : permissions `allowNetwork` / `allowProcess` (alignées scripts)
- Boot Accueil accéléré (lazy editors, IPC home léger, show-when-ready, fenêtres overlay à la demande)

## Scripts

- Éditeur CodeMirror JS/TS, permissions, dry-run, **pas à pas** (pause avant effets de bord)
- Conversion macro ↔ script depuis Accueil et barres d’outils éditeurs

## Macros

- Éditeur **liste** seule (vue graphe retirée)

## i18n

- Bibliothèque et picker localisés FR/EN
