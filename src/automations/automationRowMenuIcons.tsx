import {
  ArrowRightLeft,
  Code2,
  Copy,
  Download,
  Folder,
  FolderOpen,
  Lock,
  LockOpen,
  PenLine,
  Play,
  Star,
  Trash2,
  Workflow,
} from "lucide-react";
import type { AutomationRowMenuActions } from "./automationRowMenuItems";

/** Shared Lucide icons for library row context menus. */
export function automationRowMenuIcons(): NonNullable<
  AutomationRowMenuActions["icons"]
> {
  return {
    open: <FolderOpen size={14} aria-hidden />,
    launch: <Play size={14} aria-hidden />,
    rename: <PenLine size={14} aria-hidden />,
    duplicate: <Copy size={14} aria-hidden />,
    favorite: <Star size={14} aria-hidden />,
    lock: <Lock size={14} aria-hidden />,
    unlock: <LockOpen size={14} aria-hidden />,
    move: <Folder size={14} aria-hidden />,
    reveal: <FolderOpen size={14} aria-hidden />,
    goToFolder: <Folder size={14} aria-hidden />,
    convert: <ArrowRightLeft size={14} aria-hidden />,
    convertMacro: <Workflow size={14} aria-hidden />,
    convertScript: <Code2 size={14} aria-hidden />,
    export: <Download size={14} aria-hidden />,
    delete: <Trash2 size={14} aria-hidden />,
  };
}
