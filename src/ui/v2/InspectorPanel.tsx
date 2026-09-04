import type { ReactNode } from "react";

type Props = {
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function InspectorPanel({ title = "Inspecteur", children, footer }: Props) {
  return (
    <aside className="v2-inspector" aria-label={title}>
      <header className="v2-inspector-head">
        <h2>{title}</h2>
      </header>
      <div className="v2-inspector-body">{children}</div>
      {footer ? <footer className="v2-inspector-foot">{footer}</footer> : null}
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
    <details className="v2-inspector-section" open={defaultOpen}>
      <summary>{title}</summary>
      <div className="v2-inspector-section-body">{children}</div>
    </details>
  );
}
