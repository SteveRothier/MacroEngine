# M3 — Variables · If/Else

## Contenu

- **Schéma v4** : `var.set`, `control.if` (then/else imbriqués), conditions `eq|ne|gt|lt|gte|lte`.
- **MacroEnv** : variables scalaires (`string` | `number` | `bool`) ; interpolation `{{name}}` dans URL HTTP, command/args process, key.tap.
- **MacroVm** : exécution récursive ; events `engine://action` avec `path` pour highlight nested.
- **UI** : liste indentée + props if/var ; timeline reste une vue top-level.

## Exemple

```json
{
  "schemaVersion": 4,
  "name": "IfVar",
  "trigger": { "type": "manual" },
  "repeatCount": 1,
  "actions": [
    { "id": "v1", "type": "var.set", "name": "n", "value": 2 },
    {
      "id": "i1",
      "type": "control.if",
      "condition": { "left": { "var": "n" }, "op": "gt", "right": 1 },
      "then": [{ "id": "k1", "type": "key.tap", "key": "A" }],
      "else": [{ "id": "k2", "type": "key.tap", "key": "{{k}}" }]
    }
  ]
}
```

## Checklist manuelle

1. `var.set` + `control.if` : branche then vs else selon la condition.
2. Interpolation `{{x}}` dans une URL `http.request`.
3. Liste : sélection / highlight d’actions nested pendant Play.
4. Macros v1–v3 toujours importables / playables.
5. `cargo test` ; smoke `npm run tauri dev`.
