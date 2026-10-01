import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { AppWindow } from "lucide-react";
import { useT, type TFunction } from "../i18n";
import {
  ProcessFilterPanel,
  type ProcessFilterPanelProps,
} from "./ProcessFilterPanel";
import {
  displayExeName,
  processFilterAllows,
  type ProcessFilter,
  type ProcessFilterScopeMode,
} from "./types";

const MENU_GAP = 6;
const MENU_PAD = 8;
const FG_POLL_MS = 1500;

function placePopover(
  trigger: DOMRect,
  panel: DOMRect,
): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = trigger.right - panel.width;
  if (left < MENU_PAD) left = trigger.left;
  left = Math.max(MENU_PAD, Math.min(left, vw - MENU_PAD - panel.width));

  let top = trigger.bottom + MENU_GAP;
  if (top + panel.height > vh - MENU_PAD) {
    const above = trigger.top - MENU_GAP - panel.height;
    if (above >= MENU_PAD) top = above;
    else top = Math.max(MENU_PAD, vh - MENU_PAD - panel.height);
  }
  return { top, left };
}

function modeShortLabel(mode: ProcessFilterScopeMode, t: TFunction) {
  if (mode === "off") return t("common.process.modeOff");
  if (mode === "local") return t("common.process.modeLocal");
  return t("common.process.modeInherit");
}

function filterSummaryText(filter: ProcessFilter, t: TFunction): string {
  if (!filter.enabled) return t("common.process.allProcesses");
  const names = filter.names.filter((n) => n.trim().length > 0);
  if (names.length === 0) {
    return filter.mode === "allow"
      ? t("common.process.noneAllowed")
      : t("common.process.allAllowed");
  }
  const list = names.slice(0, 3).map(displayExeName).join(", ");
  const extra = names.length > 3 ? ` +${names.length - 3}` : "";
  return filter.mode === "allow"
    ? t("common.process.allowList", { list: `${list}${extra}` })
    : t("common.process.denyList", { list: `${list}${extra}` });
}

function toolSummary(
  mode: ProcessFilterScopeMode,
  filter: ProcessFilter,
  localFilter: ProcessFilter,
  t: TFunction,
): string {
  if (mode === "off") return t("common.process.offSummary");
  if (mode === "inherit") return filterSummaryText(filter, t);
  return filterSummaryText({ ...localFilter, enabled: true }, t);
}

function effectiveFilter(
  mode: ProcessFilterScopeMode,
  filter: ProcessFilter,
  localFilter: ProcessFilter,
): ProcessFilter | null {
  if (mode === "off") return null;
  if (mode === "local") return { ...localFilter, enabled: true };
  return filter.enabled ? filter : null;
}

export type ProcessFilterToolProps = ProcessFilterPanelProps;

export function ProcessFilterTool({
  filter,
  mode,
  onModeChange,
  localFilter,
  onLocalFilterChange,
  disabled,
  onOpenSettings,
  onGlobalFilterChange,
  presets,
  onPresetsChange,
}: ProcessFilterToolProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<CSSProperties | null>(null);
  const [foregroundExe, setForegroundExe] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const modeLabel = modeShortLabel(mode, t);
  const detail = toolSummary(mode, filter, localFilter, t);
  const activeFilter = useMemo(
    () => effectiveFilter(mode, filter, localFilter),
    [mode, filter, localFilter],
  );
  const blocked =
    Boolean(activeFilter) &&
    !processFilterAllows(activeFilter!, foregroundExe);
  const title = blocked
    ? `${t("common.process.toolTitle", { mode: modeLabel, detail })} — ${t(
        "common.process.toolBlocked",
        { name: displayExeName(foregroundExe ?? "") },
      )}`
    : t("common.process.toolTitle", { mode: modeLabel, detail });
  const localCount = localFilter.names.filter((n) => n.trim().length > 0).length;
  const triggerLabel =
    mode === "local" && localCount > 0
      ? t("common.process.toolLabelCount", { count: localCount })
      : mode === "off"
        ? t("common.process.toolLabelOff")
        : t("common.process.label");

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      // Nested DropdownMenu / ContextMenu portals live under document.body.
      if (
        target instanceof Element &&
        target.closest(".caster-menu-popover, .caster-menu-submenu")
      ) {
        return;
      }
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open || !activeFilter) {
      setForegroundExe(null);
      return;
    }
    let cancelled = false;
    const tick = () => {
      void invoke<string | null>("get_foreground_exe")
        .then((fg) => {
          if (!cancelled) setForegroundExe(fg);
        })
        .catch(() => {
          if (!cancelled) setForegroundExe(null);
        });
    };
    tick();
    const id = window.setInterval(tick, FG_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [open, activeFilter]);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;

    const update = () => {
      const tRect = trigger.getBoundingClientRect();
      const pRect = panel.getBoundingClientRect();
      const { top, left } = placePopover(tRect, pRect);
      setCoords({
        position: "fixed",
        top,
        left,
        right: "auto",
        zIndex: 90,
      });
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, mode, localFilter, filter]);

  const panel =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={panelRef}
            id={menuId}
            className="caster-menu-popover caster-process-filter-popover"
            role="dialog"
            aria-label={t("common.process.modeAria")}
            style={coords ?? { position: "fixed", visibility: "hidden" }}
          >
            <ProcessFilterPanel
              filter={filter}
              mode={mode}
              onModeChange={onModeChange}
              localFilter={localFilter}
              onLocalFilterChange={onLocalFilterChange}
              disabled={disabled}
              onOpenSettings={onOpenSettings}
              onGlobalFilterChange={onGlobalFilterChange}
              presets={presets}
              onPresetsChange={onPresetsChange}
            />
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="caster-process-filter-tool" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={[
          "caster-titlebar-btn",
          "caster-btn",
          "caster-btn-ghost",
          mode === "off" ? "is-off" : "",
          mode === "local" ? "is-active" : "",
          mode === "local" && localFilter.mode === "allow" ? "is-allow" : "",
          mode === "local" && localFilter.mode === "deny" ? "is-deny" : "",
          blocked ? "is-blocked" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        disabled={disabled}
        title={title}
        aria-label={t("common.process.toolAria", {
          mode: modeLabel,
          detail,
        })}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <AppWindow size={14} aria-hidden />
        {triggerLabel}
      </button>
      {panel}
    </div>
  );
}
