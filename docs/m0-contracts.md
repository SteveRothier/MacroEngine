# Contrats M0 — MacroEngine

## Règle absolue

Si une feature ne peut pas être testée sans ouvrir React, elle est au mauvais endroit.

- **React** demande : lancer / annuler / lire l’état.
- **Rust (`macroengine-engine`)** possède : timing futur, hooks futurs, injection input, état d’exécution critique, annulation.

## États moteur

`Idle` → `Running` → `Paused` | `Stopping` → `Idle`, avec `Error` récupérable uniquement vers `Idle`.

Transitions illégales = erreur (`StateTransitionError`).

## Annulation

`CancellationToken` partagé. Toute action longue (delay, plus tard process/HTTP) doit le consulter.

En M0, `request_cancel` passe par IPC UI → Rust. En M1-A, le hotkey d’urgence sera **indépendant** de React.

## Schéma macro (v1)

Intention JSON minimale : `schemaVersion`, `name`, `trigger`, `actions[]` avec `mouse.click` et `delay`.

Fichier : `packages/schema/macro.schema.json`.

## ActionRegistry

Le moteur dispatch vers des handlers. M0 : stubs `noop` / `log` / click stub / delay. WASM plus tard, derrière la même abstraction.

## Hors scope M0

- SendInput / CPS réel
- Hooks globaux / hotkeys
- Éditeur de macros / record
- Overlay produit, modes Advanced clicker
- HTTP / process / WASM réels

## Checklist fin M0

- [x] `cargo test` dans `src-tauri/crates/engine` vert
- [x] App Tauri compile (`cargo check` / build)
- [x] IPC `get_engine_state` / `request_cancel` / `begin_demo_run`
- [x] Tray + logs
- [x] Branche `legacy/wpf` + tag `legacy-wpf`
- [x] Historique commits style Horizon sur `v2`
- [ ] `npm run tauri dev` validé manuellement (fenêtre + tray)
