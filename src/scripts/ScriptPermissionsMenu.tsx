import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
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
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const n = countActive(value);
  const label = n > 0 ? `Permissions ·${n}` : "Permissions";

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
            label="Réseau"
            tip="Autorise caster.fetch — le script peut envoyer des requêtes réseau."
            checked={value.allowNetwork}
            onChange={(allowNetwork) => onChange({ allowNetwork })}
          />
          <PermRow
            label="Presse-papiers"
            tip="Le script peut lire et écrire le presse-papiers système."
            checked={value.allowClipboard}
            onChange={(allowClipboard) => onChange({ allowClipboard })}
          />
          <div className="v2-script-perms-sep" role="separator">
            Avancé
          </div>
          <PermRow
            label="Fichiers (sandbox)"
            tip="Lecture/écriture limitée au dossier script-data/ de Caster — aucun autre accès disque."
            checked={value.allowFs}
            onChange={(allowFs) => onChange({ allowFs })}
          />
          <PermRow
            label="Macros (profondeur 3)"
            tip="Le script peut lancer d’autres macros via runMacro (profondeur max 3)."
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

export function activePermissionLabels(doc: {
  allowNetwork?: boolean;
  allowClipboard?: boolean;
  allowFs?: boolean;
  allowMacroControl?: boolean;
}): string[] {
  const out: string[] = [];
  if (doc.allowNetwork) out.push("Réseau");
  if (doc.allowClipboard) out.push("Presse-papiers");
  if (doc.allowFs) out.push("Fichiers");
  if (doc.allowMacroControl) out.push("Macros");
  return out;
}
