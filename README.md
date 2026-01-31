# MacroEngine

**MacroEngine** est un logiciel Windows pour créer et exécuter des macros clavier et souris. Enregistrez vos actions, modifiez-les facilement, et automatisez vos tâches répétitives.

## Fonctionnalités principales

- **Enregistrement en temps réel** : Capturez vos actions clavier et souris automatiquement
- **Édition visuelle** : Modifiez vos macros avec une interface intuitive
- **Raccourcis personnalisés** : Lancez vos macros depuis n'importe où avec des touches personnalisables
- **Répétition flexible** : Répétez vos macros une fois, plusieurs fois, ou en boucle infinie
- **Conditions avancées** : Créez des macros intelligentes qui réagissent à l'état de votre système
- **Applications cibles** : Limitez vos macros à certaines applications uniquement
- **Profils de macros** : Organisez vos macros par contexte d'utilisation

## Cas d'usage

- Automatiser des tâches répétitives dans vos applications
- Créer des raccourcis personnalisés pour des séquences complexes
- Optimiser votre workflow avec des macros conditionnelles
- Tester des interfaces utilisateur avec des actions automatisées

## Prérequis

- **Windows 10/11**
- **.NET 8.0** ou supérieur
- **Privilèges administrateur** (requis pour les raccourcis globaux)

## Lancement rapide

### Compilation

```bash
dotnet build MacroEngine.csproj
```

### Exécution

```bash
dotnet run --project MacroEngine.csproj
```

### Avec privilèges administrateur

```powershell
.\run-as-admin.ps1
```

## Utilisation de base

1. **Enregistrer une macro** : Cliquez sur "● Enregistrer", effectuez vos actions, puis "■ Arrêter"
2. **Exécuter une macro** : Sélectionnez-la et cliquez sur "▶ Exécuter" ou utilisez le raccourci (F10 par défaut)
3. **Modifier une macro** : Double-cliquez sur une macro pour ouvrir l'éditeur
4. **Configurer un raccourci** : Dans l'éditeur, définissez un raccourci personnalisé pour chaque macro

### Types d'actions et options

| Type | Options |
|------|---------|
| **Touche** | Type : Presser, Maintenir, Relâcher. Modificateurs : Ctrl, Alt, Shift, Win. Touche principale configurable. **Maintenir** : durée optionnelle (ms) — maintien pendant X ms puis relâche automatique. Relâchement automatique de toutes les touches maintenues à la fin de la macro. |
| **Clic** | Type : Clic gauche/droit/milieu, Maintenir, Double-clic, Déplacer, Molette haut/bas, **Scroll continu**. Position (X, Y) ou position actuelle. Delta pour molette. Déplacer : relatif/absolu, vitesse (instantané/rapide/graduel), courbe d’accélération, **Maintenir** : durée optionnelle (ms). **Scroll continu** : molette pendant X ms, direction (haut/bas), intervalle (ms). **Clic conditionnel** : clic seulement si le curseur est dans une zone (X1,Y1–X2,Y2). **Aperçu** : affichage visuel de la position X/Y. Déplacer : relatif/absolu, vitesse, trajectoire Bézier. |
| **Texte** | Texte à saisir. **Coller** : coller tout d’un coup (Ctrl+V). Sinon : **Vitesse** (délai en ms entre caractères) ou **Frappe naturelle** (délai aléatoire min–max en ms). **Effacer avant** : Ctrl+A puis Suppr avant de saisir. **Masquer dans les logs** : ne pas afficher le texte dans les logs (mots de passe). **Variables** : utilisez `{nomVariable}` dans le texte — la valeur est substituée à l'exécution. |
| **Variable** | **Nom** : nom de la variable (lettres, chiffres, tirets bas). **Type** : Nombre, Texte ou Booléen. **Opération** : **Définir** (valeur ou expression), **Incrémenter** / **Décrémenter** (avec **Pas** configurable, pour nombres), **Inverser** (pour booléens), **Expression**. Les variables sont partagées pendant l'exécution de la macro et utilisables dans les conditions **Si**, dans l'action Texte et dans l'action Délai (basé sur variable). |
| **Délai** | Durée. Unité : ms, s ou min. Option **aléatoire** : entre une durée min et max. **Basé sur variable** : durée = valeur de la variable × multiplicateur. **Jitter (%)** : variation aléatoire ±X% autour de la valeur. |
| **Répéter** | Mode : Une fois, Nombre (X fois), Infini. Nombre de répétitions. Délai entre chaque répétition (ms/s/min). Liste d’actions imbriquées. |
| **Si** | Conditions multiples avec opérateurs ET/OU. Types : application active, touche enfoncée, processus en cours, couleur pixel, position souris, date/heure, image à l’écran, texte à l’écran, **variable**. **Groupes de conditions** : (A ET B) OU (C ET D) — chaque groupe = conditions en ET, les groupes en OU ; interface **mode groupes**. **Mode debug** : afficher quelle condition a échoué. **Else If** : branches facultatives. Blocs **Alors** et **Sinon** avec actions imbriquées. |

## Statut du projet

🚧 **En développement actif** - Le projet évolue régulièrement avec de nouvelles fonctionnalités.

## Support

Pour signaler un bug ou proposer une fonctionnalité, ouvrez une issue sur le dépôt.
