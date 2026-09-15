import { useMemo } from "react";
import type { NavId } from "../../app/types";
import { useT, type TFunction } from "../../i18n";

function buildNavTabs(t: TFunction): { id: NavId; label: string }[] {
  return [
    { id: "automations", label: t("shell.navAutomations") },
    { id: "runs", label: t("shell.navRuns") },
    { id: "settings", label: t("shell.navSettings") },
  ];
}

type Props = {
  activeId: NavId;
  onSelect: (id: NavId) => void;
};

export function AppNavTabs({ activeId, onSelect }: Props) {
  const t = useT();
  const tabs = useMemo(() => buildNavTabs(t), [t]);

  return (
    <nav className="v2-titlebar-tabs" aria-label={t("shell.mainNavAria")}>
      {tabs.map((tab) => (
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
