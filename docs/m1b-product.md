# M1-B — Productization autoclicker

Étend M1-A avec une surface produit minimale (sans retuning du gate CPS).

## Fonctions

| Feature | Détail |
|---------|--------|
| Cible | Curseur courant ou point fixe + **Pick** (capture après 2 s) |
| Jitter | ± fraction sur l’intervalle CPS |
| Double-clic | deux `SendInput` espacés de 30 ms |
| Duty cycle | fraction active par fenêtre 1 s |
| Limites | `maxClicks`, `maxDurationMs` |
| Stop zone | coin haut-gauche (8×8 px) → cancel Rust |
| Overlay | fenêtre always-on-top, click-through, état + CPS |
| Persistence | `%APPDATA%/com.steverothier.macroengine/settings.json` |
| Tray | Démarrer / Arrêter / Overlay / Ouvrir / Quitter |

## Hotkeys (inchangés)

- **F6** — action (toggle / hold)
- **F8** — arrêt d’urgence

## UI

- **Simple** : CPS, bouton, mode, Start/Stop, métriques
- **Advanced** : cible, pick, jitter, double, duty, limites, stop zone, overlay

## Tests

```bash
cd src-tauri/crates/engine
cargo test
```
