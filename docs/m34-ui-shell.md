# M3.4 — Début UI final (Phase 1)

Premier jalon de l’UI produit Caster : coque sidebar façon Blur, design tokens, pages alignées.

## Livré

- Tokens : [`src/styles/tokens.css`](../src/styles/tokens.css)
- Primitives : `Card`, `Segmented`, `StatusPill`, `PageHeader` dans [`src/ui/`](../src/ui/)
- Shell : `AppShell`, `Sidebar`, `Titlebar`, `Statusbar` dans [`src/shell/`](../src/shell/)
- Navigation : Clicker · Macros · Raccourcis · À propos
- Clicker : Simple / Advanced (segmented), grille 2 cols Advanced, barre Start/Stop sticky
- Macros / Raccourcis / À propos : même langage carte

## Hors scope (volontaire)

Clone pixel Blur, frameless titlebar, stats/télémétrie, Process List, thème clair.

## Vérif

```bash
npx tsc --noEmit
npm run tauri dev
```
