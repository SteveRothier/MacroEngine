# MacroEngine - Moteur de Macros Clavier et Souris

## Description

MacroEngine est un logiciel Windows de macros clavier et souris haute performance, conçu pour supporter des fréquences élevées (jusqu'à 1000 CPS) et fonctionner en plein écran. Il permet d'enregistrer, modifier et exécuter des séquences d'actions clavier et souris avec précision.

## Architecture

Le projet suit une architecture modulaire et extensible avec séparation des responsabilités :

- **Core**: Logique métier et moteur d'exécution
  - **Engine**: Moteur d'exécution de macros avec gestion des états
  - **Inputs**: Actions d'entrée (clavier, souris, délai)
  - **Hooks**: Hooks système Windows pour capturer les événements globaux
  - **Logging**: Système de logs modulaire et thread-safe
  - **Storage**: Gestion de la persistance (macros, configuration, profils)
  - **Processes**: Surveillance des applications et détection du premier plan
  - **Profiles**: Système de profils de macros
  - **Plugins**: Architecture extensible avec plugins
  - **Models**: Modèles de données
- **UI**: Interface utilisateur WPF moderne et réactive
- **Data**: Fichiers de configuration et données persistantes
- **Logs**: Journaux d'activité avec rotation quotidienne

## Fonctionnalités

### Enregistrement et Exécution
- ✅ Enregistrement en temps réel des actions clavier et souris
- ✅ **Enregistrement des clics souris** avec option activable/désactivable
- ✅ Exécution précise des macros avec préservation des délais
- ✅ Support haute fréquence (jusqu'à 1000 CPS)
- ✅ Simulation d'entrées clavier et souris via SendInput
- ✅ Pause/Reprise de l'exécution
- ✅ Arrêt d'urgence des macros

### Répétition de Macros
- ✅ **3 modes de répétition** :
  - Une seule fois (défaut)
  - Répéter X fois (nombre configurable)
  - Jusqu'à interruption (boucle infinie)
- ✅ **Délai configurable** entre chaque répétition (en ms)
- ✅ Affichage du statut en temps réel ("Exécution 2/5...")
- ✅ Arrêt propre à tout moment

### Raccourcis Clavier
- ✅ Raccourcis globaux configurables pour exécuter/arrêter les macros (par défaut F10/F11)
- ✅ Raccourcis individuels par macro
- ✅ **Mode toggle** : le raccourci de la macro lance ET arrête la macro
- ✅ Détection automatique des conflits entre raccourcis
- ✅ Configuration via l'interface de paramètres

### Détection d'Application
- ✅ **Applications cibles** : limiter une macro à certaines applications
- ✅ Sélection parmi les processus en cours avec icônes
- ✅ Raccourcis actifs uniquement dans les applications sélectionnées
- ✅ Support de plusieurs applications par macro

### Édition et Gestion
- ✅ Éditeur de macros visuel avec liste des actions
- ✅ Modification des propriétés de macro (nom, description)
- ✅ Undo/Redo pour les modifications
- ✅ Suppression et création de macros
- ✅ Import/Export de macros au format JSON
- ✅ Sauvegarde automatique après modifications

### Système de Logs
- ✅ Logs horodatés avec niveaux (Debug, Info, Warning, Error)
- ✅ Capture des exceptions avec stack traces
- ✅ Écriture dans fichier avec rotation quotidienne (`Logs/macros_YYYY-MM-DD.log`)
- ✅ Affichage en temps réel dans l'interface (fenêtre Journaux)
- ✅ Filtrage par niveau de log
- ✅ Thread-safe et performant

### Configuration
- ✅ Configuration des raccourcis globaux
- ✅ Persistance de la configuration dans `Data/config.json`
- ✅ Validation des raccourcis (empêche les doublons)

### Profils
- ✅ Système de profils de macros
- ✅ Activation/désactivation de profils
- ✅ Gestion des collections de macros par profil

### Architecture Extensible
- ✅ Interface de plugins pour étendre les fonctionnalités
- ✅ Séparation Core/UI pour maintenabilité
- ✅ Injection de dépendances pour le logging

## Structure du Projet

```
MacroEngine
├─ Core
│  ├─ Engine         # Moteur d'exécution de macros
│  ├─ Hooks          # Hooks système pour capturer les entrées
│  ├─ Inputs         # Actions d'entrée (clavier, souris, délai)
│  ├─ Logging        # Système de logs modulaire
│  ├─ Models         # Modèles de données
│  ├─ Plugins        # Système de plugins
│  ├─ Processes      # Surveillance des applications
│  ├─ Profiles       # Gestion des profils
│  └─ Storage        # Persistance des données
├─ UI                # Interface WPF
│  ├─ AppSelectorDialog   # Dialogue de sélection d'applications
│  ├─ LogsWindow          # Fenêtre des journaux
│  ├─ MacroEditor         # Éditeur de macros
│  ├─ MainWindow          # Fenêtre principale
│  ├─ MouseActionDialog   # Dialogue d'action souris
│  ├─ ProfileEditor       # Éditeur de profils
│  └─ SettingsWindow      # Fenêtre de configuration
├─ Data              # Fichiers de données
│  ├─ macros.json    # Macros sauvegardées
│  ├─ config.json    # Configuration de l'application
│  └─ profiles.json  # Profils de macros
└─ Logs              # Journaux d'activité (rotation quotidienne)
```

## Prérequis

- **.NET 8.0** ou supérieur
- **Windows 10/11**
- **Visual Studio 2022** ou **VS Code** avec extensions C#
- **Privilèges administrateur** (requis pour les hooks globaux)

## Installation et Compilation

### Compilation

```bash
dotnet build MacroEngine.csproj
```

### Exécution

```bash
dotnet run --project MacroEngine.csproj
```

### Installation avec privilèges administrateur

Pour lancer l'application avec les privilèges administrateur (nécessaire pour les hooks globaux) :

```powershell
.\run-as-admin.ps1
```

Ou manuellement en tant qu'administrateur :

```bash
dotnet run --project MacroEngine.csproj
```

## Utilisation

### Enregistrement d'une Macro

1. Cliquez sur le bouton **"● Enregistrer"**
2. Effectuez les actions clavier/souris à enregistrer
3. Cliquez sur **"■ Arrêter"** pour terminer l'enregistrement
4. La macro apparaît dans la liste et peut être modifiée dans l'éditeur

### Exécution d'une Macro

1. Sélectionnez une macro dans la liste
2. Cliquez sur **"▶ Exécuter"** ou utilisez le raccourci global (F10 par défaut)
3. Utilisez le raccourci d'arrêt (F11 par défaut) pour arrêter l'exécution

### Configuration des Raccourcis

1. Allez dans **Paramètres → Configuration**
2. Cliquez sur **"Modifier"** pour chaque raccourci (Exécuter/Arrêter)
3. Appuyez sur la touche souhaitée
4. La configuration est sauvegardée automatiquement

### Raccourcis par Macro

1. Ouvrez une macro dans l'éditeur
2. Dans la section **"Raccourci de la Macro"**, cliquez sur **"Modifier"**
3. Appuyez sur la touche souhaitée
4. Le raccourci est sauvegardé avec la macro
5. Utilisez ce raccourci depuis n'importe où pour exécuter la macro
6. **Appuyez à nouveau** sur le même raccourci pour **arrêter** la macro (mode toggle)

### Configuration de la Répétition

1. Ouvrez une macro dans l'éditeur
2. Dans la section **"Répétition"**, choisissez le mode :
   - **Une seule fois** : exécution simple
   - **Répéter X fois** : indiquez le nombre de répétitions
   - **Jusqu'à interruption** : boucle infinie jusqu'à arrêt manuel
3. Configurez le **délai entre les répétitions** (en millisecondes)
4. Pour arrêter : utilisez le raccourci de la macro ou F11

### Applications Cibles

1. Ouvrez une macro dans l'éditeur
2. Dans la section **"Applications"**, cliquez sur le menu déroulant
3. Sélectionnez les applications pour lesquelles la macro sera active
4. Si aucune application n'est sélectionnée, la macro fonctionne partout
5. Le raccourci de la macro ne fonctionne que dans les applications sélectionnées

### Consultation des Logs

1. Allez dans **Paramètres → Journaux (Logs)**
2. Filtrez par niveau si nécessaire
3. Consultez les détails d'une entrée en double-cliquant dessus

## Fichiers de Données

- **`Data/macros.json`** : Toutes les macros enregistrées
- **`Data/config.json`** : Configuration de l'application (raccourcis globaux)
- **`Data/profiles.json`** : Profils de macros
- **`Logs/macros_YYYY-MM-DD.log`** : Journaux d'activité (un fichier par jour)

> ⚠️ **Note** : Les fichiers de données utilisateur (`Data/*.json`) ne sont pas versionnés dans Git.

## Développement

### Cloner le dépôt

```bash
git clone <url-du-depot>
cd MacroEngine
```

### Restaurer les dépendances

```bash
dotnet restore
```

### Compiler en mode Release

```bash
dotnet build -c Release
```

### Contributions

1. Créer une branche pour votre fonctionnalité (`git checkout -b feature/ma-fonctionnalite`)
2. Committer vos changements (`git commit -am 'Ajout de ma fonctionnalité'`)
3. Pousser vers la branche (`git push origin feature/ma-fonctionnalite`)
4. Ouvrir une Pull Request

## Architecture Technique

### Système de Logs

Le système de logs est modulaire et thread-safe :

- **ILogger** : Interface principale pour le logging
- **Logger** : Implémentation qui dispatche vers les writers
- **ILogWriter** : Interface pour les sorties de logs
- **FileLogWriter** : Écriture dans fichier avec rotation quotidienne
- **UiLogWriter** : Affichage dans l'interface WPF

Les logs sont configurés avec un niveau minimum (Info par défaut) et capturent automatiquement les exceptions avec leurs stack traces.

### Moteur d'Exécution

Le moteur d'exécution gère plusieurs états :
- **Idle** : Aucune macro en cours
- **Running** : Exécution en cours
- **Paused** : Exécution en pause
- **Stopping** : Arrêt en cours

Les macros s'exécutent de manière asynchrone, permettant à l'interface de rester réactive.

### Hooks Globaux

L'application utilise des hooks Windows de bas niveau pour :
- Capturer les événements clavier/souris lors de l'enregistrement
- Intercepter les raccourcis globaux même hors de l'application
- Fonctionner en arrière-plan

## Notes Importantes

- ⚠️ L'application nécessite des **privilèges administrateur** pour utiliser les hooks globaux
- 📁 Les macros sont sauvegardées au format **JSON** dans le dossier `Data/`
- 🔌 Le système de plugins permet d'étendre les fonctionnalités
- 📝 Les logs sont automatiquement rotés quotidiennement
- ⚡ Le moteur est optimisé pour des fréquences élevées (jusqu'à 1000 CPS)
- 🔒 Les raccourcis en conflit sont détectés et signalés à l'utilisateur

## Licence

[À spécifier]

## Support

Pour signaler un bug ou proposer une fonctionnalité, veuillez ouvrir une issue sur le dépôt.
