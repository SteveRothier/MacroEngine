# M3.18 — Paramètres applicatifs (v2)

Organisation des **Paramètres** en rail + panneau dans l’UI v2 (`SettingsView`).

## UI

Rail secondaire + panneau (`general` | `appearance` | `hotkeys` | `process` | `displays` | `maintenance`).

| Section | Contenu |
|---------|---------|
| Général | Mode Simple/Avancé, statut, métriques, fenêtre (sidebar, journal, fermer vers tray, démarrage Windows) |
| Apparence | Thème + swatches, HUD overlay (opacité, moniteur) — distinct de l’overlay zones Clicker |
| Raccourcis | `HotkeySettings` v2 (F6 mods, F9, F8, hors focus, conflits VK) |
| Processus | Filtre allow/deny + liste + exe premier plan live |
| Écrans | Sélecteur `list_displays` / `displayId` (géométrie · scale · primaire) |
| Maintenance | Reset clicker, chemins réels, export/import JSON, vider corbeille, À propos (version cargo) |

Champs `AppSettings` ajoutés : `sidebarCollapsed`, `journalOpen`, `closeToTray`, `overlayOpacity`, `startWithWindows`. Thème : `settings.json` source de vérité, localStorage cache de boot.

> **Presets** : gérés via la bibliothèque latérale sur l’onglet Clicker (import/export menu ⋯), plus de section « presets » dans le rail Paramètres.
> **Clicker** : timing, zones, limites restent dans ClickerStudio — pas d’éditeur clicker dans Paramètres.

## Zones (onglet Clicker)

| Élément | Détail |
|---------|--------|
| **ZoneMap** | Éditeur visuel coins / bords / zones custom (resize poignées). |
| **Overlay zones** | Interrupteur distinct du HUD statut ; sync `push_zone_overlay_state` à l’écran. |
| **Dessin** | `drawSafetyZone()` → overlay natif ; zones sécurité ou **zones clic**. |
| **Timing avancé** | `cpsMin` / `cpsMax`, `clickZoneOrder` (aléatoire / séquence). |
| **Écran cible** | Sélecteur dans Paramètres → Écrans. |

## Processus

- Persisté dans `AppSettings.processFilter` (`enabled`, `mode` allow\|deny, `names`).
- Le moteur lit l’exe au premier plan à chaque tick. **deny** : skip si listé ; **allow** : skip si absent. La session continue.
- Même filtre appliqué aux **macros** en lecture (indicateur dans l’éditeur macro).
- Édition désactivée si le moteur est en cours.

## Vérif

```bash
npm run typecheck
npm test
npm run test:rust
npm run tauri dev
```

Smoke : [`smoke-checklist.md`](smoke-checklist.md) (overlay zones, import preset, filtre process).
