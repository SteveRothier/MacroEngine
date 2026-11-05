import type { MouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { Code2, Folder, FolderOpen, MousePointer2, Star, Workflow } from "lucide-react";
import type {
  AutomationFolderOption,
  AutomationRow,
} from "../automations/types";
import {
  cx,
  folderNavKey,
  rowDomKey,
  type LibTreeNode,
} from "./libTree";

export function KindIcon({ kind }: { kind: AutomationRow["kind"] }) {
  const Icon =
    kind === "macro" ? Workflow : kind === "script" ? Code2 : MousePointer2;
  return (
    <span className={`caster-lib-kind caster-lib-kind--${kind}`} aria-hidden>
      <Icon size={14} />
    </span>
  );
}

export function LibItem({
  row,
  active,
  focused,
  dragging,
  canDrag,
  onOpen,
  onContextMenu,
  onPointerDown,
}: {
  row: AutomationRow;
  active: boolean;
  focused?: boolean;
  dragging?: boolean;
  canDrag?: boolean;
  onOpen: () => void;
  onContextMenu: (e: MouseEvent) => void;
  onPointerDown?: (e: ReactPointerEvent) => void;
}) {
  return (
    <button
      type="button"
      role="treeitem"
      tabIndex={-1}
      draggable={false}
      className={cx(
        "caster-lib-nav-row",
        "caster-lib-item",
        canDrag && "is-draggable",
        active && "is-active",
        focused && "is-focused",
        dragging && "is-dragging",
        row.favorite && "is-favorite",
        row.trashed && "is-trashed",
      )}
      aria-current={active ? "true" : undefined}
      aria-selected={focused || undefined}
      data-nav-key={rowDomKey(row)}
      onPointerDown={onPointerDown}
      onDragStart={(e) => e.preventDefault()}
      onClick={onOpen}
      onDoubleClick={onOpen}
      onContextMenu={onContextMenu}
      title={row.triggerLabel || row.name}
    >
      <KindIcon kind={row.kind} />
      <span className="caster-lib-nav-label">{row.name}</span>
      {row.favorite && !row.trashed ? (
        <Star
          size={11}
          className="caster-lib-item-fav"
          aria-hidden
          fill="currentColor"
        />
      ) : null}
    </button>
  );
}

/** Shared wiring for tree / list / unfiled item rows. */
export function BoundLibItem({
  row,
  activeKey,
  focusKey,
  draggingKey,
  onOpen,
  onContextMenu,
  onPointerDown,
}: {
  row: AutomationRow;
  activeKey: string | null;
  focusKey: string | null;
  draggingKey: string | null;
  onOpen: (row: AutomationRow) => void;
  onContextMenu: (e: MouseEvent, row: AutomationRow) => void;
  onPointerDown: (row: AutomationRow, e: ReactPointerEvent) => void;
}) {
  const key = rowDomKey(row);
  const canDrag = !row.trashed && !row.locked;
  return (
    <LibItem
      row={row}
      active={activeKey === key}
      focused={focusKey === key}
      dragging={draggingKey === key}
      canDrag={canDrag}
      onOpen={() => onOpen(row)}
      onContextMenu={(e) => onContextMenu(e, row)}
      onPointerDown={canDrag ? (e) => onPointerDown(row, e) : undefined}
    />
  );
}

export function LibTreeFolder({
  node,
  title,
  open,
  dropTarget,
  activeKey,
  focusKey,
  draggingKey,
  isNodeOpen,
  onToggle,
  onFolderContextMenu,
  onOpenItem,
  onItemContextMenu,
  onItemPointerDown,
}: {
  node: LibTreeNode;
  title: string;
  open: boolean;
  dropTarget: string | null;
  activeKey: string | null;
  focusKey: string | null;
  draggingKey: string | null;
  isNodeOpen: (n: LibTreeNode) => boolean;
  onToggle: (id: string) => void;
  onFolderContextMenu?: (e: MouseEvent, folder: AutomationFolderOption) => void;
  onOpenItem: (row: AutomationRow) => void;
  onItemContextMenu: (e: MouseEvent, row: AutomationRow) => void;
  onItemPointerDown: (row: AutomationRow, e: ReactPointerEvent) => void;
}) {
  const FolderGlyph = open ? FolderOpen : Folder;
  const dropId = node.folder.id;
  const dropActive = dropTarget === dropId;
  const navKey = folderNavKey(node.id);
  const count = node.items.length;

  return (
    <div
      className={cx("caster-lib-tree-node", dropActive && "is-drop-target")}
      data-folder-drop-id={dropId}
    >
      <button
        type="button"
        tabIndex={-1}
        data-nav-key={navKey}
        className={cx(
          "caster-lib-nav-row",
          "caster-lib-nav-row--folder",
          focusKey === navKey && "is-focused",
        )}
        onClick={() => onToggle(node.id)}
        onContextMenu={(e) => onFolderContextMenu?.(e, node.folder)}
        aria-expanded={open}
        aria-controls={`lib-tree-${node.id}`}
        aria-selected={focusKey === navKey || undefined}
        aria-label={count > 0 ? `${title} (${count})` : title}
      >
        <span
          className={cx("caster-lib-tree-twist", open && "is-open")}
          aria-hidden
        />
        <FolderGlyph size={15} aria-hidden className="caster-lib-folder-icon" />
        <span className="caster-lib-nav-label">{title}</span>
      </button>
      {open ? (
        <div
          id={`lib-tree-${node.id}`}
          className="caster-lib-tree-children"
          role="group"
        >
          {node.children.map((child) => (
            <LibTreeFolder
              key={child.id}
              node={child}
              title={child.folder.name}
              open={isNodeOpen(child)}
              dropTarget={dropTarget}
              activeKey={activeKey}
              focusKey={focusKey}
              draggingKey={draggingKey}
              isNodeOpen={isNodeOpen}
              onToggle={onToggle}
              onFolderContextMenu={onFolderContextMenu}
              onOpenItem={onOpenItem}
              onItemContextMenu={onItemContextMenu}
              onItemPointerDown={onItemPointerDown}
            />
          ))}
          {node.items.map((row) => (
            <BoundLibItem
              key={rowDomKey(row)}
              row={row}
              activeKey={activeKey}
              focusKey={focusKey}
              draggingKey={draggingKey}
              onOpen={onOpenItem}
              onContextMenu={onItemContextMenu}
              onPointerDown={onItemPointerDown}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
