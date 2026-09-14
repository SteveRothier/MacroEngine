import type { UiLocale } from "./settingsTypes";

export type AppLocale = "fr" | "en";

const APPLICATION_STRINGS = {
  fr: {
    paneTitle: "Application",
    paneHint: "Démarrage, fenêtre et apparence de Caster.",
    groupStartup: "Démarrage & fenêtre",
    groupNotifications: "Notifications",
    groupAppearance: "Apparence",
    groupClicker: "Clicker",
    startWithWindows: "Démarrer avec Windows",
    startWithWindowsHint: "Lance Caster à la connexion de votre compte.",
    startInTray: "Démarrer dans le tray",
    startInTrayHint:
      "Lance Caster caché dans la barre d’état au démarrage Windows.",
    closeToTray: "Fermer vers la barre d’état",
    closeToTrayHint: "La croix cache la fenêtre ; quitter via l’icône tray.",
    journalOnStart: "Journal au démarrage",
    journalOnStartHint: "Ouvre le journal d’exécution au lancement.",
    startupView: "Vue au démarrage",
    startupViewHint: "Écran montré juste après le lancement.",
    restoreTabs: "Restaurer les onglets",
    restoreTabsHint: "Rouvre les documents ouverts à la fermeture précédente.",
    alwaysOnTop: "Toujours au-dessus",
    alwaysOnTopHint: "Garde la fenêtre Caster au-dessus des autres apps.",
    rememberBounds: "Mémoriser taille et position",
    rememberBoundsHint: "Restaure la géométrie de la fenêtre au prochain lancement.",
    confirmQuit: "Confirmer avant quitter si session active",
    confirmQuitHint: "Demande confirmation quand le moteur tourne encore.",
    goHomeAfterEmergency: "Accueil après arrêt d’urgence",
    goHomeAfterEmergencyHint: "Revient à la liste après F8 / arrêt d’urgence.",
    toastOnFinish: "Toast de fin de session",
    toastOnFinishHint: "Affiche une notification quand une exécution se termine.",
    soundOnFinish: "Son de fin",
    soundOnFinishHint: "Joue un bip court à la fin d’une session.",
    focusJournal: "Ouvrir le journal au lancement d’un run",
    focusJournalHint: "Affiche le journal dès qu’une automation démarre.",
    trayRelaunch: "Tray : relancer la dernière automation",
    trayRelaunchHint:
      "Les actions tray relancent le dernier clicker / la dernière macro connus.",
    theme: "Thème",
    themeHint: "Suit Windows si Système.",
    language: "Langue",
    languageHint: "S’applique aux libellés de cette page (reste de l’app en français).",
    hud: "Indicateur flottant (HUD)",
    hudHint:
      "Affiche l’état au-dessus des autres fenêtres (pas les zones Clicker).",
    hudOpacity: "Opacité du HUD",
    clickerMode: "Mode interface",
    clickerModeHint: "Change uniquement l’éditeur Clicker.",
    state: "État",
    liveMetrics: "Mesure live",
  },
  en: {
    paneTitle: "Application",
    paneHint: "Startup, window, and appearance for Caster.",
    groupStartup: "Startup & window",
    groupNotifications: "Notifications",
    groupAppearance: "Appearance",
    groupClicker: "Clicker",
    startWithWindows: "Start with Windows",
    startWithWindowsHint: "Launch Caster when you sign in to your account.",
    startInTray: "Start in tray",
    startInTrayHint: "Launch Caster hidden in the system tray on Windows startup.",
    closeToTray: "Close to tray",
    closeToTrayHint: "The close button hides the window; quit from the tray icon.",
    journalOnStart: "Journal open on startup",
    journalOnStartHint: "Open the run journal when the app starts.",
    startupView: "Startup view",
    startupViewHint: "Screen shown right after launch.",
    restoreTabs: "Restore tabs",
    restoreTabsHint: "Reopen documents that were open last time.",
    alwaysOnTop: "Always on top",
    alwaysOnTopHint: "Keep the Caster window above other apps.",
    rememberBounds: "Remember size and position",
    rememberBoundsHint: "Restore window geometry on next launch.",
    confirmQuit: "Confirm quit while a session is active",
    confirmQuitHint: "Ask before quitting when the engine is still running.",
    goHomeAfterEmergency: "Home after emergency stop",
    goHomeAfterEmergencyHint: "Return to the list after F8 / emergency stop.",
    toastOnFinish: "Toast when a session ends",
    toastOnFinishHint: "Show a notification when a run finishes.",
    soundOnFinish: "Sound on finish",
    soundOnFinishHint: "Play a short beep when a session ends.",
    focusJournal: "Open journal when a run starts",
    focusJournalHint: "Show the journal as soon as an automation starts.",
    trayRelaunch: "Tray: relaunch last automation",
    trayRelaunchHint:
      "Tray actions relaunch the last known clicker / macro.",
    theme: "Theme",
    themeHint: "Follows Windows when set to System.",
    language: "Language",
    languageHint: "Applies to this page’s labels (rest of the app stays French).",
    hud: "Floating status (HUD)",
    hudHint: "Show status above other windows (not Clicker zones).",
    hudOpacity: "HUD opacity",
    clickerMode: "Interface mode",
    clickerModeHint: "Only changes the Clicker editor.",
    state: "State",
    liveMetrics: "Live metrics",
  },
} as const;

export type ApplicationStringKey = keyof typeof APPLICATION_STRINGS.fr;

export function resolveAppLocale(pref: UiLocale): AppLocale {
  if (pref === "fr") return "fr";
  if (pref === "en") return "en";
  try {
    const lang = Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase();
    return lang.startsWith("fr") ? "fr" : "en";
  } catch {
    return "fr";
  }
}

export function tApp(pref: UiLocale, key: ApplicationStringKey): string {
  return APPLICATION_STRINGS[resolveAppLocale(pref)][key];
}
