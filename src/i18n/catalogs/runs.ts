import { defineCatalog } from "../defineCatalog";

/** Run journal dock. */
export const runs = defineCatalog({
  fr: {
    title: "Journal",
    aria: "Journal",
    filterAll: "Tout",
    filterMacros: "Macros",
    filterClicker: "Clicker",
    filterSystem: "Système",
    clear: "Vider",
    close: "Fermer",
    emptyTitle: "Aucune entrée",
    emptyLead: "Les logs d’exécution apparaîtront ici.",
  },
  en: {
    title: "Journal",
    aria: "Journal",
    filterAll: "All",
    filterMacros: "Macros",
    filterClicker: "Clicker",
    filterSystem: "System",
    clear: "Clear",
    close: "Close",
    emptyTitle: "No entries",
    emptyLead: "Run logs will appear here.",
  },
});
