import { defineCatalog } from "../defineCatalog";

/** Script editor UI. */
export const scripts = defineCatalog({
  fr: {
    toolbar: {
      back: "Retour aux automations",
      namePlaceholder: "Nom du script",
      nameAria: "Nom du script",
      saving: "● Enregistrement…",
      saved: "● Enregistré",
      saveError: "● Erreur d’enregistrement",
      saveErrorTip: "Échec de l’enregistrement. Nouvelle tentative en cours…",
      run: "Exécuter",
      runTip: "Exécuter le script",
      stop: "Arrêter (F8)",
      stopTip: "Arrêter (F8)",
      busyClicker: "un clicker",
      busyRecord: "un enregistrement",
      busyScript: "un autre script",
      busyMacro: "une macro",
      busyTip:
        "Impossible de lancer le script : {label} est déjà en cours. Arrêtez (F8) avant de continuer.",
      snippets: "Snippets",
      snippetsAria: "Exemples et snippets",
      examples: "Exemples",
      snipGet: "GET JSON",
      snipSet: "get / set / return",
      snipParam: "Template @param",
      snipClick: "click + sleep",
      snipKey: "keyTap",
      snipInclude: "include module",
      sourceAria: "Source JavaScript",
      loadingAria: "Chargement du script",
      notFound: "Script introuvable.",
    },
    console: {
      title: "Console",
      errorsTip: "Erreurs",
      clear: "Effacer",
      clearMenu: "Effacer la console",
      expand: "Déplier la console",
      collapse: "Replier la console",
      resizeAria: "Redimensionner la console",
      empty:
        "Aucune activité pour l’instant. Lancez le script pour voir les logs ici.",
      menuAria: "Actions de la console",
      sessionStart: "Session · démarrage",
      cancelRequested: "Annulation demandée (F8)",
    },
    permissions: {
      label: "Permissions",
      labelCount: "Permissions ·{count}",
      advanced: "Avancé",
      network: "Réseau",
      networkTip:
        "Autorise caster.fetch — le script peut envoyer des requêtes réseau.",
      clipboard: "Presse-papiers",
      clipboardTip: "Le script peut lire et écrire le presse-papiers système.",
      input: "Souris / clavier",
      inputTip:
        "Autorise caster.click, moveTo, keyTap, sleep — injection souris/clavier.",
      fs: "Fichiers (sandbox)",
      fsShort: "Fichiers",
      fsTip:
        "Lecture/écriture limitée au dossier script-data/ de Caster — aucun autre accès disque.",
      macros: "Macros (profondeur 3)",
      macrosShort: "Macros",
      macrosTip:
        "Le script peut lancer d’autres macros via runMacro (profondeur max 3).",
      process: "Processus",
      processShort: "Process",
      processTip:
        "Autorise caster.runProcess — lancer des exécutables (équivalent process.run).",
    },
    language: {
      label: "Langage",
      javascript: "JavaScript",
      typescript: "TypeScript",
    },
    module: {
      label: "Module bibliothèque",
      tip: "Destiné à caster.include — pas un runner Accueil principal.",
    },
    presets: {
      helloParam: {
        name: "Hello + @param",
        description: "Découverte des paramètres et de caster.return",
      },
      httpGet: {
        name: "HTTP GET JSON",
        description: "caster.fetch → variables status / body",
      },
      clipRoundtrip: {
        name: "Presse-papiers",
        description: "Lire puis réécrire le presse-papiers",
      },
      fsNote: {
        name: "Note sandbox",
        description: "Lire/écrire notes.txt sous script-data/",
      },
      runMacro: {
        name: "Lancer une macro",
        description: "caster.runMacro (profondeur max 3)",
      },
      clickSleep: {
        name: "Click + sleep",
        description: "Clic souris puis pause (permission Input)",
      },
    },
    toast: {
      networkDenied:
        "Erreur : caster.fetch a échoué — le script n’a pas la permission Réseau. Activez-la dans Permissions si c’est voulu.",
      errorPrefix: "Erreur : {detail}",
    },
    confirm: {
      replaceTitle: "Remplacer le code",
      replaceMessage:
        "Remplacer le code actuel par l’exemple « {name} » et aligner les permissions ?",
      replaceConfirm: "Remplacer",
    },
  },
  en: {
    toolbar: {
      back: "Back to automations",
      namePlaceholder: "Script name",
      nameAria: "Script name",
      saving: "● Saving…",
      saved: "● Saved",
      saveError: "● Save error",
      saveErrorTip: "Save failed. Retrying…",
      run: "Run",
      runTip: "Run the script",
      stop: "Stop (F8)",
      stopTip: "Stop (F8)",
      busyClicker: "a clicker",
      busyRecord: "a recording",
      busyScript: "another script",
      busyMacro: "a macro",
      busyTip:
        "Cannot run the script: {label} is already running. Stop (F8) before continuing.",
      snippets: "Snippets",
      snippetsAria: "Examples and snippets",
      examples: "Examples",
      snipGet: "GET JSON",
      snipSet: "get / set / return",
      snipParam: "@param template",
      snipClick: "click + sleep",
      snipKey: "keyTap",
      snipInclude: "include module",
      sourceAria: "JavaScript source",
      loadingAria: "Loading script",
      notFound: "Script not found.",
    },
    console: {
      title: "Console",
      errorsTip: "Errors",
      clear: "Clear",
      clearMenu: "Clear console",
      expand: "Expand console",
      collapse: "Collapse console",
      resizeAria: "Resize console",
      empty: "No activity yet. Run the script to see logs here.",
      menuAria: "Console actions",
      sessionStart: "Session · started",
      cancelRequested: "Cancel requested (F8)",
    },
    permissions: {
      label: "Permissions",
      labelCount: "Permissions ·{count}",
      advanced: "Advanced",
      network: "Network",
      networkTip: "Allows caster.fetch — the script can make network requests.",
      clipboard: "Clipboard",
      clipboardTip: "The script can read and write the system clipboard.",
      input: "Mouse / keyboard",
      inputTip:
        "Allows caster.click, moveTo, keyTap, sleep — mouse/keyboard injection.",
      fs: "Files (sandbox)",
      fsShort: "Files",
      fsTip:
        "Read/write limited to Caster’s script-data/ folder — no other disk access.",
      macros: "Macros (depth 3)",
      macrosShort: "Macros",
      macrosTip:
        "The script can launch other macros via runMacro (max depth 3).",
      process: "Process",
      processShort: "Process",
      processTip:
        "Allows caster.runProcess — spawn executables (like process.run).",
    },
    language: {
      label: "Language",
      javascript: "JavaScript",
      typescript: "TypeScript",
    },
    module: {
      label: "Library module",
      tip: "For caster.include — not a primary Home runner.",
    },
    presets: {
      helloParam: {
        name: "Hello + @param",
        description: "Intro to parameters and caster.return",
      },
      httpGet: {
        name: "HTTP GET JSON",
        description: "caster.fetch → status / body variables",
      },
      clipRoundtrip: {
        name: "Clipboard",
        description: "Read then rewrite the clipboard",
      },
      fsNote: {
        name: "Sandbox note",
        description: "Read/write notes.txt under script-data/",
      },
      runMacro: {
        name: "Run a macro",
        description: "caster.runMacro (max depth 3)",
      },
      clickSleep: {
        name: "Click + sleep",
        description: "Mouse click then pause (Input permission)",
      },
    },
    toast: {
      networkDenied:
        "Error: caster.fetch failed — the script does not have Network permission. Enable it under Permissions if intended.",
      errorPrefix: "Error: {detail}",
    },
    confirm: {
      replaceTitle: "Replace code",
      replaceMessage:
        "Replace the current code with the “{name}” example and align permissions?",
      replaceConfirm: "Replace",
    },
  },
});
