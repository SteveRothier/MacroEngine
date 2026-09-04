# M3.12 — Layout sans scroll (sauf fenêtre trop petite)

Objectif : **aucune barre de scroll** aux tailles normales ; scroll interne seulement en filet.

## Seuil

- **≥ ~560×520** (dont défaut **980×700**) : Accueil, Clicker Simple, **Advanced Principal / Sécurité**, Raccourcis, À propos sans barre.
- **&lt; seuil** ou Cible/Plus très remplies / longue liste macros : `overflow: auto` interne OK.
- Jamais de scroll `body` / page entière.

## Livré

- `.page-content` → `overflow: hidden` (toutes les routes)
- `PageHeader` compact (une ligne, sans badge redondant)
- Dashboard / Clicker Simple densifiés
- Raccourcis & À propos en `page-fit-panel` + `page-fit-scroll`
- **Advanced** : Principal en grille 2 colonnes (≥820px) ; hint F6 masqué ; Sécurité preview basse + coins 2×2

## Vérif

```bash
npx tsc --noEmit
npm run tauri dev
```

Tester Clicker Advanced → Principal et Sécurité à 980×700, puis réduire vers 560×480.
