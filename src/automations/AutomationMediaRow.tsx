import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import {
  AlertTriangle,
  Code2,
  MousePointer2,
  Play,
  Star,
  Workflow,
} from "lucide-react";
import {
  DropdownMenu,
  Tooltip,
  TruncatedTooltip,
} from "../ui/shell";
import { Switch } from "../ui";
import { useT } from "../i18n";
import { LIBRARY_ICON_CHOICES } from "./libraryIcons";
import { highlightQuery } from "./highlightQuery";
import {
  favoriteTooltip,
  kindTooltip,
  metaTooltip,
  showTriggerLabel,
} from "./rowLabels";
import { rowPreviewLines } from "./rowPreview";
import type { AutomationFolderOption, AutomationRow } from "./types";
import { AutomationRowMenu } from "./AutomationRowMenu";

function kindLabel(kind: AutomationRow["kind"], t: ReturnType<typeof useT>): string {
  if (kind === "macro") return t("automations.row.kindMacro");
  if (kind === "script") return t("automations.row.kindScript");
  return t("automations.row.kindClicker");
}

function KindIconButton({
  row,
  onPickIcon,
  onClearIcon,
}: {
  row: AutomationRow;
  onPickIcon: (icon: string) => void;
  onClearIcon?: () => void;
}) {
  const t = useT();
  const tip = kindTooltip(row, t);
  const Icon =
    row.kind === "macro"
      ? Workflow
      : row.kind === "script"
        ? Code2
        : MousePointer2;
  const glyph = row.icon?.trim();
  const items = [
    ...LIBRARY_ICON_CHOICES.map((emoji) => ({
      id: `icon-${emoji}`,
      label: emoji,
      onSelect: () => onPickIcon(emoji),
    })),
    ...(onClearIcon && glyph
      ? [
          { id: "sep-icon", label: "", separator: true as const },
          {
            id: "icon-clear",
            label: t("automations.row.clearIcon"),
            onSelect: onClearIcon,
          },
        ]
      : []),
  ];
  return (
    <Tooltip content={tip}>
      <DropdownMenu
        label={t("automations.row.changeIcon")}
        ariaLabel={t("automations.row.changeIcon")}
        align="start"
        stopTriggerPropagation
        triggerClassName={`caster-auto-kind caster-auto-kind--${row.kind}${glyph ? " has-emoji" : ""}`}
        items={items}
      >
        {glyph ? (
          <span className="caster-auto-kind-emoji" aria-hidden>
            {glyph}
          </span>
        ) : (
          <Icon size={16} aria-hidden />
        )}
      </DropdownMenu>
    </Tooltip>
  );
}

export type AutomationMediaRowProps = {
  row: AutomationRow;
  rowKey: string;
  query: string;
  isSelected: boolean;
  isMenuOpen: boolean;
  isRunning: boolean;
  isFocused: boolean;
  isVirtualized: boolean;
  isDragSource: boolean;
  dropBefore: boolean;
  dropAfter: boolean;
  layoutMedia: boolean;
  includeFolderInSub: boolean;
  showScriptPermBadges: boolean;
  folders: AutomationFolderOption[];
  onToggleSelect: (opts: { multi: boolean; range?: boolean }) => void;
  onPointerDownIdentity: (e: ReactPointerEvent) => void;
  onPointerDownRow: (e: ReactPointerEvent) => void;
  onClick: (e: MouseEvent) => void;
  onDoubleClick: (e: MouseEvent) => void;
  onContextMenu: (e: MouseEvent) => void;
  onFocus: () => void;
  onKeyDown: (e: ReactKeyboardEvent) => void;
  onLaunch: () => void;
  onToggleFavorite: (e?: MouseEvent) => void;
  onToggleEnabled: () => void;
  onPickIcon: (icon: string) => void;
  onClearIcon?: () => void;
  onMenuOpenChange: (open: boolean) => void;
  onOpen: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onLock: () => void;
  onUnlock: () => void;
  onReveal: () => void;
  onMoveToFolder: (folder: AutomationFolderOption | null) => void;
  onConvertTo: (to: "macro" | "clicker" | "script") => void;
  onExport: () => void;
};

export function AutomationMediaRow({
  row,
  rowKey: key,
  query,
  isSelected,
  isMenuOpen,
  isRunning,
  isFocused,
  isVirtualized,
  isDragSource,
  dropBefore,
  dropAfter,
  layoutMedia,
  includeFolderInSub,
  showScriptPermBadges,
  folders,
  onToggleSelect,
  onPointerDownIdentity,
  onPointerDownRow,
  onClick,
  onDoubleClick,
  onContextMenu,
  onFocus,
  onKeyDown,
  onLaunch,
  onToggleFavorite,
  onToggleEnabled,
  onPickIcon,
  onClearIcon,
  onMenuOpenChange,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
  onLock,
  onUnlock,
  onReveal,
  onMoveToFolder,
  onConvertTo,
  onExport,
}: AutomationMediaRowProps) {
  const t = useT();
  const permCount = row.permLabels?.length ?? 0;
  const showTrigger = isRunning || showTriggerLabel(row, t);
  const propLastRun =
    row.lastRunLabel !== t("common.empty") ? row.lastRunLabel : null;
  const mediaSubParts = [
    kindLabel(row.kind, t),
    row.triggerLabel && showTriggerLabel(row, t) ? row.triggerLabel : null,
    includeFolderInSub &&
    row.folderLabel &&
    row.folderLabel !== t("common.empty")
      ? row.folderLabel
      : null,
  ].filter(Boolean) as string[];
  const mediaSubtitle = isRunning
    ? t("common.running")
    : mediaSubParts.join(" · ");

  return (
    <div
      role="listitem"
      data-row-key={key}
      className={[
        "caster-auto-row",
        layoutMedia ? "caster-auto-row--media" : "caster-auto-row--legacy",
        isSelected ? "is-selected" : "",
        isMenuOpen ? "is-menu-open" : "",
        isRunning ? "is-running" : "",
        isFocused ? "is-focused" : "",
        isVirtualized ? "is-virtualized" : "",
        row.enabled === false ? "is-disabled" : "",
        row.conflictWith ? "has-conflict" : "",
        isDragSource ? "is-drag-source" : "",
        dropBefore ? "drop-before" : "",
        dropAfter ? "drop-after" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      title={rowPreviewLines(row, t).join("\n") || undefined}
      onPointerDown={onPointerDownRow}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      tabIndex={0}
    >
      <label
        className="caster-auto-row-check"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          onToggleSelect({ multi: true, range: e.shiftKey });
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDoubleClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <input
          type="checkbox"
          checked={isSelected}
          tabIndex={-1}
          onChange={() => {
            /* controlled via pointerdown */
          }}
          aria-label={t("automations.row.selectAria", { name: row.name })}
        />
      </label>
      <div
        className="caster-auto-row-identity"
        onPointerDown={onPointerDownIdentity}
      >
        <KindIconButton
          row={row}
          onPickIcon={onPickIcon}
          onClearIcon={onClearIcon}
        />
        <div className="caster-auto-row-main">
          <TruncatedTooltip content={row.name}>
            <span className="caster-auto-row-name">
              {isRunning ? (
                <span className="caster-auto-row-run-dot" aria-hidden />
              ) : null}
              {row.enabled === false ? (
                <span className="caster-auto-row-disabled-tag">
                  {t("automations.row.disabled")}
                </span>
              ) : null}
              {query.trim() ? highlightQuery(row.name, query) : row.name}
            </span>
          </TruncatedTooltip>
          {mediaSubtitle ? (
            <TruncatedTooltip content={mediaSubtitle}>
              <span
                className={[
                  "caster-auto-row-sub",
                  "caster-auto-row-sub--media",
                  isRunning ? "is-running" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {mediaSubtitle}
              </span>
            </TruncatedTooltip>
          ) : null}
        </div>
      </div>
      <div className="caster-auto-row-props">
        <span
          className="caster-auto-row-prop caster-auto-row-prop--info"
          aria-hidden
        />
        {isRunning ? (
          <span className="caster-auto-row-prop caster-auto-row-prop--trigger is-running">
            {t("common.running")}
          </span>
        ) : showTrigger ? (
          <TruncatedTooltip
            content={
              row.conflictWith
                ? t("automations.row.conflictTip", {
                    name: row.conflictWith.name,
                  })
                : row.kind === "script" &&
                    showScriptPermBadges &&
                    permCount > 0
                  ? t("automations.row.permTooltip", {
                      list: (row.permLabels ?? []).join(", "),
                    })
                  : metaTooltip(row, t)
            }
          >
            <span
              className={[
                "caster-auto-row-prop",
                "caster-auto-row-prop--trigger",
                "is-hotkey",
                row.conflictWith ? "is-conflict" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {row.conflictWith ? (
                <AlertTriangle
                  size={12}
                  className="caster-auto-conflict-badge"
                  aria-hidden
                />
              ) : null}
              {row.triggerLabel}
            </span>
          </TruncatedTooltip>
        ) : (
          <span
            className="caster-auto-row-prop caster-auto-row-prop--trigger"
            aria-hidden
          />
        )}
        <Tooltip
          content={
            row.lastRunTooltip && propLastRun
              ? row.lastRunTooltip
              : propLastRun
                ? t("automations.row.lastRunTooltip", { label: propLastRun })
                : t("automations.row.neverRun")
          }
        >
          <span className="caster-auto-row-prop caster-auto-row-prop--run caster-auto-row-prop--secondary">
            {propLastRun ?? ""}
          </span>
        </Tooltip>
      </div>
      <div
        className="caster-auto-row-trail"
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <Tooltip
          content={
            row.kind === "script" && row.isModule
              ? t("automations.toast.scriptModuleBlocked")
              : row.kind === "script"
                ? t("automations.row.executeTip")
                : t("automations.row.playTip")
          }
        >
          <button
            type="button"
            className="caster-auto-row-play-btn"
            disabled={row.kind === "script" && !!row.isModule}
            aria-label={
              row.kind === "script"
                ? t("automations.row.executeAria", { name: row.name })
                : t("automations.row.playAria", { name: row.name })
            }
            onClick={() => onLaunch()}
          >
            <Play size={14} aria-hidden />
          </button>
        </Tooltip>
        <Tooltip content={favoriteTooltip(row.favorite, t)}>
          <button
            type="button"
            className={[
              "caster-automation-fav",
              row.favorite ? "is-on" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-pressed={row.favorite}
            aria-label={favoriteTooltip(row.favorite, t)}
            onClick={(ev) => onToggleFavorite(ev)}
          >
            <Star
              size={14}
              aria-hidden
              fill={row.favorite ? "currentColor" : "none"}
            />
          </button>
        </Tooltip>
        <Tooltip
          content={
            row.enabled === false
              ? t("automations.row.enable")
              : t("automations.row.disable")
          }
        >
          <span className="caster-auto-row-enable">
            <Switch
              checked={row.enabled !== false}
              aria-label={
                row.enabled === false
                  ? t("automations.row.enable")
                  : t("automations.row.disable")
              }
              onChange={() => onToggleEnabled()}
            />
          </span>
        </Tooltip>
        <AutomationRowMenu
          row={row}
          open={isMenuOpen}
          onOpenChange={onMenuOpenChange}
          onOpen={onOpen}
          onLaunch={onLaunch}
          onRename={onRename}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onToggleFavorite={() => onToggleFavorite()}
          onLock={onLock}
          onUnlock={onUnlock}
          onReveal={onReveal}
          moveFolders={folders}
          onMoveToFolder={onMoveToFolder}
          onConvertTo={onConvertTo}
          onExport={onExport}
          onToggleEnabled={onToggleEnabled}
          onPickIcon={onPickIcon}
          onClearIcon={onClearIcon}
        />
      </div>
    </div>
  );
}
