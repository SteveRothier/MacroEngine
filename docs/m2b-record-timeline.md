# M2-B — Record · Séquence · HTTP · Hotkeys

## Contenu

- **Schéma v3** : `http.request`, `key.tap` (en plus de click / delay / `process.run`).
- **Record** : hooks `WH_MOUSE_LL` + `WH_KEYBOARD_LL` → actions JSON ; delays auto ; ignore `dwExtraInfo == Caster_INJECT_TAG` ; refuse si engine Running/Paused ; playback refuse si record actif.
- **Édition** : barre unique (meta + Capturer / Tester) + liste **Séquence** ; journal via la page Runs globale.
- **Hotkeys** : rebindables + persistés dans `settings.json` ; défaut **F6 / F9 / F8** ; les VK gérées sont mangées (pas de caret browsing WebView sur F9).

## IPC

| Commande | Rôle |
|----------|------|
| `start_record` / `stop_record` / `get_record_state` | Session d’enregistrement |
| `get_hotkey_bindings` / `set_hotkey_bindings` | Rebind + persistence |
| Events `engine://record` | `{ count }` pendant le record |
| Events `engine://action` | highlight play (inchangé) |

## Checklist manuelle

1. Record souris/clavier remplit la macro ; un Play ne doit pas ré-enregistrer les clics SendInput.
2. Séquence sélectionne / highlight pendant Play ; édition cellules OK.
3. Action `http.request` vers une URL de test (ex. `https://example.com`).
4. Réglages → capturer une autre touche pour la macro, Sauver, redémarrer : binding conservé ; F9 par défaut sans dialogue caret.
5. `cargo test` dans `src-tauri/crates/engine` ; smoke `npm run tauri dev`.
