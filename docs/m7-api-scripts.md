# m7 — API HTTP & scripts JavaScript

Caster expose des appels HTTP natifs et un runtime JS sandboxé (Boa) pour la logique dans les macros.

## Schema

`schemaVersion` **8** : `http.request.failOnStatus`, `json.path`, `script.run` (+ `scriptId`).

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

## `script.run`

```json
{ "type": "script.run", "source": "…", "timeoutMs": 10000 }
```

ou bibliothèque :

```json
{ "type": "script.run", "scriptId": "mon-script", "timeoutMs": 10000 }
```

### API host `caster`

| API | Rôle |
|-----|------|
| `caster.get(name)` | lit une variable macro |
| `caster.set(name, value)` | écrit une variable (bool / number / string) |
| `caster.log(msg)` | journal moteur |
| `caster.fetch({ method, url, headers, body, timeoutMs })` | HTTP via le moteur (synchrone) → `{ status, body }` |

### Limites (sandbox)

- Pas de FS, process, shell, ni input clavier/souris depuis le script
- Réseau uniquement via `caster.fetch` (pas de XHR/fetch natif)
- Scripts biblio : flag `allowNetwork` ; si faux, `caster.fetch` est refusé
- Inline : réseau autorisé
- Annulation F8 / cancel token respectée autour de l’exécution

### Bibliothèque

Fichiers sous `%APPDATA%/com.steverothier.caster/scripts/*.json`.  
UI : Bibliothèque → filtre **Scripts**.  
IPC : `list_scripts_cmd`, `save_script_cmd`, `delete_script_cmd`, `load_script_cmd`.

### Runtime

Implémentation : **Boa** (`boa_engine`) — pas rquickjs (contraintes Windows / bindgen).
