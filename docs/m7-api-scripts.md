# m7 — API HTTP & scripts JavaScript

Caster expose des appels HTTP natifs et un runtime JS sandboxé (Boa) pour la logique dans les macros et en session autonome.

## Schema

`schemaVersion` **8** : `http.request.failOnStatus`, `json.path`, `script.run` (`scriptId`, `params`, `resultVar`).

## `http.request`

- Méthodes, URL / body / headers avec interpolation `{{var}}`
- `statusVar` / `bodyVar`
- `failOnStatus: true` → erreur si status ≥ 400
- UI : bouton **+ Bearer** → `Authorization: Bearer {{token}}`

## `json.path`

```json
{ "type": "json.path", "sourceVar": "body", "path": "user.name", "destVar": "name" }
```

Chemin pointé simple (`a.b.0.c`), pas de JSONPath complet.

## `script.run` (M3a)

```json
{
  "type": "script.run",
  "scriptId": "mon-script",
  "timeoutMs": 10000,
  "params": { "label": "world" },
  "resultVar": "scriptResult"
}
```

ou source inline via `source`.

### `@param`

```js
//@param clicks number 10
// @param label string hello
//@param enabled boolean true
```

- Formulaire dans l’éditeur + props d’action `script.run`
- Persistance : `ScriptDoc.paramValues`
- Injection : params action → valeurs biblio → défauts `@param`

### Retour

`caster.return(x)` (ou résultat de l’IIFE) → variable `resultVar`.

## Console (M3b)

Panneau sous l’éditeur : logs `script:` et messages de session / erreurs Boa (`engine://log`).

## API host `caster`

| API | Permission | Rôle |
|-----|------------|------|
| `get` / `set` | — | Variables macro |
| `log` | — | Journal (`script: …`) |
| `return` | — | Valeur pour `resultVar` |
| `fetch` | `allowNetwork` | HTTP synchrone → `{ status, body }` |
| `clipboardRead` / `clipboardWrite` | `allowClipboard` | Presse-papiers (M4a) |
| `readFile` / `writeFile` | `allowFs` | Uniquement sous `script-data/` (M4a) |
| `runMacro(macroId)` | `allowMacroControl` | Macro imbriquée, profondeur max 3 (M4b) |

**Exclu :** `mouse` / `keyboard` / `process` / `window` / `screen` depuis JS.

## Session autonome (M5)

- **Run** titlebar → `run_script_session_cmd`
- **Stop** / **F8** → `request_cancel` (même jeton que macros)
- Exclusion mutuelle clicker / macro / record / script

## Éditeur (M6) — décision

Conserver le **textarea** monospace. Monaco, coloration avancée ou debugger step **uniquement** si la complexité réelle des scripts et l’usage le justifient. Hors engagement actuel.

## Exemples (presets UI)

Catalogue `SCRIPT_PRESETS` (appliqués à la demande, pas seedés sur disque) :

| Id | Nom | Permissions |
|----|-----|-------------|
| `hello-param` | Hello + @param | — |
| `http-get` | HTTP GET JSON | Réseau |
| `clip-roundtrip` | Presse-papiers | Presse-papiers |
| `fs-note` | Note sandbox | Fichiers |
| `run-macro` | Lancer une macro | Macros |

Surfaces : menu Exemples de l’éditeur Script ; mode Inline des props `script.run`.

## Bibliothèque

`%APPDATA%/com.steverothier.caster/scripts/*.json`  
IPC : `list` / `load` / `save` / `delete` / `run_script_session_cmd`  
Flags doc : `allowNetwork`, `allowClipboard`, `allowFs`, `allowMacroControl`, `paramValues`

## Runtime

**Boa** (`boa_engine`) — pas rquickjs (contraintes Windows / bindgen).
