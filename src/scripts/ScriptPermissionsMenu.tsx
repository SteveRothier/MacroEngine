import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useT, type TFunction } from "../i18n";
import { Tooltip } from "../ui/v2";

export type ScriptPermissions = {
  allowNetwork: boolean;
  allowClipboard: boolean;
  allowFs: boolean;
  allowMacroControl: boolean;
};

type Props = {
  value: ScriptPermissions;
  onChange: (partial: Partial<ScriptPermissions>) => void;
  disabled?: boolean;
};

function countActive(v: ScriptPermissions): number {
  return [
    v.allowNetwork,
    v.allowClipboard,
    v.allowFs,
    v.allowMacroControl,
  ].filter(Boolean).length;
}

export function ScriptPermissionsMenu({ value, onChange, disabled }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const n = countActive(value);
  const label =
    n > 0
      ? t("scripts.permissions.labelCount", { count: n })
      : t("scripts.permissions.label");

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="v2-script-perms-menu" ref={wrapRef}>
      <button
        type="button"
        className={[
          "v2-titlebar-btn v2-titlebar-text-btn v2-script-perms-btn",
          open ? "active" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        {label}
        <ChevronDown size={12} aria-hidden />
      </button>
      {open ? (
        <div className="v2-menu-popover v2-script-perms-popover" role="menu">
          <PermRow
            label={t("scripts.permissions.network")}
            tip={t("scripts.permissions.networkTip")}
            checked={value.allowNetwork}
            onChange={(allowNetwork) => onChange({ allowNetwork })}
          />
          <PermRow
            label={t("scripts.permissions.clipboard")}
            tip={t("scripts.permissions.clipboardTip")}
            checked={value.allowClipboard}
            onChange={(allowClipboard) => onChange({ allowClipboard })}
          />
          <div className="v2-script-perms-sep" role="separator">
            {t("scripts.permissions.advanced")}
          </div>
          <PermRow
            label={t("scripts.permissions.fs")}
            tip={t("scripts.permissions.fsTip")}
            checked={value.allowFs}
            onChange={(allowFs) => onChange({ allowFs })}
          />
          <PermRow
            label={t("scripts.permissions.macros")}
            tip={t("scripts.permissions.macrosTip")}
            checked={value.allowMacroControl}
            onChange={(allowMacroControl) => onChange({ allowMacroControl })}
          />
        </div>
      ) : null}
    </div>
  );
}

function PermRow({
  label,
  tip,
  checked,
  onChange,
}: {
  label: string;
  tip: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Tooltip content={tip}>
      <label
        className="v2-menu-item v2-script-perms-row"
        role="menuitemcheckbox"
        aria-checked={checked}
      >
        <span className="v2-menu-item-label">{label}</span>
        <input
          type="checkbox"
          checked={checked}
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
  },
  t: TFunction,
): string[] {
  const out: string[] = [];
  if (doc.allowNetwork) out.push(t("scripts.permissions.network"));
  if (doc.allowClipboard) out.push(t("scripts.permissions.clipboard"));
  if (doc.allowFs) out.push(t("scripts.permissions.fsShort"));
  if (doc.allowMacroControl) out.push(t("scripts.permissions.macrosShort"));
  return out;
}
