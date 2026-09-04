# M4 — Refonte totale Caster

Charte étendue (Raycast / Fluent / Notion) — nav **titlebar** conservée, pas de sidebar globale.

## Surfaces

| Onglet | Rôle |
|--------|------|
| Accueil | Hub session (état, CTA, liens) |
| Clicker | Session uniquement (Entrée/Timing/Cible…) + dock |
| Macros | Séquenceur (timeline / liste) |
| Paramètres | Général, Apparence, Raccourcis, Processus, Presets, Maintenance |
| À propos | Narrow, compact |

Raccourcis n’est plus une page titlebar — section dans Paramètres.

## Règles layout

- `--page-gap` pour stacks ; header Workspace léger
- Dock = actions de session (Clicker) seulement
- Empty states : titre + une phrase + 1–2 CTA
- Cards = groupes interactifs ; rows (`.settings-row`) pour réglages app
- Motion : `--dur-fast` / `--dur` seulement

## Tokens M4

- `--page-gap`, `--statusbar-h` fin, accent `#2F6FED`
- Clair / sombre inchangés structurellement

## Jalons

- M4.1 Shell + tokens
- M4.2 Accueil hub
- M4.3 Clicker ≠ Paramètres (+ fusion Raccourcis)
- M4.4 Macros polish + audit
- **M4.5** Alignement mockups HTML — [`m45-mockup-align.md`](m45-mockup-align.md) · [`mockups/caster-ui.html`](mockups/caster-ui.html)

## Vérif

```bash
npx tsc --noEmit
npm run tauri dev
```
