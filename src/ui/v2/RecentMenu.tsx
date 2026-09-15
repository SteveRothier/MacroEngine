import { useMemo } from "react";
import { ChevronDown, Clock } from "lucide-react";
import { useT } from "../../i18n";
import { DropdownMenu } from "./DropdownMenu";
import type { DropdownEntry } from "./DropdownMenu";

export type RecentMenuItem = {
  id: string;
  label: string;
  onSelect: () => void;
};

type Props = {
  items: RecentMenuItem[];
};

export function RecentMenu({ items }: Props) {
  const t = useT();
  const entries: DropdownEntry[] = useMemo(
    () =>
      items.length === 0
        ? [
            {
              id: "empty",
              label: t("shell.recentEmpty"),
              disabled: true,
            },
          ]
        : items.map((item) => ({
            id: item.id,
            label: item.label,
            icon: <Clock size={14} />,
            onSelect: item.onSelect,
          })),
    [items, t],
  );

  return (
    <DropdownMenu
      label={t("shell.recentLabel")}
      ariaLabel={t("shell.recentAria")}
      align="end"
      triggerClassName="v2-titlebar-btn v2-titlebar-text-btn"
      menuClassName="v2-recent-menu-popover"
      items={entries}
    >
      {t("shell.recentLabel")}
      <ChevronDown size={12} aria-hidden />
    </DropdownMenu>
  );
}
