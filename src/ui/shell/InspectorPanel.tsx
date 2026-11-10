import type { ReactNode } from "react";
import { ChevronDown, Sparkles, X } from "lucide-react";

type Props = {
  /** Panel title; `false` hides the title row and keeps trailing as the header. */
  title?: string | false;
  children: ReactNode;
  footer?: ReactNode;
  /** Optional leading icon in the header (defaults to sparkles). Ignored when title is false. */
  icon?: ReactNode | false;
  /** Trailing controls in the header row (e.g. Étape / Macro). */
  trailing?: ReactNode;
  onClose?: () => void;
  closeLabel?: string;
  /** Accessible name when title is hidden. */
  ariaLabel?: string;
};

export function InspectorPanel({
  title = "Inspecteur",
  children,
  footer,
  icon,
  trailing,
  onClose,
  closeLabel = "Fermer",
  ariaLabel,
}: Props) {
  const hideTitle = title === false;
  const leading =
    hideTitle || icon === false
      ? null
      : (icon ?? <Sparkles size={14} aria-hidden />);
  const label =
    ariaLabel ?? (typeof title === "string" ? title : "Inspecteur");

  return (
    <aside className="caster-inspector" aria-label={label}>
      <header
        className={[
          "caster-inspector-head",
          hideTitle ? "is-mode-only" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {hideTitle ? null : (
          <div className="caster-inspector-head-start">
            {leading ? (
              <span className="caster-inspector-head-icon">{leading}</span>
            ) : null}
            <h2>{title}</h2>
          </div>
        )}
        <div className="caster-inspector-head-end">
          {trailing}
          {onClose ? (
            <button
              type="button"
              className="caster-inspector-close"
              onClick={onClose}
              aria-label={closeLabel}
              title={closeLabel}
            >
              <X size={14} aria-hidden />
            </button>
          ) : null}
        </div>
      </header>
      <div className="caster-inspector-body">{children}</div>
      {footer ? <footer className="caster-inspector-foot">{footer}</footer> : null}
    </aside>
  );
}

export function InspectorSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="caster-inspector-section" open={defaultOpen}>
      <summary>
        <span className="caster-inspector-section-title">{title}</span>
        <ChevronDown
          size={14}
          aria-hidden
          className="caster-inspector-section-chevron"
        />
      </summary>
      <div className="caster-inspector-section-body">{children}</div>
    </details>
  );
}
