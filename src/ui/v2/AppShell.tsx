import { useCallback, type ReactNode } from "react";
import { useTitleBarDispatch } from "./TitleBarContext";

type Props = {
  titleBar: ReactNode;
  children: ReactNode;
  rootClassName?: string;
  density?: "comfortable" | "compact";
  fontScale?: number;
  accent?: "default" | "blue" | "teal";
  reduceMotion?: boolean;
};

export function AppShell({
  titleBar,
  children,
  rootClassName,
  density = "comfortable",
  fontScale = 1,
  accent = "default",
  reduceMotion = false,
}: Props) {
  const dispatch = useTitleBarDispatch();
  const subToolbarRef = useCallback(
    (el: HTMLDivElement | null) => {
      dispatch?.setSubToolbarHost(el);
    },
    [dispatch],
  );

  return (
    <div
      className={["v2-root", rootClassName].filter(Boolean).join(" ")}
      data-density={density}
      data-accent={accent}
      data-reduce-motion={reduceMotion ? "true" : undefined}
      style={{ fontSize: `${fontScale * 100}%` }}
    >
      <div className="v2-titlebar-shell">{titleBar}</div>
      <div className="v2-content">
        <div className="v2-editor-toolbar-host" ref={subToolbarRef} />
        <div className="v2-main">
          <div className="v2-stage">{children}</div>
        </div>
      </div>
    </div>
  );
}
