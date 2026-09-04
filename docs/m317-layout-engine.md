# M3.17 — Moteur de layout

Refonte de la **gestion** du layout ; la **nav reste dans la titlebar**.

## Architecture

```
app-shell (CSS Grid)
  title  → Titlebar (pages + modes)
  main   → Workspace (header + body)
  dock   → optionnel (Clicker)
  status → Statusbar
```

## Livré

- `AppShell` : areas `title` / `main` / `dock` / `status` ; slot `dock`
- [`src/layout/`](../src/layout/) : `Workspace`, `WorkspaceScroll`
- Tokens `--bp-compact|medium|wide|xl`, `--layout-narrow-max`
- Clicker dock remonté au shell via `onDockChange`
- Pages via `Workspace` ; À propos / Raccourcis en `narrow`

## Vérif

```bash
npx tsc --noEmit
npm run tauri dev
```

Nav titlebar inchangée ; Clicker : dock sous le contenu, statusbar en bas.
