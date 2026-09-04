# M3.3 — Blur full parity

Parité de **comportement** avec [Blur AutoClicker](https://github.com/Blur009/Blur-AutoClicker) au-delà de M3.2.  
**Aucune** copie de code ou d’UI GPL : moteur Caster + cartes UI natives.

## Livré

| Capacité | Détail |
|----------|--------|
| Timing | `Rate` (unités CPS…) ou `Interval` (ms) |
| Duty | `Pulse` (fenêtre 1s) ou `HoldPct` (down → wait → up souris/clavier) |
| Limits | XOR `Clicks` \| `Time` via `limitsEnabled` + `limitMode` |
| Random | Toggle + `%` (jitter d’intervalle) |
| Coins | `sizePx` par coin (défaut 50) |
| Bords | `marginPx` **par** bord (défaut 40) |
| Zones custom | Draw LMB → rect ; actions **Stop / Pause / Start** |
| Click Points | Multi `{x,y,clicks,radius}` + `stopWhenComplete` |
| Hotkeys | Combo clicker (`Ctrl`/`Alt`/`Shift` + VK), ex. Ctrl+Y |
| Presets | JSON dans `clicker-presets/*.json` (config dir) |

## IPC

- `start_clicker` — payload `ClickerConfig` (camelCase)
- `start_zone_draw` — attend drag LMB (timeout 30s) → `{x,y,width,height}`
- `list_clicker_presets` / `save_clicker_preset` / `load_clicker_preset` / `delete_clicker_preset`
- Hotkeys : `actionCtrl` / `actionAlt` / `actionShift` + `actionVk`

## Hors scope (volontaire)

Clone pixel-perfect Blur, stats/télémétrie, OCR, Authenticode/MSI (M5).

## Vérif

```bash
cd src-tauri/crates/engine && cargo test
npm run tauri dev   # smoke UI : Rate/Interval, Draw zone, preset, Ctrl+Y
```
