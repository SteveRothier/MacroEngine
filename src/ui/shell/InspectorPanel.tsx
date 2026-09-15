import type { ReactNode } from "react";

type Props = {
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function InspectorPanel({ title = "Inspecteur", children, footer }: Props) {
  return (
    <aside className="caster-inspector" aria-label={title}>
      <header className="caster-inspector-head">
        <h2>{title}</h2>
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
