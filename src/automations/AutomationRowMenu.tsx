import { MoreHorizontal } from "lucide-react";
import { useT } from "../i18n";
import { DropdownMenu, Tooltip } from "../ui/v2";
import { buildAutomationRowMenuItems } from "./automationRowMenuItems";
import { automationRowMenuIcons } from "./automationRowMenuIcons";
import type { AutomationFolderOption, AutomationRow } from "./types";

type Props = {
  row: AutomationRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpen: () => void;
  onLaunch: () => void;
  onRename?: () => void;
  onDuplicate?: () => void;
  onDelete: () => void;
  onToggleFavorite?: () => void;
  onLock?: () => void;
  onUnlock?: () => void;
  onReveal?: () => void;
  moveFolders?: AutomationFolderOption[];
  onMoveToFolder?: (folder: AutomationFolderOption | null) => void;
};

export function AutomationRowMenu({
  row,
  open,
  onOpenChange,
  onOpen,
  onLaunch,
  onRename,
  onDuplicate,
  onDelete,
  onToggleFavorite,
  onLock,
  onUnlock,
  onReveal,
  moveFolders,
  onMoveToFolder,
}: Props) {
  const t = useT();
  const items = buildAutomationRowMenuItems(row, t, {
    onOpen,
    onLaunch,
    onRename,
    onDuplicate,
    onDelete,
    onToggleFavorite,
    onLock,
    onUnlock,
    onReveal,
    moveFolders,
    onMoveToFolder,
    icons: automationRowMenuIcons(),
  });

  return (
    <Tooltip content={t("automations.menu.row.moreTip")}>
      <span className="v2-auto-row-menu-wrap">
        <DropdownMenu
          label={t("automations.menu.row.moreLabel")}
          ariaLabel={t("automations.menu.row.actionsAria", { name: row.name })}
          open={open}
          onOpenChange={onOpenChange}
          align="end"
          triggerClassName="v2-auto-row-menu-btn"
          items={items}
        >
          <MoreHorizontal size={16} aria-hidden />
        </DropdownMenu>
      </span>
    </Tooltip>
  );
}
