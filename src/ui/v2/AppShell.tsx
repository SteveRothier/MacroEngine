import { useCallback, type ReactNode } from "react";
import { useTitleBarDispatch } from "./TitleBarContext";

type Props = {
  titleBar: ReactNode;
  children: ReactNode;
};

export function AppShell({ titleBar, children }: Props) {
  const dispatch = useTitleBarDispatch();
  const subToolbarRef = useCallback(
    (el: HTMLDivElement | null) => {
      dispatch?.setSubToolbarHost(el);
    },
    [dispatch],
  );

  return (
    <div className="v2-root">
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
