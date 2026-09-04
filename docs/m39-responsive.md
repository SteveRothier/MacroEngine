# M3.9 — Layout responsive

Layout fluide de la fenêtre mini jusqu’aux grands écrans. Pas de nouvelles features produit.

## Problème

`minWidth: 720` annulait le mode compact (`@media max-width: 720px`).

## Livré

- Fenêtre main : `minWidth: 560`, `minHeight: 480`
- Breakpoints : **compact ≤820** (rail horizontal, titlebar densifiée) · **medium ≤980** (grilles 1 col)
- Tokens : `--content-max`, `--page-pad-x`, `--page-pad-bottom`
- Titlebar : modes scrollables, marque / détail StatusPill masqués en compact
- Pages : `page-grid-2`, zones, hotkeys, seq-header wrap ; sticky Start ok

## Vérif

```bash
npx tsc --noEmit
npm run tauri dev
```

Redimensionner la fenêtre de ~560px à plein écran.
