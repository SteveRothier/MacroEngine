# M3.14 — Style menus déroulants

Unifier `select`, AddMenu et disclosures sur les tokens ambre / motion.

## Livré

- `select` global : chevron SVG, hover/focus ambre, `color-scheme: dark`
- Couvre `.kv-row` et `.field` (Clicker + ActionProps)
- AddMenu : ombre, hover soft, focus-visible, press scale
- `details` Duty / zones / props : chevron cohérent + hover

## Limite

La liste ouverte d’un `<select>` natif reste en partie gérée par Windows/WebView2.

## Vérif

```bash
npx tsc --noEmit
npm run tauri dev
```

Ouvrir Clicker → selects Entrée/Timing ; Macros → menu + .
