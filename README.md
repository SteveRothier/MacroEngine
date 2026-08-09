# MacroEngine

Moteur d’automatisation Windows (macros souris/clavier) — reboot **Tauri 2 + React + Rust**.

## Statut

**M0 — Fondations** : coquille applicative et contrats moteur. Pas d’autoclicker ni d’éditeur encore (→ M1-A).

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

Tests moteur (sans UI) :

```bash
cd src-tauri/crates/engine
cargo test
```

## Structure

- `src/` — UI React (présentation)
- `src-tauri/` — shell Tauri (tray, IPC, logs)
- `src-tauri/crates/engine/` — contrats moteur + tests
- `packages/schema/` — JSON Schema macros
- `docs/m0-contracts.md` — contrats M0

## Checklist M0

- [x] Archive WPF : branche `legacy/wpf`, tag `legacy-wpf`
- [x] Scaffold Tauri 2 + React + TypeScript
- [x] Machine d’états + jeton d’annulation
- [x] Event bus + AppState
- [x] ActionRegistry stub + schéma JSON v1
- [x] Stubs scheduler / macro_vm + tests
- [x] Tray, logs, IPC `get_engine_state` / `request_cancel`
- [x] Documentation des contrats

## Code WPF legacy

```bash
git checkout legacy/wpf
# ou
git checkout legacy-wpf
```

## Licence

MIT
