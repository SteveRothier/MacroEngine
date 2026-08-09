# MacroEngine

Moteur d’automatisation Windows (macros souris/clavier) — reboot **Tauri 2 + React + Rust**.

## Statut

**M1-B — Productization** : autoclicker avec picker, jitter, limites, stop zones, overlay, persistence. Voir [`docs/m1b-product.md`](docs/m1b-product.md). Gate timing M1-A : [`docs/m1a-gate.md`](docs/m1a-gate.md).

## Prérequis

- Windows 10/11
- Node.js 20+
- Rust stable (`rustup`)
- [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/)
- Visual Studio Build Tools (MSVC / `link.exe`)

## Développement

```bash
npm install
npm run tauri dev
```

Hotkeys : **F6** action (toggle / hold), **F8** emergency stop.

Tests moteur (sans UI) :

```bash
cd src-tauri/crates/engine
cargo test
cargo test --test slo_harness
```

## Structure

- `src/` — UI React (Simple / Advanced + overlay)
- `src-tauri/` — shell Tauri (tray, IPC, overlay, settings)
- `src-tauri/crates/engine/` — moteur (clicker, input, scheduler, stop zones)
- `packages/schema/` — JSON Schema macros
- `docs/m0-contracts.md` — contrats M0
- `docs/m1a-gate.md` — gate SLO M1-A
- `docs/m1b-product.md` — features M1-B

## Checklist M0

- [x] Archive WPF : branche `legacy/wpf`, tag `legacy-wpf`
- [x] Scaffold Tauri 2 + React + TypeScript
- [x] Machine d’états + jeton d’annulation
- [x] Event bus + AppState
- [x] ActionRegistry stub + schéma JSON v1
- [x] Stubs scheduler / macro_vm + tests
- [x] Tray, logs, IPC `get_engine_state` / `request_cancel`
- [x] Documentation des contrats
- [x] `npm run tauri dev` validé manuellement

## Checklist M1-B (résumé)

Voir [`docs/m1b-product.md`](docs/m1b-product.md).

## Code WPF legacy

```bash
git checkout legacy/wpf
# ou
git checkout legacy-wpf
```

## Licence

MIT
