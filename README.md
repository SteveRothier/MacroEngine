# MacroEngine - Moteur de Macros Clavier et Souris

## Description

MacroEngine est un logiciel Windows de macros clavier et souris haute performance, conçu pour supporter des fréquences élevées (jusqu'à 1000 CPS) et fonctionner en plein écran.

## Architecture

Le projet suit une architecture modulaire et extensible avec séparation des responsabilités :

- **Core**: Logique métier et moteur d'exécution
- **UI**: Interface utilisateur WPF
- **Data**: Fichiers de configuration et données persistantes

## Fonctionnalités

- ✅ Simulation d'entrées clavier et souris via SendInput
- ✅ Support haute fréquence (1000 CPS)
- ✅ Hooks globaux pour capturer les événements
- ✅ Système de profils de macros
- ✅ Architecture extensible avec plugins
- ✅ Interface WPF moderne et évolutive
- ✅ Éditeur de macros visuel
- ✅ Éditeur de timeline

## Structure du Projet

```
MacroEngine
├─ Core
│  ├─ Hooks          # Hooks système pour capturer les entrées
│  ├─ Inputs         # Actions d'entrée (clavier, souris, délai)
│  ├─ Engine         # Moteur d'exécution de macros
│  ├─ Profiles       # Gestion des profils
│  ├─ Plugins        # Système de plugins
│  └─ Models         # Modèles de données
├─ UI                # Interface WPF
└─ Data              # Fichiers de données
```

## Prérequis

- .NET 6.0 ou supérieur
- Windows 10/11
- Visual Studio 2022 ou VS Code avec extensions C#

## Compilation

```bash
dotnet build MacroEngine.csproj
```

## Exécution

```bash
dotnet run --project MacroEngine.csproj
```

## Installation avec privilèges administrateur

Pour lancer l'application avec les privilèges administrateur (nécessaire pour les hooks globaux) :

```powershell
.\run-as-admin.ps1
```

Ou manuellement en tant qu'administrateur :

```bash
dotnet run --project MacroEngine.csproj
```

## Développement

### Cloner le dépôt

```bash
git clone <url-du-depot>
cd MacroEngine
```

### Contributions

1. Créer une branche pour votre fonctionnalité (`git checkout -b feature/ma-fonctionnalite`)
2. Committer vos changements (`git commit -am 'Ajout de ma fonctionnalité'`)
3. Pousser vers la branche (`git push origin feature/ma-fonctionnalite`)
4. Ouvrir une Pull Request

## Notes

- L'application nécessite des privilèges administrateur pour utiliser les hooks globaux
- Les macros sont sauvegardées au format JSON dans le dossier `Data/`
- Le système de plugins permet d'étendre les fonctionnalités
- Les fichiers de données utilisateur (`Data/*.json`) ne sont pas versionnés dans Git

