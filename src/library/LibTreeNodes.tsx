import {
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Code2,
  Folder,
  FolderOpen,
  MousePointer2,
  Star,
  Workflow,
} from "lucide-react";
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

/** In-place rename: same DOM/CSS as `.caster-lib-nav-label` (no input chrome). */
export function LibRenameInput({
  initial,
  ariaLabel,
  onCommit,
  onCancel,
}: {
  initial: string;
  ariaLabel?: string;
  onCommit: (next: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, []);

  function finish(commit: boolean) {
    if (doneRef.current) return;
    doneRef.current = true;
    const next = (ref.current?.textContent ?? "").replace(/\u00a0/g, " ");
    if (commit) onCommit(next);
    else onCancel();
  }

  return (
    <span
      ref={ref}
      className="caster-lib-nav-label"
      role="textbox"
      aria-label={ariaLabel ?? initial}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e: ReactKeyboardEvent<HTMLSpanElement>) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          finish(true);
        } else if (e.key === "Escape") {
          e.preventDefault();
          finish(false);
        }
      }}
      onPaste={(e) => {
        e.preventDefault();
        const text = e.clipboardData.getData("text/plain").replace(/\s+/g, " ");
        document.execCommand("insertText", false, text);
      }}
      onBlur={() => finish(true)}
    >
      {initial}
    </span>
  );
}

/** Temporary folder row while naming a new folder (no DnD / context menu). */
export function LibDraftFolderRow({
  navKey,
  focused,
  ariaLabel,
  initialName,
  remountKey,
  onCommit,
  onCancel,
}: {
  navKey: string;
  focused: boolean;
  ariaLabel: string;
  initialName: string;
  remountKey: number;
  onCommit: (next: string) => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="caster-lib-tree-node"
      data-folder-draft=""
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div
        role="treeitem"
        tabIndex={-1}
        data-nav-key={navKey}
        className={cx(
          "caster-lib-nav-row",
          "caster-lib-nav-row--folder",
          "is-editing",
          focused && "is-focused",
        )}
        aria-label={ariaLabel}
        aria-selected={focused || undefined}
      >
        <span className="caster-lib-tree-twist" aria-hidden />
        <Folder size={15} aria-hidden className="caster-lib-folder-icon" />
        <LibRenameInput
          key={remountKey}
          initial={initialName}
          ariaLabel={ariaLabel}
          onCommit={onCommit}
          onCancel={onCancel}
        />
      </div>
    </div>
  );
}

/** Temporary item row while naming a new automation (no DnD / context menu). */
export function LibDraftItemRow({
  kind,
  navKey,
  focused,
  ariaLabel,
  initialName,
  remountKey,
  onCommit,
  onCancel,
}: {
  kind: AutomationRow["kind"];
  navKey: string;
  focused: boolean;
  ariaLabel: string;
  initialName: string;
  remountKey: number;
  onCommit: (next: string) => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="treeitem"
      tabIndex={-1}
      data-nav-key={navKey}
      data-item-draft=""
      className={cx(
        "caster-lib-nav-row",
        "caster-lib-item",
        "is-editing",
        focused && "is-focused",
      )}
      aria-label={ariaLabel}
      aria-selected={focused || undefined}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <KindIcon kind={kind} />
      <LibRenameInput
        key={remountKey}
        initial={initialName}
        ariaLabel={ariaLabel}
        onCommit={onCommit}
        onCancel={onCancel}
      />
    </div>
  );
}

export function LibItem({
  row,
  active,
  focused,
  selected,
  dragging,
  canDrag,
  dropEdge,
  editing,
  onOpen,
  onContextMenu,
  onPointerDown,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onFocusRow,
}: {
  row: AutomationRow;
  active: boolean;
  focused?: boolean;
  selected?: boolean;
  dragging?: boolean;
  canDrag?: boolean;
  dropEdge?: "before" | "after" | null;
  editing?: boolean;
  onOpen: (e: MouseEvent) => void;
  onContextMenu: (e: MouseEvent) => void;
  onPointerDown?: (e: ReactPointerEvent) => void;
  onStartRename?: () => void;
  onCommitRename?: (next: string) => void;
  onCancelRename?: () => void;
  onFocusRow?: () => void;
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
        selected && "is-selected",
        focused && !editing && "is-focused",
        dragging && "is-dragging",
        editing && "is-editing",
        dropEdge === "before" && "is-drop-before",
        dropEdge === "after" && "is-drop-after",
      )}
      aria-current={active ? "true" : undefined}
      aria-selected={selected || focused || undefined}
      data-nav-key={rowDomKey(row)}
      onFocus={onFocusRow}
      onPointerDown={editing ? undefined : onPointerDown}
      onDragStart={(e) => e.preventDefault()}
      onClick={(e) => {
        if (editing) {
          e.preventDefault();
          return;
        }
        onOpen(e);
      }}
      onDoubleClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!row.locked) onStartRename?.();
      }}
      onContextMenu={onContextMenu}
    >
      <KindIcon kind={row.kind} />
      {editing && onCommitRename && onCancelRename ? (
        <LibRenameInput
          initial={row.name}
          onCommit={onCommitRename}
          onCancel={onCancelRename}
        />
      ) : (
        <span className="caster-lib-nav-label">{row.name}</span>
      )}
      {row.favorite && !editing ? (
        <Star
          size={12}
          className="caster-lib-item-fav"
          aria-hidden
          fill="currentColor"
          strokeWidth={1.5}
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
  dropIndicator,
  editingKey,
  selectedKeys,
  onOpen,
  onActivate,
  onContextMenu,
  onPointerDown,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onFocusRow,
}: {
  row: AutomationRow;
  activeKey: string | null;
  focusKey: string | null;
  draggingKey: string | null;
  dropIndicator?: { key: string; edge: "before" | "after" } | null;
  editingKey?: string | null;
  selectedKeys?: ReadonlySet<string>;
  onOpen: (row: AutomationRow) => void;
  /** Click with modifiers (multi-select); when set, replaces `onOpen` on click. */
  onActivate?: (row: AutomationRow, e: MouseEvent) => void;
  onContextMenu: (e: MouseEvent, row: AutomationRow) => void;
  onPointerDown: (row: AutomationRow, e: ReactPointerEvent) => void;
  onStartRename?: (row: AutomationRow) => void;
  onCommitRename?: (row: AutomationRow, next: string) => void;
  onCancelRename?: () => void;
  onFocusRow?: (row: AutomationRow) => void;
}) {
  const key = rowDomKey(row);
  const canDrag = true;
  const dropEdge =
    dropIndicator?.key === key ? dropIndicator.edge : null;
  return (
    <LibItem
      row={row}
      active={activeKey === key}
      focused={focusKey === key}
      selected={selectedKeys?.has(key) ?? false}
      dragging={draggingKey === key}
      canDrag={canDrag}
      dropEdge={dropEdge}
      editing={editingKey === key}
      onOpen={(e) => (onActivate ? onActivate(row, e) : onOpen(row))}
      onContextMenu={(e) => onContextMenu(e, row)}
      onPointerDown={canDrag ? (e) => onPointerDown(row, e) : undefined}
      onStartRename={
        onStartRename ? () => onStartRename(row) : undefined
      }
      onCommitRename={
        onCommitRename ? (next) => onCommitRename(row, next) : undefined
      }
      onCancelRename={onCancelRename}
      onFocusRow={onFocusRow ? () => onFocusRow(row) : undefined}
    />
  );
}

export type LibTreeFolderHandlers = {
  onToggle: (id: string) => void;
  onFolderContextMenu?: (e: MouseEvent, folder: AutomationFolderOption) => void;
  onFolderPointerDown?: (
    folder: AutomationFolderOption,
    e: ReactPointerEvent,
  ) => void;
  onStartFolderRename?: (folder: AutomationFolderOption) => void;
  onCommitFolderRename?: (
    folder: AutomationFolderOption,
    next: string,
  ) => void;
  onCancelRename?: () => void;
  onFocusFolder?: (folder: AutomationFolderOption) => void;
  onOpenItem: (row: AutomationRow) => void;
  /** Item click (modifier-aware multi-select); falls back to `onOpenItem`. */
  onActivateItem?: (row: AutomationRow, e: MouseEvent) => void;
  onItemContextMenu: (e: MouseEvent, row: AutomationRow) => void;
  onItemPointerDown: (row: AutomationRow, e: ReactPointerEvent) => void;
  onStartItemRename?: (row: AutomationRow) => void;
  onCommitItemRename?: (row: AutomationRow, next: string) => void;
  onFocusItem?: (row: AutomationRow) => void;
};

export function LibTreeFolder({
  node,
  title,
  open,
  dropTarget,
  dropIndicator,
  activeKey,
  focusKey,
  draggingKey,
  editingKey,
  selectedKeys,
  isNodeOpen,
  handlers,
  draftFolder,
  draftNavKey,
  draftAriaLabel,
  draftFolderInitialName,
  draftRemountKey,
  onCommitDraft,
  onCancelDraft,
  draftItem,
  draftItemNavKey,
  draftItemAriaLabel,
  draftItemInitialName,
  draftItemRemountKey,
  onCommitDraftItem,
  onCancelDraftItem,
}: {
  node: LibTreeNode;
  title: string;
  open: boolean;
  dropTarget: string | null;
  dropIndicator?: { key: string; edge: "before" | "after" } | null;
  activeKey: string | null;
  focusKey: string | null;
  draggingKey: string | null;
  editingKey?: string | null;
  selectedKeys?: ReadonlySet<string>;
  isNodeOpen: (n: LibTreeNode) => boolean;
  handlers: LibTreeFolderHandlers;
  draftFolder?: { parentId: string | null } | null;
  draftNavKey?: string;
  draftAriaLabel?: string;
  draftFolderInitialName?: string;
  draftRemountKey?: number;
  onCommitDraft?: (next: string) => void;
  onCancelDraft?: () => void;
  draftItem?: { folderId: string | null; kind: AutomationRow["kind"] } | null;
  draftItemNavKey?: string;
  draftItemAriaLabel?: string;
  draftItemInitialName?: string;
  draftItemRemountKey?: number;
  onCommitDraftItem?: (next: string) => void;
  onCancelDraftItem?: () => void;
}) {
  const {
    onToggle,
    onFolderContextMenu,
    onFolderPointerDown,
    onStartFolderRename,
    onCommitFolderRename,
    onCancelRename,
    onFocusFolder,
    onOpenItem,
    onActivateItem,
    onItemContextMenu,
    onItemPointerDown,
    onStartItemRename,
    onCommitItemRename,
    onFocusItem,
  } = handlers;
  const FolderGlyph = open ? FolderOpen : Folder;
  const dropId = node.folder.id;
  const dropActive = dropTarget === dropId;
  const navKey = folderNavKey(node.id);
  const editing = editingKey === navKey;
  const dragging = draggingKey === navKey;
  const dropEdge =
    dropIndicator?.key === navKey ? dropIndicator.edge : null;

  return (
    <div className="caster-lib-tree-node" data-folder-drop-id={dropId}>
      <button
        type="button"
        tabIndex={-1}
        data-nav-key={navKey}
        draggable={false}
        className={cx(
          "caster-lib-nav-row",
          "caster-lib-nav-row--folder",
          "is-draggable",
          dropActive && "is-drop-target",
          focusKey === navKey && !editing && "is-focused",
          dragging && "is-dragging",
          editing && "is-editing",
          dropEdge === "before" && "is-drop-before",
          dropEdge === "after" && "is-drop-after",
        )}
        onFocus={() => onFocusFolder?.(node.folder)}
        onPointerDown={
          editing
            ? undefined
            : onFolderPointerDown
              ? (e) => onFolderPointerDown(node.folder, e)
              : undefined
        }
        onDragStart={(e) => e.preventDefault()}
        onClick={() => {
          if (editing) return;
          onToggle(node.id);
        }}
        onDoubleClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onStartFolderRename?.(node.folder);
        }}
        onContextMenu={(e) => onFolderContextMenu?.(e, node.folder)}
        aria-expanded={open}
        aria-controls={`lib-tree-${node.id}`}
        aria-selected={focusKey === navKey || undefined}
        aria-label={title}
      >
        <span
          className={cx("caster-lib-tree-twist", open && "is-open")}
          aria-hidden
        />
        <FolderGlyph size={15} aria-hidden className="caster-lib-folder-icon" />
        {editing && onCommitFolderRename && onCancelRename ? (
          <LibRenameInput
            initial={node.folder.name}
            onCommit={(next) => onCommitFolderRename(node.folder, next)}
            onCancel={onCancelRename}
          />
        ) : (
          <span className="caster-lib-nav-label">{title}</span>
        )}
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
              dropIndicator={dropIndicator}
              activeKey={activeKey}
              focusKey={focusKey}
              draggingKey={draggingKey}
              editingKey={editingKey}
              selectedKeys={selectedKeys}
              isNodeOpen={isNodeOpen}
              handlers={handlers}
              draftFolder={draftFolder}
              draftNavKey={draftNavKey}
              draftAriaLabel={draftAriaLabel}
              draftFolderInitialName={draftFolderInitialName}
              draftRemountKey={draftRemountKey}
              onCommitDraft={onCommitDraft}
              onCancelDraft={onCancelDraft}
              draftItem={draftItem}
              draftItemNavKey={draftItemNavKey}
              draftItemAriaLabel={draftItemAriaLabel}
              draftItemInitialName={draftItemInitialName}
              draftItemRemountKey={draftItemRemountKey}
              onCommitDraftItem={onCommitDraftItem}
              onCancelDraftItem={onCancelDraftItem}
            />
          ))}
          {draftFolder &&
          draftFolder.parentId === node.id &&
          draftNavKey &&
          draftAriaLabel &&
          draftFolderInitialName &&
          onCommitDraft &&
          onCancelDraft ? (
            <LibDraftFolderRow
              navKey={draftNavKey}
              focused={focusKey === draftNavKey}
              ariaLabel={draftAriaLabel}
              initialName={draftFolderInitialName}
              remountKey={draftRemountKey ?? 0}
              onCommit={onCommitDraft}
              onCancel={onCancelDraft}
            />
          ) : null}
          {node.items.map((row) => (
            <BoundLibItem
              key={rowDomKey(row)}
              row={row}
              activeKey={activeKey}
              focusKey={focusKey}
              draggingKey={draggingKey}
              dropIndicator={dropIndicator}
              editingKey={editingKey}
              selectedKeys={selectedKeys}
              onOpen={onOpenItem}
              onActivate={onActivateItem}
              onContextMenu={onItemContextMenu}
              onPointerDown={onItemPointerDown}
              onStartRename={onStartItemRename}
              onCommitRename={onCommitItemRename}
              onCancelRename={onCancelRename}
              onFocusRow={onFocusItem}
            />
          ))}
          {draftItem &&
          draftItem.folderId === node.id &&
          draftItemNavKey &&
          draftItemAriaLabel &&
          draftItemInitialName &&
          onCommitDraftItem &&
          onCancelDraftItem ? (
            <LibDraftItemRow
              kind={draftItem.kind}
              navKey={draftItemNavKey}
              focused={focusKey === draftItemNavKey}
              ariaLabel={draftItemAriaLabel}
              initialName={draftItemInitialName}
              remountKey={draftItemRemountKey ?? 0}
              onCommit={onCommitDraftItem}
              onCancel={onCancelDraftItem}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
