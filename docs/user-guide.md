# Guide utilisateur — Caster

Caster est une application Windows locale : autoclicker, séquenceur de macros et scripts JavaScript/TypeScript. Le workspace combine une **bibliothèque latérale** et un **éditeur** (onglets). Thème sombre Lavender par défaut (accent modifiable dans Paramètres → Apparence).

## Bibliothèque

- **Panneau gauche** (repliable) : Favoris, Récents, dossiers imbriqués ; recherche et `+ Créer` (macro / clicker / script / dossier).
- **Création dans un dossier** : avec un dossier focusé, `+` crée l’automation (ou un sous-dossier) directement dedans.
- **Ouverture** : clic / Entrée ouvre l’éditeur à droite ; empty state si aucun document.
- **Types** : icônes discrètes macro / clicker / script.
- **Suppression** : définitive depuis le menu contextuel (plus de corbeille dans le panneau).
- **Exécution** : bouton Play / Stop dans la titlebar de chaque éditeur, ou déclencheur / raccourci global.

## Clicker

- **Déclencheurs** : même palette que les macros (manuel, raccourci, horaire, processus FG, titre de fenêtre) — chip dans la titlebar.
- **Cadence** : CPS ou intervalle, mode hold/toggle, simple/double clic.
- **Zones de sécurité** : coins, bords ou rectangles custom. Actions **Arrêt**, **Pause**, **Démarrer** — la zone Démarrer **lance** une session arrêtée (Idle→Running) et **reprend** une session en pause (pause manuelle, condition pixel ou zone pause), en annulant la pause du tick courant.
- **Zones clic** : rectangles `kind: click` — le moteur clique aléatoirement ou au centre, ordre aléatoire ou séquence.
- **Overlay** : aperçu des zones sur l’écran sélectionné (distinct de l’overlay d’état flottant).
- **Écran cible** : choisir le moniteur dans la section Zones ; réglage persisté. Les coordonnées de zones et de points sont celles du bureau virtuel (origine négative possible sur un écran secondaire) ; l’échelle DPI est informative, largeur/hauteur sont déjà en pixels physiques.
- **Filtre processus** : liste allow/deny globale (Paramètres ou Clicker Avancé), plus un mode par preset dans l’onglet Entrée : `inherit` (global), `off` (ignoré), `local` (liste d’.exe propre au preset). Les ticks bloqués sont comptés dans les stats de session et journalisés (1er blocage puis tous les 100).
- **Points de clic** : saisie manuelle, **Pick** à l’écran, ou **Capturer des points** (onglet Cible) — chaque clic gauche ajoute un point, des clics répétés au même endroit augmentent son compteur, **Échap** annule la capture.
- **Modèles & presets** : modèles prêts à l’emploi (dont « Impulsion haute cadence » et « Sécurité coins seuls ») et action **Sauver comme nouveau preset** dans le menu de la barre d’outils.

## Macros

- **Bibliothèque** : créer, renommer, dupliquer, favoris, verrou.
- **Capture** : bouton Capturer ; pause/reprise sans fermer la session ; options souris seule / clavier seul ; fusion automatique des petits délais à l’arrêt.
- **Éditeur** : liste d’actions (séquence + édition cellules) ; branches `Si` / `Tant que` avec glisser-déposer et repli.
- **Déclencheurs** : manuel, raccourci, **horaire** (heure locale + jours), **processus au premier plan**, ou **titre de fenêtre** (front montant, filtre exe optionnel).
- **Conditions** : comparaisons classiques ou prédicats `process.eq` / `process.contains` sur la fenêtre active.
- **Boucle** : action `control.while` avec limite `maxIterations`.
- **Processus** : action `process.run` ; `wait: false` pour lancer sans attendre ; `timeoutMs` optionnel.
- **Filtre par macro** : `processFilter` = `inherit` (global), `off`, ou `local` (+ `localProcessFilter`).

## Scripts

- **Bibliothèque** : scripts JS/TS dans `%APPDATA%/com.steverothier.caster/scripts/` ; créer, renommer, dupliquer, verrou.
- **Éditeur** : CodeMirror (`ScriptSourceEditor`), console sous l’éditeur (`engine://log`).
- **Permissions** : `allowNetwork`, `allowClipboard`, `allowFs`, `allowMacroControl`, `allowInput` (souris/clavier + fenêtres), `allowProcess` — refus → toast avec indication du flag manquant.
- **Dry-run** : bascule titlebar ; exécution sans effets host (journaux `dry-run skipped …`).
- **Déclencheurs** : par script (manuel, raccourci, horaire, FG, titre) — chip titlebar. Le raccourci global « dernier script » (Paramètres) reste un **fallback** si aucun trigger hotkey dédié ne correspond.
- **Lancement** : bouton **Run** titlebar, trigger dédié, raccourci global dernier script, ou depuis Favoris / Récents.
- **Fenêtres** : `caster.listWindows()` / `activateWindow({ title?, exe?, match? })` sous `allowInput` (pas de move/resize HWND).
- **Conversion** : menu bibliothèque — macro ↔ script ; script→clicker extrait les `click`/`moveTo` en points (logique JS non transcrite).

## Raccourcis par défaut

| Touche | Action |
|--------|--------|
| F6 | Clicker |
| F9 | Macro (fallback si pas de trigger dédié) |
| F10 | Dernier script (fallback si pas de trigger hotkey dédié) |
| F8 | Arrêt d’urgence |

## Journal d’exécution

Icône presse-papiers dans la barre Macros : lignes de macro et messages clicker (démarrages, arrêts zones, etc.).
