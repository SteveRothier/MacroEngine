/**
 * Backlog produit Clicker — Phase 3.
 * Annoté au fur et à mesure des livraisons.
 */
export type ClickerBacklogItem = {
  id: string;
  title: string;
  summary: string;
  priority: number;
};

export const CLICKER_FEATURE_BACKLOG: readonly ClickerBacklogItem[] = [
  {
    id: "presets-templates",
    title: "Profils / presets rapides",
    summary:
      "Templates « CPS fixe curseur », « Grille 3 points », « Zones bords seuls » appliqués en un clic. (livré — menu ⋯)",
    priority: 1,
  },
  {
    id: "target-mini-map",
    title: "Mini-carte cible",
    summary:
      "Preview miniature des points et du point fixe dans l’onglet Cible. (livré — TargetMiniMap)",
    priority: 2,
  },
  {
    id: "session-pause",
    title: "Pause / reprise session",
    summary:
      "Bouton Pause dans la barre + raccourci F7 dédié (au-delà des zones pause). (livré)",
    priority: 3,
  },
  {
    id: "limits-combined",
    title: "Limites combinées (ET)",
    summary:
      "Stop au premier seuil atteint : clics ET durée configurables simultanément. (livré — LimitMode Both)",
    priority: 4,
  },
  {
    id: "pixel-condition",
    title: "Condition pixel / couleur",
    summary:
      "Stop ou pause si la couleur sous (x, y) change. (livré — read_pixel + Limites)",
    priority: 5,
  },
  {
    id: "chain-macro",
    title: "Enchaînement clicker → macro",
    summary:
      "Lancer une macro à la fin de session (limites ou stopWhenComplete). (livré — onCompleteMacro)",
    priority: 6,
  },
  {
    id: "session-stats",
    title: "Stats session",
    summary: "Graphique CPS sur 30 s dans un panneau léger. (livré — sparkline)",
    priority: 7,
  },
] as const;
