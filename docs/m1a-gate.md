# Gate M1-A — Engine proof

Critères d’acceptance chiffrés avant M1-B. Machine de référence, plan d’alimentation Windows « Performances élevées ».

## SLO

| Critère | Pass |
|---------|------|
| 10 CPS / 10 min | moyenne ±2 % |
| 50 CPS / 10 min | moyenne ±5 % |
| 200 CPS / 5 min | moyenne ±10 % |
| Dérive deadline | < 500 ms / h à 10 CPS (ou équivalent) |
| Emergency stop (F8) | dernier input ≤ 50 ms p95 ; état `Idle` — **hors React** |
| Intégrité | 100 cycles start/stop sans deadlock |
| Indépendance UI | harness `cargo test` sans fenêtre React |
| Budget tuning | ≤ 3 jours une fois le slice écrit |

Règle : SLO verts → gate **fermé**. Pas de chasse 500 CPS / dérive sub-100 ms.

## Harness (sans React)

Depuis `src-tauri/crates/engine` (MSVC / `vcvars64` si besoin) :

```bash
# Toujours (CI / local rapide)
cargo test --test slo_harness

# Gate long (manuel)
cargo test --test slo_harness -- --ignored --nocapture
```

Les tests longs utilisent un `RecordingInjector` (pas de clics OS) pour mesurer le scheduler. La validation SendInput réelle se fait via `npm run tauri dev` + observation hors process.

## Hotkeys M1-A

| Touche | Rôle |
|--------|------|
| **F6** | Action : toggle start/stop, ou hold selon le mode UI |
| **F8** | Arrêt d’urgence (cancel Rust immédiat) |

## Checklist

- [ ] Clics L/R/M via SendInput observés hors process
- [ ] CPS configurable + métrique UI / harness
- [ ] Hold et toggle fonctionnels
- [ ] F8 stoppe sans passer par React
- [ ] `cargo test` engine + `slo_harness` (non-ignored) verts
- [ ] Runs `#[ignore]` documentés (pass ou écart explicite ≤ 3 j)
- [ ] Smoke `npm run tauri dev`
