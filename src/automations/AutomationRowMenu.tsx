import { MoreHorizontal } from "lucide-react";
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
  const items = buildAutomationRowMenuItems(row, {
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
    <Tooltip content="Plus d'actions">
      <span className="v2-auto-row-menu-wrap">
        <DropdownMenu
          label="Plus d'actions"
          ariaLabel={`Actions pour ${row.name}`}
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
