# Caster

Automatisation Windows locale — **clicker** + **macros** (Tauri 2 + React + Rust). Aucune télémétrie.

## Statut

Bibliothèque unifiée (macros / presets), verrou bout-en-bout, undo/dirty, Automations (favoris/récents), tests Vitest + Rust, CI GitHub Actions.

- Guide utilisateur : [`docs/user-guide.md`](docs/user-guide.md)
- Checklist smoke : [`docs/smoke-checklist.md`](docs/smoke-checklist.md)
- Index des notes de jalons : [`docs/README.md`](docs/README.md)

Windows uniquement pour hotkeys globales, capture et injection d’entrée.

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

Hotkeys (défaut) : **F6** clicker (combo possible), **F9** macro, **F8** urgence — rebindables dans Paramètres.

## Scripts

| Commande | Rôle |
|----------|------|
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest (utils front) |
| `npm run test:rust` | Tests du crate `caster-engine` |
| `npm run tauri dev` | App desktop |

## Structure

- `src/` — UI React (Automations / Clicker / Macros / Paramètres)
- `src/library/` — sidebar bibliothèque partagée
- `src-tauri/` — shell Tauri (tray, IPC, dialog)
- `src-tauri/crates/engine/` — moteur (clicker + MacroVm + record)
- `packages/schema/` — JSON Schema macros
- `docs/` — guide, smoke, notes M*

## Licence

MIT
