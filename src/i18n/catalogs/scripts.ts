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
      snipProcess: "runProcess",
      apiHelp: "API caster",
      sourceAria: "Source JavaScript",
      sourceAriaJs: "Source JavaScript",
      sourceAriaTs: "Source TypeScript",
      sourcePlaceholderJs:
        "// //@param name type default\n// caster.get / set / return / log / fetch",
      sourcePlaceholderTs:
        "// //@param name type default\n// TypeScript → JS (oxc) · caster.*",
      runModuleBlocked:
        "Module bibliothèque — non exécutable directement (caster.include).",
      locked: "Verrouillé",
      lockedTitle: "Script verrouillé — lecture seule",
      dryRun: "Dry-run",
      dryRunTip:
        "Ignore click / touches / moveTo / runProcess (journalisés). fetch, fichiers et presse-papiers s’exécutent encore.",
      dryRunActive:
        "Dry-run actif — input et process ignorés (réseau / fichiers / presse-papiers actifs)",
      options: "Options",
      optionsAria: "Options du script",
      optionsModuleOn: "Module · activé",
      optionsModuleOff: "Module · désactivé",
      optionsDryRunOn: "Dry-run · activé",
      optionsDryRunOff: "Dry-run · désactivé",
      stepMode: "Pas à pas",
      optionsStepOn: "Pas à pas · activé",
      optionsStepOff: "Pas à pas · désactivé",
      stepTip:
        "Pause avant chaque effet de bord (clic, touches, fetch, fichiers…). Continuer manuellement.",
      stepPaused: "En pause · {method}",
      stepContinue: "Continuer",
      dryRunBadge: "Dry-run",
      convertToMacro: "→ Macro",
      convertToMacroTitle: "Envelopper ce script dans une macro",
      loadingAria: "Chargement du script",
      notFound: "Script introuvable.",
      runLintBlocked: "Corrigez les erreurs de l’éditeur avant d’exécuter.",
    },
    timeline: {
      title: "Timeline · run en cours",
      relaunch: "Relancer",
      running: "Exécution en cours…",
    },
    create: {
      title: "Nouveau script",
      message:
        "Script exécutable (Accueil / Exécuter) ou module bibliothèque (caster.include) ?",
      runnable: "Script exécutable",
      module: "Module bibliothèque",
      languageTitle: "Langage du script",
      languageMessage: "Choisissez JavaScript ou TypeScript.",
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
      sessionEnd: "Session · terminée",
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
      runBlocked:
        "Les modules ne se lancent pas seuls — appelez-les via caster.include.",
    },
    presets: {
      helloParam: {
        name: "Hello + @param",
        description: "Découverte des paramètres et de caster.return",
      },
      assertReturn: {
        name: "Assert + return",
        description: "Assertion, incrément et valeur de retour",
      },
      sleepLog: {
        name: "Sleep + log",
        description: "Pause timer (permission Input) puis log",
      },
      httpGet: {
        name: "HTTP GET JSON (réseau)",
        description: "caster.fetch → variables status / body — permission Réseau",
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
      timeout: "Délai d’exécution dépassé (timeout script).",
      errorPrefix: "Erreur : {detail}",
      permissionDenied:
        "Permission « {permission} » manquante — activez-la dans le menu Permissions.",
      enableAndRerun: "Activer et relancer",
      assertionFailed: "Assertion échouée.",
      assertionFailedDetail: "Assertion échouée : {detail}",
      engineBusy:
        "Une session est déjà en cours — Arrêter (F8) avant de relancer.",
      lintBlocked: "Corrigez les erreurs affichées dans l’éditeur.",
    },
    api: {
      get: "caster.get(name) — lit une variable (aucune permission).",
      set: "caster.set(name, value) — écrit une variable.",
      log: "caster.log(msg) — journal moteur.",
      return: "caster.return(value) — valeur de retour (JS/TS).",
      sleep: "caster.sleep(ms) — pause (permission Input).",
      fetch: "caster.fetch({method,url}) — HTTP (permission Réseau).",
      include: "caster.include(id) — charge un module (même langage).",
      runScript: "caster.runScript(id, params?) — lance un script enfant.",
      click: "caster.click({button,x,y}) — clic (permission Input).",
    },
    confirm: {
      replaceTitle: "Remplacer le code",
      replaceMessage:
        "Remplacer le code actuel par l’exemple « {name} » et aligner les permissions ?",
      replaceConfirm: "Remplacer",
      languageTitle: "Changer de langage",
      languageMessage:
        "Le code n’est plus le modèle par défaut. Adapter au nouveau langage (remplace le code) ou garder le code actuel ?",
      languageAdapt: "Adapter le modèle",
      languageKeep: "Garder le code",
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
      snipProcess: "runProcess",
      apiHelp: "caster API",
      sourceAria: "JavaScript source",
      sourceAriaJs: "JavaScript source",
      sourceAriaTs: "TypeScript source",
      sourcePlaceholderJs:
        "// //@param name type default\n// caster.get / set / return / log / fetch",
      sourcePlaceholderTs:
        "// //@param name type default\n// TypeScript → JS (oxc) · caster.*",
      runModuleBlocked:
        "Library module — not runnable directly (use caster.include).",
      locked: "Locked",
      lockedTitle: "Script locked — read only",
      dryRun: "Dry-run",
      dryRunTip:
        "Skip click / keys / moveTo / runProcess (logged). fetch, files, and clipboard still run.",
      dryRunActive:
        "Dry-run on — input and process skipped (network / files / clipboard still active)",
      options: "Options",
      optionsAria: "Script options",
      optionsModuleOn: "Module · on",
      optionsModuleOff: "Module · off",
      optionsDryRunOn: "Dry-run · on",
      optionsDryRunOff: "Dry-run · off",
      stepMode: "Step-through",
      optionsStepOn: "Step-through · on",
      optionsStepOff: "Step-through · off",
      stepTip:
        "Pause before each side effect (click, keys, fetch, files…). Continue manually.",
      stepPaused: "Paused · {method}",
      stepContinue: "Continue",
      dryRunBadge: "Dry-run",
      convertToMacro: "→ Macro",
      convertToMacroTitle: "Wrap this script in a macro",
      loadingAria: "Loading script",
      notFound: "Script not found.",
      runLintBlocked: "Fix editor errors before running.",
    },
    timeline: {
      title: "Timeline · current run",
      relaunch: "Relaunch",
      running: "Running…",
    },
    create: {
      title: "New script",
      message:
        "Runnable script (Home / Run) or library module (caster.include)?",
      runnable: "Runnable script",
      module: "Library module",
      languageTitle: "Script language",
      languageMessage: "Choose JavaScript or TypeScript.",
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
      sessionEnd: "Session · finished",
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
      runBlocked:
        "Modules cannot run alone — call them via caster.include.",
    },
    presets: {
      helloParam: {
        name: "Hello + @param",
        description: "Intro to parameters and caster.return",
      },
      assertReturn: {
        name: "Assert + return",
        description: "Assertion, increment, and return value",
      },
      sleepLog: {
        name: "Sleep + log",
        description: "Timed pause (Input permission) then log",
      },
      httpGet: {
        name: "HTTP GET JSON (network)",
        description: "caster.fetch → status / body — Network permission",
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
      timeout: "Script execution timed out.",
      errorPrefix: "Error: {detail}",
      permissionDenied:
        "Missing “{permission}” permission — enable it in the Permissions menu.",
      enableAndRerun: "Enable and rerun",
      assertionFailed: "Assertion failed.",
      assertionFailedDetail: "Assertion failed: {detail}",
      engineBusy: "A session is already running — Stop (F8) before launching again.",
      lintBlocked: "Fix the errors shown in the editor.",
    },
    api: {
      get: "caster.get(name) — read a variable (no permission).",
      set: "caster.set(name, value) — write a variable.",
      log: "caster.log(msg) — engine journal.",
      return: "caster.return(value) — return value (JS/TS).",
      sleep: "caster.sleep(ms) — pause (Input permission).",
      fetch: "caster.fetch({method,url}) — HTTP (Network permission).",
      include: "caster.include(id) — load a module (same language).",
      runScript: "caster.runScript(id, params?) — run a child script.",
      click: "caster.click({button,x,y}) — click (Input permission).",
    },
    confirm: {
      replaceTitle: "Replace code",
      replaceMessage:
        "Replace the current code with the “{name}” example and align permissions?",
      replaceConfirm: "Replace",
      languageTitle: "Change language",
      languageMessage:
        "The code is no longer the default template. Adapt to the new language (replaces code) or keep the current code?",
      languageAdapt: "Adapt template",
      languageKeep: "Keep code",
    },
  },
});
