# M2-A — Macros playables

## Contrat

- React édite / importe / demande play·pause·stop.
- Rust (`MacroVm` + `ActionRegistry`) exécute timing, injection, `process.run`, cancel.
- Clicker et macro sont **mutuellement exclusifs** (un worker).

## Schéma JSON (v1 et v2)

- `schemaVersion`: `1` (legacy) ou `2` (courant)
- `repeatCount`: défaut `1` ; `0` = jusqu’à cancel
- Actions : `mouse.click` (button, x?, y?), `delay`, `process.run` { command, args[] }

Fichiers : `packages/schema/macro.schema.json`, presets dans `src-tauri/presets/`.

## Hotkeys

| Touche | Rôle |
|--------|------|
| F6 | Clicker (toggle / hold) |
| F9 | Macro play / stop (global / fallback) |
| F8 | Arrêt d’urgence (global) |

Voir aussi [`m6-macros-next.md`](m6-macros-next.md) (bibliothèque + triggers par macro).

## IPC

`get_macro`, `set_macro`, `run_macro`, `pause_macro`, `resume_macro`, `import_macro_path`, `export_macro_path`, `load_preset_macro`, `request_cancel` (stop unifié). Bibliothèque : `list_macro_library`, `create_saved_macro`, `save_saved_macro`, `delete_saved_macro`, …

## UI

Onglets **Clicker | Macros** ; éditeur séquence (`ActionList` + cellules), bibliothèque persistée (M6).

## Hors scope M2-A

Record hooks, timeline visuelle, `http_request`, if/else (ajoutés dans les jalons suivants).
