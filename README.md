# MacroEngine

Moteur d’automatisation Windows (macros souris/clavier) — reboot **Tauri 2 + React + Rust**.

## Statut

**M0 — Fondations** : coquille applicative et contrats moteur. Pas d’autoclicker ni d’éditeur encore (→ M1-A).

## Prérequis

- Windows 10/11
- Node.js 20+
- Rust stable (`rustup`)
- [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/)
- MSVC Build Tools

## Développement

```bash
npm install
npm run tauri dev
```

## Code WPF legacy

L’ancienne version WPF est conservée sur la branche `legacy/wpf` (tag `legacy-wpf`).

```bash
git checkout legacy/wpf
```

## Licence

MIT
