# M3.19 — Mode clair / sombre

Thème UI persisté, bascule dans **Paramètres → Apparence**.

## Comportement

- Clair = tokens M3.16 (`:root`)
- Sombre = graphite foncé + accent steel blue `#2F6FED` (`[data-theme="dark"]`)
- Persistance : `settings.json` → `theme: "light" | "dark"` (+ miroir `localStorage` anti-flash)
- Pas de mode système dans ce jalon

## Fichiers

- [`src/styles/tokens.css`](../src/styles/tokens.css) — overrides dark
- [`src/theme.ts`](../src/theme.ts) — `applyTheme` / boot
- [`settings.rs`](../src-tauri/crates/engine/src/settings.rs) — `ThemeMode`

## Vérif

```bash
npx tsc --noEmit
npm run tauri dev
```

Apparence → Clair / Sombre ; redémarrer pour confirmer la persistance.
