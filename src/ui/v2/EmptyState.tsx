import type { ReactNode } from "react";

type Props = {
  title: string;
  lead?: string;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

/** Shared empty placeholder for Accueil, journal, consoles, listes. */
export function EmptyState({
  title,
  lead,
  children,
  actions,
  className,
}: Props) {
  return (
    <div className={["v2-empty-state", className].filter(Boolean).join(" ")}>
      <strong>{title}</strong>
      {lead ? <p>{lead}</p> : null}
      {children}
      {actions ? <div className="v2-empty-actions">{actions}</div> : null}
    </div>
  );
}
