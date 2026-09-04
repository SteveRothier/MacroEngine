# M5 — Portage maquette UI

Portage de la maquette HTML Caster dans l’app React/Tauri (tokens, shell, écrans), sans changer le moteur Rust.

## Livré

- **Tokens** : palette maquette (`--surface`, `--text-muted`, `--tb-h` / `--sb-h`, accent `#2F6FED`, radii 5/7/8), IBM Plex Mono pour les chips.
- **Primitives** : `KbdChip`, `EmptyState`, boutons / cards alignés.
- **Shell** : marque accent, nav à soulignement, pill statut moteur, toggle thème, statusbar fine, **dock flottant** centré quand une session tourne.
- **Accueil** : hub 2 colonnes (état + CTA + preset / accès rapide + raccourcis live).
- **Clicker** : layout `1fr + ~300px` avec **carte session** (stats + Démarrer/Arrêter). Simple masque le bloc avancé.
- **Macros** : panneau liste + canvas timeline/liste + empty state.
- **Paramètres** : rail + panes (sans section Comportement clicker).
- **À propos** : carte centrée marque / version / licence.

## Hors scope

Filtre process OS réel, thème « système », clone pixel-parfait des micro-interactions JS de la maquette, redesign timeline VM.

## Vérif

```bash
npx tsc --noEmit
```
