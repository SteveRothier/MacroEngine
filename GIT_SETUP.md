# Configuration Git - MacroEngine

Le projet est maintenant configuré pour Git.

## Fichiers de configuration Git

- **`.gitignore`** : Exclut les fichiers de build, cache, et données utilisateur
  - Dossiers `bin/` et `obj/` (fichiers de compilation)
  - Fichiers de données utilisateur (`Data/*.json`)
  - Fichiers de cache NuGet et Visual Studio
  - Fichiers temporaires et générés

- **`.gitattributes`** : Configure la gestion des fins de ligne
  - Fichiers texte avec fin de ligne CRLF (Windows)
  - Fichiers binaires correctement identifiés

## Prochaines étapes

### 1. Vérifier les fichiers à committer

```bash
git status
```

### 2. Créer le premier commit

```bash
git commit -m "Initial commit - MacroEngine project"
```

### 3. (Optionnel) Ajouter un dépôt distant

Si vous avez déjà créé un dépôt sur GitHub, GitLab, etc. :

```bash
git remote add origin <URL-DU-DEPOT>
git branch -M main
git push -u origin main
```

### 4. Vérifier que les fichiers de données sont bien exclus

Les fichiers suivants sont exclus de Git (normal) :
- `Data/macros.json` (données utilisateur)
- `Data/profiles.json` (données utilisateur)
- `bin/` (fichiers compilés)
- `obj/` (fichiers temporaires de build)

Le dossier `Data/` est conservé grâce au fichier `Data/.gitkeep`.

## Commandes Git utiles

```bash
# Voir les fichiers modifiés
git status

# Ajouter tous les fichiers modifiés
git add .

# Créer un commit
git commit -m "Description des changements"

# Voir l'historique des commits
git log

# Créer une nouvelle branche
git checkout -b feature/nom-de-la-fonctionnalite

# Revenir sur la branche principale
git checkout main
```

