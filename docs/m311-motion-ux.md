# M3.11 — UX final + motion Blur-like

Ressenti fluide (fades / slides courts, press soft) **sans** copier assets ni code GPL. Accent ambre inchangé.

## Livré

### Motion
- Tokens `--ease-out`, `--dur-fast` (120ms), `--dur` (180ms) dans `tokens.css`
- Transitions titlebar, cartes (`ui-fade-up`), sections Clicker Advanced, menus, `:active` scale 0.98
- `prefers-reduced-motion: reduce` coupe translate / scale

### Dashboard
- CTA primaire contextuelle : idle → Ouvrir Clicker ; running → surface active (Clicker / Macros)

### Clicker Simple
- Gaps / padding densifiés pour tenir sans scroll ~700px

### Macros + a11y
- Empty state guidé (enregistrer / clic / preset)
- Propriétés dans panneau `<details>` repliable
- Focus visible titlebar + boutons / menus

## Vérif

```bash
npx tsc --noEmit
npm run tauri dev
```
