import type { ReactNode } from "react";
import "./layout.css";

type WorkspaceProps = {
  header?: ReactNode;
  children: ReactNode;
  /** Opt-in max width for secondary pages (About, Keybinds). */
  narrow?: boolean;
  className?: string;
};

export function Workspace({
  header,
  children,
  narrow = false,
  className = "",
}: WorkspaceProps) {
  return (
    <div
      className={["workspace", narrow ? "layout-narrow" : "", className]
        .filter(Boolean)
        .join(" ")}
    >
      {header ? <div className="workspace-header">{header}</div> : null}
      <div className="workspace-body">{children}</div>
    </div>
  );
}

type WorkspaceScrollProps = {
  children: ReactNode;
  className?: string;
};

/** Scrollable region inside workspace body (filet si contenu trop haut). */
export function WorkspaceScroll({
  children,
  className = "",
}: WorkspaceScrollProps) {
  return (
    <div className={["workspace-scroll", className].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}
