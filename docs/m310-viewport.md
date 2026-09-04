# M3.10 — Viewport-first + sidebar top

Nav pages dans la **titlebar** ; moins de scroll page aux tailles normales.

## Livré

- Titlebar : icônes Accueil / Clicker / Macros / Raccourcis / À propos + modes (Simple/Advanced, Timeline/Liste)
- Marque `Caster` **sans** carré `brand-mark`
- Rail gauche retiré
- Clicker : dock Start fixe ; Advanced en sections Principal | Cible | Sécurité | Plus
- Dashboard : grille 2×2
- Macros : canvas flex ; Fichier en rangée

## Vérif

```bash
npx tsc --noEmit
npm run tauri dev
```
