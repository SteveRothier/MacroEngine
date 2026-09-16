/**
 * Caster UI shell (AppShell, menus, tabs, Accueil primitives).
 * CSS: `./tokens.css` + `./shell.css` with class/token prefix `caster-`.
 */
export { Tooltip, TruncatedTooltip, type TooltipSide, type TooltipAlign } from "./Tooltip";
export {
  DocumentTabBar,
  buildBarContextItems,
  type DocumentTabItem,
  type TabContextAction,
  type BarContextAction,
} from "./DocumentTabBar";
export { ContextMenu, type ContextMenuItem } from "./ContextMenu";
export { useContextMenuState, type ContextMenuState } from "./useContextMenuState";
export { usePrefersReducedMotion } from "./usePrefersReducedMotion";
export { MenuItemsList, findMenuItem, type MenuItemDef } from "./MenuItemsList";
export {
  DropdownMenu,
  type DropdownEntry,
  type DropdownGroup,
  type DropdownItem,
} from "./DropdownMenu";
export { EmptyState } from "./EmptyState";
export { EditorToolbar } from "./EditorToolbar";
export { usePointerReorder, type PointerReorderHandlers } from "./usePointerReorder";
export { AppShell } from "./AppShell";
export { AppNavTabs } from "./AppNavTabs";
export { RecentMenu, type RecentMenuItem } from "./RecentMenu";
export { Sidebar, type SidebarItem } from "./Sidebar";
export { WindowTitleBar } from "./WindowTitleBar";
export { TitleBarProvider, useTitleBarContext, useTitleBarSlot, useTitleBarDispatch } from "./TitleBarContext";
export { DataTable, type Column } from "./DataTable";
export { StatusPill, type StatusKind } from "./StatusPill";
export { InspectorPanel, InspectorSection } from "./InspectorPanel";
export { SummaryBar } from "./SummaryBar";
export { CommandPalette, DisplayPopover, type CommandItem } from "./CommandPalette";
export {
  ActionPickerMenu,
  type ActionPickerEntry,
  type ActionPickerGroup,
  type ActionPickerItem,
} from "./ActionPickerMenu";
export { Select, type SelectOption } from "./Select";
export { ToastProvider, useToast, type ToastKind } from "./Toast";
