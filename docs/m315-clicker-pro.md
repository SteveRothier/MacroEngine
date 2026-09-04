# M3.15 — Clicker UI pro (toutes tailles)

Clicker moderne et fluide de **560×480** jusqu’au **plein écran**.

## Breakpoints

| Zone | Largeur | Comportement |
|------|---------|--------------|
| Compact | ≤820 | 1 colonne |
| Medium | ~980 | Avancé Principal 2 col |
| Wide | ≥1100 | Simple Entrée\|Timing 2 col ; panel pleine largeur |
| XL | ≥1400 | gaps / paddings cards plus généreux |

## Livré

- Tokens : `--text-*`, `--control-h`, `--content-max` wide, pads clamp
- Clicker panel sans plafond 28rem ; Simple grille 2 col en wide
- Avancé : segmented pleine largeur, Principal/Sécurité étirés, preview plus haute en wide
- Dock : bouton primaire ambre, badge hotkey, hauteur `--control-h`

## Vérif

```bash
npx tsc --noEmit
npm run tauri dev
```

Tester Clicker Simple/Avancé à 560, 980 et plein écran.
