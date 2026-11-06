import type { ReactNode } from "react";
import { Sparkles, X } from "lucide-react";

type Props = {
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Optional leading icon in the header (defaults to sparkles). */
  icon?: ReactNode | false;
  onClose?: () => void;
  closeLabel?: string;
};

export function InspectorPanel({
  title = "Inspecteur",
  children,
  footer,
  icon,
  onClose,
  closeLabel = "Fermer",
}: Props) {
  const leading =
    icon === false ? null : (icon ?? <Sparkles size={14} aria-hidden />);

  return (
    <aside className="caster-inspector" aria-label={title}>
      <header className="caster-inspector-head">
        <div className="caster-inspector-head-start">
          {leading ? (
            <span className="caster-inspector-head-icon">{leading}</span>
          ) : null}
          <h2>{title}</h2>
        </div>
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
      <summary>{title}</summary>
      <div className="caster-inspector-section-body">{children}</div>
    </details>
  );
}
