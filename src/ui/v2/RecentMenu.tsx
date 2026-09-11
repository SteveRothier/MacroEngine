import { ChevronDown, Clock } from "lucide-react";
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
  const entries: DropdownEntry[] =
    items.length === 0
      ? [
          {
            id: "empty",
            label: "Aucun récent",
            disabled: true,
          },
        ]
      : items.map((item) => ({
          id: item.id,
          label: item.label,
          icon: <Clock size={14} />,
          onSelect: item.onSelect,
        }));

  return (
    <DropdownMenu
      label="Récents"
      ariaLabel="Documents récents"
      align="end"
      triggerClassName="v2-titlebar-btn v2-titlebar-text-btn"
      menuClassName="v2-recent-menu-popover"
      items={entries}
    >
      Récents
      <ChevronDown size={12} aria-hidden />
    </DropdownMenu>
  );
}
