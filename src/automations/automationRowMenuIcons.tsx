import {
  Copy,
  Folder,
  FolderOpen,
  Lock,
  LockOpen,
  PenLine,
  Play,
  Star,
  Trash2,
} from "lucide-react";
import type { AutomationRowMenuActions } from "./automationRowMenuItems";

/** Shared Lucide icons for Accueil row ⋯ / context menus. */
export function automationRowMenuIcons(): NonNullable<
  AutomationRowMenuActions["icons"]
> {
  return {
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
  };
}
