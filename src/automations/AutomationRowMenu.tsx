import {
  Copy,
  Folder,
  FolderOpen,
  Lock,
  LockOpen,
  MoreHorizontal,
  PenLine,
  Play,
  Star,
  Trash2,
} from "lucide-react";
import { DropdownMenu, Tooltip } from "../ui/v2";
import { buildAutomationRowMenuItems } from "./automationRowMenuItems";
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
    icons: {
      open: <FolderOpen size={14} />,
      launch: <Play size={14} />,
      rename: <PenLine size={14} />,
      duplicate: <Copy size={14} />,
      favorite: <Star size={14} />,
      lock: <Lock size={14} />,
      unlock: <LockOpen size={14} />,
      move: <Folder size={14} />,
      reveal: <FolderOpen size={14} />,
      delete: <Trash2 size={14} />,
    },
  });

  return (
    <Tooltip content="Plus d'actions">
      <span className="v2-auto-row-menu-wrap">
        <DropdownMenu
          label="Plus d'actions"
          ariaLabel={`Actions pour ${row.name}`}
          align="end"
          open={open}
          onOpenChange={onOpenChange}
          stopTriggerPropagation
          triggerClassName="v2-auto-row-menu-btn"
          menuClassName="v2-auto-row-menu"
          items={items}
        >
          <MoreHorizontal size={16} aria-hidden />
        </DropdownMenu>
      </span>
    </Tooltip>
  );
}
