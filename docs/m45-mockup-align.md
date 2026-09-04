# M4.5 — Alignement mockups HTML

Source de vérité : [`docs/mockups/caster-ui.html`](mockups/caster-ui.html) (frames 1280×800, IBM Plex, accent `#2F6FED`).

## Livré

| Surface | Alignement |
|---------|------------|
| Titlebar | Nav icône + label, brand `Caster`, segments Simple/Avancé · Timeline/Liste |
| Accueil | Hub centré (statut, CTA 220px, summary preset + raccourci) |
| Clicker | Grille 2 + 3 panels, dock centré Démarrer / Arrêter + pastille raccourci |
| Paramètres | Rail pleine hauteur, pane titre + description, rows Apparence (Thème + Overlay) |
| Macros | Empty centré (icône carré, CTAs Enregistrer / Clic) |

## Non livré (mockup seulement)

Densité UI, picker d’accent, icône barre des tâches — pas de contrôles inertes.

## Vérif

```bash
npx tsc --noEmit
npm run tauri dev
```
