# M3.13 — Cohérence UI/UX live

États et raccourcis **live** en français, sans refonte shell.

## Livré

- `stateLabelFr` / pill **Actif** · **Arrêt** ([`src/ui/labels.ts`](../src/ui/labels.ts))
- Statusbar + overlay + titlebar : plus d’`idle` / `ON` / `OFF`
- Hotkeys dynamiques (chord clicker + F9/F8 réels) sur Accueil, statusbar, Clicker, Macros
- Clicker Advanced entièrement FR ; mode titlebar **Avancé**
- `PageHeader` avec `hint` NAV
- Accueil : carte Accès rapide retirée ; hub État + Session + Raccourcis

## Vérif

```bash
npx tsc --noEmit
npm run tauri dev
```

Rebind un hotkey → labels Accueil / statusbar mis à jour après Sauver.
