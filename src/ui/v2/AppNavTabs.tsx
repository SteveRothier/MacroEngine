import type { NavId } from "../../app/types";

const TABS: { id: NavId; label: string }[] = [
  { id: "automations", label: "Automations" },
  { id: "runs", label: "Runs" },
  { id: "settings", label: "Paramètres" },
];

type Props = {
  activeId: NavId;
  onSelect: (id: NavId) => void;
};

export function AppNavTabs({ activeId, onSelect }: Props) {
  return (
    <nav className="v2-titlebar-tabs" aria-label="Navigation principale">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={["v2-titlebar-tab", activeId === tab.id ? "active" : ""]
            .filter(Boolean)
            .join(" ")}
          aria-current={activeId === tab.id ? "page" : undefined}
          onClick={() => onSelect(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
