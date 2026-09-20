# Checklist smoke — Caster

Vérifications manuelles rapides après une build ou un gros changement.

## Boot & shell

- [ ] Fenêtre principale : `visible: false` au lancement, affichage via `show_main_when_frontend_ready` (show-when-ready, pas de délai artificiel)
- [ ] Splash boot disparaît après le premier paint ; Accueil sans skeleton shimmer au rechargement silencieux
- [ ] L’app démarre (Accueil visible, moteur idle)
- [ ] F6 démarre/arrête le clicker (mode toggle)
- [ ] F9 lance la macro chargée (ou fallback global)
- [ ] F8 arrêt d’urgence

## Clicker

- [ ] Overlay zones : activer « Afficher » → bandes visibles sur l’écran cible
- [ ] Dessiner zone sécurité et zone clic (`begin_zone_overlay_draw`)
- [ ] Zone pause / arrêt / démarrer : curseur dans zone → comportement attendu
- [ ] Sélecteur d’écran (`list_displays` / `set_active_display`)
- [ ] Filtre processus allow/deny bloque ou autorise les ticks

## Macros

- [ ] Capture : démarrer, pause/reprise, souris seule ou clavier seul
- [ ] Post-traitement : délais courts fusionnés après stop
- [ ] Séquence : réordonner racine et branches `then`/`else`, éditer un délai en cellules
- [ ] Bascule **Liste / Graphe** : graphe affiche les nœuds ; positions persistées
- [ ] Convertir macro → script depuis la barre d’outils
- [ ] `control.if` avec `process.eq` / `process.contains`
- [ ] `control.while` avec garde `maxIterations`
- [ ] Filtre process par macro : inherit / off / local
- [ ] `process.run` avec `wait: false` ou timeout

## Scripts

- [ ] Ouvrir un script depuis la bibliothèque / Accueil
- [ ] **Run** session autonome ; **Stop** / F8
- [ ] Dry-run : toggle titlebar → badge visible, pas d’effet host, lignes `dry-run skipped` en console
- [ ] **Pas à pas** : pause avant effets de bord → Continuer
- [ ] Permission refusée (ex. `fetch` sans réseau) → toast indiquant le flag à activer
- [ ] Convertir script → macro (envelopper) depuis la barre d’outils

## Release (tag)

- [ ] CI job `release` produit un artefact NSIS/MSI sur tag `v*`

## Build installateur local (sans CI)

```powershell
npm run tauri build
```

Artefact NSIS : `src-tauri/target/release/bundle/nsis/` (cible `bundle.targets: ["nsis"]` dans `src-tauri/tauri.conf.json`).
Smoke hors dev : démarrage → Accueil → F6 une fois → quit.
