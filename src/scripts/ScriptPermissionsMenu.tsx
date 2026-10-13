import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { useT, type TFunction } from "../i18n";
import { Tooltip } from "../ui/shell";

export type ScriptPermissions = {
  allowNetwork: boolean;
  allowClipboard: boolean;
  allowFs: boolean;
  allowMacroControl: boolean;
  allowInput: boolean;
  allowProcess: boolean;
};

type Props = {
  value: ScriptPermissions;
  onChange: (partial: Partial<ScriptPermissions>) => void;
  disabled?: boolean;
};

const MENU_GAP = 6;
const MENU_PAD = 8;

function placePopover(
  trigger: DOMRect,
  panel: DOMRect,
): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = trigger.left;
  if (left + panel.width > vw - MENU_PAD) {
    left = trigger.right - panel.width;
  }
  left = Math.max(MENU_PAD, Math.min(left, vw - MENU_PAD - panel.width));

  let top = trigger.bottom + MENU_GAP;
  if (top + panel.height > vh - MENU_PAD) {
    const above = trigger.top - MENU_GAP - panel.height;
    if (above >= MENU_PAD) top = above;
    else top = Math.max(MENU_PAD, vh - MENU_PAD - panel.height);
  }
  return { top, left };
}

function countActive(v: ScriptPermissions): number {
  return [
    v.allowNetwork,
    v.allowClipboard,
    v.allowFs,
    v.allowMacroControl,
    v.allowInput,
    v.allowProcess,
  ].filter(Boolean).length;
}

export function ScriptPermissionsMenu({ value, onChange, disabled }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<CSSProperties | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const n = countActive(value);
  const label =
    n > 0
      ? t("scripts.permissions.labelCount", { count: n })
      : t("scripts.permissions.label");

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;

    const update = () => {
      const { top, left } = placePopover(
        trigger.getBoundingClientRect(),
        panel.getBoundingClientRect(),
      );
      setCoords({
        position: "fixed",
        top,
        left,
        right: "auto",
        zIndex: 12000,
      });
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    };
    const id = window.setTimeout(() => {
      document.addEventListener("mousedown", onDoc);
      document.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const panel =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={panelRef}
            id={menuId}
            className="caster-menu-popover caster-script-perms-popover"
            role="menu"
            aria-label={t("scripts.permissions.label")}
            style={coords ?? { position: "fixed", visibility: "hidden" }}
          >
            <PermRow
              label={t("scripts.permissions.network")}
              tip={t("scripts.permissions.networkTip")}
              checked={value.allowNetwork}
              disabled={disabled}
              onChange={(allowNetwork) => onChange({ allowNetwork })}
            />
            <PermRow
              label={t("scripts.permissions.clipboard")}
              tip={t("scripts.permissions.clipboardTip")}
              checked={value.allowClipboard}
              disabled={disabled}
              onChange={(allowClipboard) => onChange({ allowClipboard })}
            />
            <PermRow
              label={t("scripts.permissions.input")}
              tip={t("scripts.permissions.inputTip")}
              checked={value.allowInput}
              disabled={disabled}
              onChange={(allowInput) => onChange({ allowInput })}
            />
            <div className="caster-script-perms-sep" role="separator">
              {t("scripts.permissions.advanced")}
            </div>
            <PermRow
              label={t("scripts.permissions.fs")}
              tip={t("scripts.permissions.fsTip")}
              checked={value.allowFs}
              disabled={disabled}
              onChange={(allowFs) => onChange({ allowFs })}
            />
            <PermRow
              label={t("scripts.permissions.macros")}
              tip={t("scripts.permissions.macrosTip")}
              checked={value.allowMacroControl}
              disabled={disabled}
              onChange={(allowMacroControl) => onChange({ allowMacroControl })}
            />
            <PermRow
              label={t("scripts.permissions.process")}
              tip={t("scripts.permissions.processTip")}
              checked={value.allowProcess}
              disabled={disabled}
              onChange={(allowProcess) => onChange({ allowProcess })}
            />
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="caster-script-perms-menu">
      <button
        ref={triggerRef}
        type="button"
        className={[
          "caster-titlebar-btn",
          "caster-titlebar-text-btn",
          "caster-script-perms-btn",
          open ? "active" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        aria-label={t("scripts.permissions.label")}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
        <ChevronDown size={12} aria-hidden />
      </button>
      {panel}
    </div>
  );
}

function PermRow({
  label,
  tip,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  tip: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Tooltip content={tip}>
      <label
        className="caster-menu-item caster-script-perms-row"
        role="menuitemcheckbox"
        aria-checked={checked}
      >
        <span className="caster-menu-item-label">{label}</span>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
      </label>
    </Tooltip>
  );
}

export function activePermissionLabels(
  doc: {
    allowNetwork?: boolean;
    allowClipboard?: boolean;
    allowFs?: boolean;
    allowMacroControl?: boolean;
    allowInput?: boolean;
    allowProcess?: boolean;
  },
  t: TFunction,
): string[] {
  const out: string[] = [];
  if (doc.allowNetwork) out.push(t("scripts.permissions.network"));
  if (doc.allowClipboard) out.push(t("scripts.permissions.clipboard"));
  if (doc.allowInput) out.push(t("scripts.permissions.input"));
  if (doc.allowFs) out.push(t("scripts.permissions.fsShort"));
  if (doc.allowMacroControl) out.push(t("scripts.permissions.macrosShort"));
  if (doc.allowProcess) out.push(t("scripts.permissions.processShort"));
  return out;
}
