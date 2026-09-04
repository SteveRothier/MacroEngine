# M3.15 — UI pro + tous écrans

Polish desktop + layouts fluides du min (**560**) au **plein écran**.

## Breakpoints

| Zone | Largeur | Comportement |
|------|---------|--------------|
| Compact | ≤820 | 1 col, densifié |
| Medium | ~980 | grilles 2 col |
| Wide | ≥1100 | contenu étiré, Accueil 3 zones |
| Full | ≥1400 | pads larges, Clicker Advanced jusqu’à ~72rem |

## Livré

- Tokens : `--text-*`, `--control-h`, `--content-max` wide, pads clamp
- Boutons / inputs / selects hauteur unifiée ; primaire ambre soft
- Titlebar modes type segmented ; dock / statusbar soignés
- Clicker Simple jusqu’à ~48–52rem ; Advanced 2 col étiré
- Pas de scroll page (M3.12) conservé

## Vérif

```bash
npx tsc --noEmit
npm run tauri dev
```

Tester 560×480, 980×700, maximisé / plein écran.
