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

## Statut du projet

🚧 **En développement actif** - Le projet évolue régulièrement avec de nouvelles fonctionnalités.

## Support

Pour signaler un bug ou proposer une fonctionnalité, ouvrez une issue sur le dépôt.
