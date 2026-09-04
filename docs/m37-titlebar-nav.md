# M3.7 — Titlebar + dual nav

Shell frameless avec **deux barres** :

| Zone | Contenu |
|------|---------|
| Rail **gauche** | Pages : Clicker, Macros, Raccourcis, À propos |
| Titlebar **haut** | Modes contextuels selon la page + titre + ON + min/max/close |

## Modes titlebar

- **Clicker** → Simple \| Advanced (persist `advancedUi`)
- **Macros** → Timeline \| Liste
- **Raccourcis / À propos** → aucun mode

Plus de `ModeBar` sous le `PageHeader`.

## Aussi

- Fenêtre `main` : `decorations: false`
- Permissions window : minimize, maximize, toggleMaximize, close, isMaximized

## Vérif

```bash
npx tsc --noEmit
npm run tauri dev
```
