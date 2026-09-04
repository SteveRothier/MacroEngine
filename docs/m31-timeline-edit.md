# M3.1 — Timeline éditable

## Contenu

- **Resize delay** : poignée droite sur les clips `delay` ; snap **25 ms** ; écrit `ms` via `updateAtPath`.
- **Drag reorder** : réordonne les actions **top-level** ; sync Liste ↔ Timeline.
- Branches `control.if` / nested : édition toujours en **Liste** (hors scope timeline).
- Pas de bump de schéma (reste v4).

## UX

| Geste | Effet |
|-------|--------|
| Clic clip | Sélection (`path = [i]`) |
| Drag horizontal | Reorder top-level |
| Poignée droite (delay) | Change `ms` (min 25, snap 25) |

## Checklist manuelle

1. Drag réordonne les clips ; la liste suit.
2. Resize d’un delay met à jour `ms` ; Play respecte la durée.
3. if / var non redimensionnables.
4. `npx tsc --noEmit` ; smoke `npm run tauri dev`.
