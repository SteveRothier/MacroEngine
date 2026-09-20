# Notes de version — Caster

## Qualité & plateforme

- CI GitHub Actions : typecheck + Vitest + `cargo test` caster-engine sur chaque PR
- Release sur tags `v*` : build NSIS + artefact GitHub Release (`.github/workflows/release.yml`)
- Boot Accueil accéléré (lazy editors, IPC home léger, show-when-ready, fenêtres overlay à la demande)

## Scripts

- Éditeur CodeMirror JS/TS, permissions, dry-run, **pas à pas** (pause avant effets de bord)
- Conversion macro ↔ script depuis Accueil et barres d’outils éditeurs

## Macros

- Bascule **Liste / Graphe** (React Flow) dans l’éditeur ; liste reste le mode par défaut

## i18n

- Bibliothèque et picker localisés FR/EN
