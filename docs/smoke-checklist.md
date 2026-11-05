# Checklist smoke — Caster

Vérifications manuelles rapides après une build ou un gros changement.

## Boot & shell

- [ ] Fenêtre principale : `visible: false` au lancement, affichage via `show_main_when_frontend_ready` (show-when-ready, pas de délai artificiel)
- [ ] Splash boot disparaît après le premier paint ; panneau bibliothèque sans skeleton shimmer au rechargement silencieux
- [ ] L’app démarre (bibliothèque + empty state ou dernier onglet, moteur idle)
- [ ] F6 démarre/arrête le clicker (mode toggle)
- [ ] F9 lance la macro chargée (ou fallback global)
- [ ] F8 arrêt d’urgence
- [ ] Tray : Relancer dernier clicker / macro / **script** (avec `trayRelaunchLast`)
- [ ] Paramètres : « Démarrer caché (tray) » ≠ « Fermer vers tray » ≠ « Réduire vers tray »
- [ ] Minimize Windows avec « Réduire vers tray » → fenêtre masquée (tray), pas juste minimisée

## Clicker

- [ ] Titlebar `⋯` : Verrouiller / Déverrouiller en tête du menu (plus de cadenas standalone)
- [ ] Overlay zones : activer « Afficher » → bandes visibles sur l’écran cible
- [ ] Dessiner zone sécurité et zone clic (`begin_zone_overlay_draw`)
- [ ] Zone pause / arrêt / démarrer : curseur dans zone → comportement attendu
- [ ] Zone **Démarrer** pendant une session en pause (F7 ou pause pixel) → la session reprend et l’état repasse en Running
- [ ] Sélecteur d’écran (`list_displays` / `set_active_display`)
- [ ] Titlebar clicker : bouton moniteur (DisplayPopover Esc / focus)
- [ ] Filtre processus allow/deny bloque ou autorise les ticks
- [ ] Filtre bloquant : stats session affichent « N ticks bloqués » et le journal logge au 1er blocage puis tous les 100
- [ ] Filtre par preset : `inherit` / `off` / `local` (liste locale d’.exe éditable dans l’onglet Entrée)
- [ ] Multi-moniteur : dessin de zone sur l’écran secondaire → rectangle aux bonnes coordonnées (origine non nulle, DPI ≠ 100 %)
- [ ] Modèles : « Impulsion haute cadence » et « Sécurité coins seuls » appliqués depuis la barre d’outils
- [ ] « Sauver comme nouveau preset » → nouveau preset créé, son onglet s’ouvre, l’onglet courant reste inchangé
- [ ] « Capturer des points » (onglet Cible) : clics à l’écran → points ajoutés (clics répétés au même endroit = compteur), Échap annule
- [ ] Points : multi-sélection Shift/Ctrl + barre bulk (dupliquer / supprimer)
- [ ] Points : une ligne (X Y × R ms) ; clic dehors désélectionne ; croix rouge au survol
- [ ] Zones custom : multi-sélection + supprimer / amener devant
- [ ] Zones : clic dehors (hors carte) désélectionne coins / bords / custom
- [ ] Condition pixel : Activée on/off (hauteur stable) ; pastilles Réf/Live ; InfoTip i ; Arrêt/Pause
- [ ] Condition pixel runtime : hors tolérance → toast + journal (arrêt ou pause)
- [ ] Overlay statut session : pastille visible en Running/Pause (clics · durée · CPS) ; Pause/Reprendre + Stop ; clic zone texte → focus app ; réglages manuels pixel restent fermés au seul toggle Activée
- [ ] Écran retiré : titlebar indique l’écran actif manquant ; fallback primaire

## Macros

- [ ] Titlebar `⋯` : Verrouiller / Déverrouiller, Dupliquer, Importer / Exporter (plus de cadenas standalone)
- [ ] Liste : scrollbar collée au bord droit, du sous la barre d’outils jusqu’en bas ; pas de pastille / icône de type (colonne Action suffit)
- [ ] `+ Ajouter` : menu écarté du bouton ; lignes compactes ; pas de hints techniques (`mouse.click`)
- [ ] Capture : démarrer, pause/reprise, souris seule ou clavier seul
- [ ] Post-traitement : délais courts fusionnés après stop
- [ ] Séquence : réordonner racine et branches `then`/`else`, éditer un délai en cellules
- [ ] Éditeur **liste** : multi-sélection (Shift/Ctrl), barre bulk (monter/descendre/**dupliquer**/supprimer) ; undo groupé ; plus de vue graphe
- [ ] Convertir macro → script **ou clicker** depuis la bibliothèque (plus depuis la titlebar)
- [ ] Convertir macro multi-points → preset clicker (séquence de points)
- [ ] Convert soft-fail : macro avec clics + non-clics → clicker créé + warnings `dropped` (pas d’échec total)
- [ ] Coller multi : copier plusieurs actions → coller après (clipboard interne)
- [ ] `control.if` avec `process.eq` / `process.contains`
- [ ] `control.while` avec garde `maxIterations`
- [ ] Filtre process par macro : inherit / off / local
- [ ] `process.run` avec `wait: false` ou timeout

## Scripts

- [ ] Ouvrir un script depuis la bibliothèque
- [ ] Titlebar `⋯` : Verrouiller / Déverrouiller en tête (avec module / dry-run / step) ; plus de cadenas standalone
- [ ] **Run** session autonome ; **Stop** / F8
- [ ] Dry-run : toggle titlebar → badge visible, pas d’effet host, lignes `dry-run skipped` en console
- [ ] **Pas à pas** : pause avant effets de bord → Continuer
- [ ] Permission refusée (ex. `fetch` sans réseau) → toast indiquant le flag à activer
- [ ] Convertir script → macro (envelopper) ou **→ clicker** depuis la bibliothèque
- [ ] Snippets / aide API : inserts keyTap, runProcess, clipboard
- [ ] Console vide : CTA « Exécuter »
- [ ] Erreur / lint avec n° de ligne : clic console → curseur sur la ligne

## Bibliothèque + éditeur

- [ ] Layout : bibliothèque gauche + éditeur droite ; pas de page Accueil / onglet Accueil
- [ ] Bibliothèque repliable + bouton pour rouvrir
- [ ] Favoris / Récents / dossiers + recherche + `+ Créer` (crée dans le dossier focusé)
- [ ] Clic item → ouvre onglet doc ; empty state si aucun doc
- [ ] Play / Stop dans la titlebar éditeur (pas de barre d’exécution bas)
- [ ] Supprimer depuis le menu contextuel → suppression définitive + fermeture de l’onglet ouvert
- [ ] Onglets docs (macro / clicker / script) sans bouton « retour Accueil »
- [ ] Fermer dernier onglet → empty state (pas Accueil)
- [ ] Densité compacte / tokens Linear (IBM Plex, accent bleu)

## Données

- [ ] Paramètres → Données : export/import **settings.json**
- [ ] Export/import **bibliothèque ZIP** (macros + clickers + scripts + index)
- [ ] Journal : persiste après relaunch ; recherche, filtre **Erreurs / warn**, Suivre ; Esc ferme
- [ ] Paramètres → Données : vider / purge corbeille résiduelle (legacy soft-delete)

## Release (tag)

- [ ] CI job `release` produit un artefact NSIS/MSI sur tag `v*`

## Build installateur local (sans CI)

```powershell
npm run tauri build
```

Artefact NSIS : `src-tauri/target/release/bundle/nsis/` (cible `bundle.targets: ["nsis"]` dans `src-tauri/tauri.conf.json`).
Smoke hors dev : démarrage → bibliothèque → F6 une fois → quit.
