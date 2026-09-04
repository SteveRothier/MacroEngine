# M6 — Macros : éditeur, triggers, conditions

Roadmap produit pour l’éditeur macros après la bibliothèque unifiée (M5). État **livré** au fil des phases 1–3.

## Phase 1 — Parité éditeur (livré)

| Livrable | Détail |
|----------|--------|
| **DnD imbriqué** | Réordonner une action dans `then` / `else` depuis la liste (`reorderAtPath`). |
| **Menu sur branche** | `AddMenu` identique à la racine pour + Alors / + Sinon (plus de `key.tap` forcé). |
| **Triggers modificateurs** | `trigger: { type: "hotkey", key, mods?: { ctrl, alt, shift } }` — validation vk+mods au save. |
| **Indicateur filtre process** | Badge / hint quand le filtre global Paramètres bloque l’exécution (symétrie clicker). |

## Phase 2 — Timeline & capture (livré)

| Livrable | Détail |
|----------|--------|
| **Timeline `control.if`** | DnD + resize délai dans les branches then/else (`TimelineTrack`). |
| **Capture pause** | `pause_record` / `resume_record` ; état `paused` dans `get_record_state`. |
| **Filtres capture** | Options souris seule / clavier seul à `start_record`. |
| **Post-traitement** | Fusion délais courts, simplification moves à l’arrêt. |

## Phase 3 — Conditions & filtre par macro (livré)

| Livrable | Détail |
|----------|--------|
| **Prédicats process** | `process.eq`, `process.contains` dans `eval_condition` (exe au premier plan). |
| **`control.while`** | Boucle tant que condition vraie ; garde `maxIterations` (défaut 10 000). |
| **Filtre process par macro** | `processFilter`: `inherit` \| `off` \| `local` + `localProcessFilter`. |
| **`process.run` async** | `wait: false` ou `timeoutMs`. |

## Schéma

- **v6** : actions clavier/souris, `control.if`, triggers hotkey.
- **v7** : `control.while`, filtre process par macro, champs `wait`/`timeoutMs` sur `process.run`, mods sur trigger.

## Hotkeys (référence)

| Touche | Rôle |
|--------|------|
| F6 (+ mods optionnels) | Clicker |
| F9 | Macro global (fallback macro active) |
| F8 | Urgence |
| (par macro) | Trigger dédié optionnel (VK + Ctrl/Alt/Shift) |

## IPC utiles

`list_macro_library`, `start_record({ replace?, mouseOnly?, keyboardOnly? })`, `pause_record`, `resume_record`, `get_record_state`, `get_foreground_exe`, CRUD `*_saved_macro`, `set_hotkey_bindings`.

## Vérif smoke

Voir [`smoke-checklist.md`](smoke-checklist.md) : triggers modificateurs, réordonnancement branche, filtre process macro.

## Hors scope

Headers HTTP avancés, sync cloud, port non-Windows.

## Record avancé (livré)

- Moves souris libres (sans bouton).
- Hold clavier multi-touche + `key.down` après seuil tap.
- UI liste : geste drag libellé Glisser / Trajectoire / Fin glisser.
