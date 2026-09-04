# M3.5 — UI produit (direction 1)

Refonte visuelle inspirée des maquettes rail + badge + grille Clicker / séquenceur Macros.  
Accent **ambre** ; vert réservé aux états Running/ON. Pas de clone pixel ni de GPL Blur.

## Livré

- Tokens ambre + contrôles : `Badge`, `Switch`, `Slider`, `RadioGroup`, `IconButton` ([`src/ui/`](../src/ui/))
- Rail d’icônes 56px ([`src/shell/`](../src/shell/))
- Page headers : badge `AUTOCLICKER` / `SÉQUENCEUR` + segmented Simple/Advanced ou Timeline/Liste
- Clicker Advanced : grille 2 colonnes (Entrée / Timing / Zones | Cible / Limites / Presets)
- Macros : carte séquenceur + presets embarqués + import/export ; pastilles couleur par type d’action
- Statusbar : état · preset · hooks · version

## Hors scope

Dashboard, Profiles, CPU/RAM, frameless titlebar, timeline multi-lanes DAW.

## Vérif

```bash
npx tsc --noEmit
npm run tauri dev
```
