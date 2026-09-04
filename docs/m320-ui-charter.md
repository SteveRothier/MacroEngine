# M3.20 — Charte UI pro

Mini-charte inspirée **Raycast** (densité), **Fluent 2** (contrôles), **Notion Settings** (lignes de réglage) — sans clone.

## Principes

- Un accent : steel blue `#2F6FED`
- Peu de chrome : pas de glow, pas de multi-ombres, pas de pills empilées
- 1 card = 1 groupe interactif ; Apparence / Général en **lignes** (`.settings-row`)
- Titlebar dense (40px), icônes actives soft sans bordure saturée
- Motion : `--dur-fast` seulement

## Tokens

| Token | Valeur |
|-------|--------|
| `--radius-sm` | 6px (contrôles) |
| `--radius-md` | 8px (cards) |
| `--titlebar-h` | 40px |
| Titres section | `0.72rem` uppercase / letter-spacing |
| Stack réglages | `0.65rem` |
| Cards padding | `0.65rem 0.8rem` |

## Surfaces touchées

- Shell titlebar / modes
- Paramètres Clicker (rail, Apparence, Général)
- Padding cards Simple + Avancé

## Vérif

```bash
npx tsc --noEmit
npm run tauri dev
```

Clair + sombre : titlebar et Apparence restent lisibles.
