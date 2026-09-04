# M3.8 — Clarity UX + Dashboard

Hub d’accueil + pack clarté Clicker / Macros / shell. Direction ambre + dual nav inchangée. Pas de nouvelles capacités moteur, pas de jauges CPU/Profiles.

## Livré

- **Dashboard** (`Accueil`) : page par défaut — État, Accès rapide, Session (preset), Raccourcis F6/F9/F8
- **Clicker** : labels FR, hint hotkey, sticky `F6 · Basculer/Maintenir`, Sauver réglages, Duty/Limites/Overlay en secondaire, aide Simple
- **Macros** : transport FR, empty CTA, carte Fichier, ops if `=`/`≠`/`>`…
- **About** : version minimale (l’état live est sur Accueil)

## Hors scope

Profiles, CPU/RAM, OCR, timeline multi-lanes, thème clair.

## Vérif

```bash
npx tsc --noEmit
npm run tauri dev
```
