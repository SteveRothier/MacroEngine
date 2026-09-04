# M3.6 — Polish UI produit

Suite de [`m35-ui-product.md`](m35-ui-product.md). Objectif : ressenti « outil fini » sur Clicker + Macros, sans nouvelles capacités moteur.

## Livré

- **Clicker Simple** : colonne dense, type de clic éditable, pastille ON locale, metrics sous Timing
- **Clicker Advanced** : coins toujours visibles ; bords / custom en secondaire (`<details>`)
- **Sticky Start** : padding bas du `page-content` pour ne pas masquer les presets
- **Macros** : `AddMenu` (+ Ajouter) au lieu de 7 boutons ; transport contextuel (Play / Pause / Resume)
- **Liste if** : rail vertical then/else + labels FR courts
- **Shell** : titlebar plus discrète ; statusbar `Hotkeys · F6/F9/F8` ; hover rail plus net
- **M3.6bis — ModeBar** : barre d’onglets sous le `PageHeader` pour Simple/Advanced (Clicker) et Timeline/Liste (Macros) ; plus de Segmented dans le trailing du header

## Hors scope

Nouvelles features moteur / OCR, timeline multi-lanes, Dashboard / Profiles / CPU, frameless titlebar, thème clair.

## Vérif

```bash
npx tsc --noEmit
npm run tauri dev
```
