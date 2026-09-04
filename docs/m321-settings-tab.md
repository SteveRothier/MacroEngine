# M3.21 — Paramètres = onglet dédié

L’icône **Paramètres** (engrenage) ouvre une page titlebar **distincte** de Clicker.

## Séparation

| Onglet | Contenu |
|--------|---------|
| **Clicker** | Simple / Avancé opérationnel (Entrée, Timing, Cible, limites, zones) + dock |
| **Paramètres** | Rail 7 sections (Général → Maintenance), sans dock |

Plus de forçage `advancedUi` ni de réutilisation du Clicker en mode Avancé pour Paramètres.

## Fichiers

- [`src/settings/SettingsPanel.tsx`](../src/settings/SettingsPanel.tsx)
- [`src/clicker/useClickerSettings.ts`](../src/clicker/useClickerSettings.ts) — load/save partagés
- [`src/clicker/clickerTypes.ts`](../src/clicker/clickerTypes.ts)
- `ClickerPanel` : `variant="operation" | "settings"`

## Vérif

```bash
npx tsc --noEmit
npm run tauri dev
```

Paramètres ≠ Clicker dans la titlebar ; dock uniquement sur Clicker.
