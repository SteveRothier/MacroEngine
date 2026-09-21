import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type TitleBarState = {
  pageTitle?: string;
  subToolbarHost: HTMLElement | null;
};

type TitleBarDispatch = {
  setPageTitle: (title?: string) => void;
  setSubToolbarHost: (el: HTMLElement | null) => void;
};

const TitleBarStateContext = createContext<TitleBarState | null>(null);
const TitleBarDispatchContext = createContext<TitleBarDispatch | null>(null);

export function TitleBarProvider({ children }: { children: ReactNode }) {
  const [pageTitle, setPageTitleState] = useState<string | undefined>();
  const subToolbarHostRef = useRef<HTMLElement | null>(null);
  const [subToolbarReady, setSubToolbarReady] = useState(false);

  const setPageTitle = useCallback((title?: string) => {
    setPageTitleState((prev) => (prev === title ? prev : title));
  }, []);

  const setSubToolbarHost = useCallback((el: HTMLElement | null) => {
    if (subToolbarHostRef.current === el) return;
    subToolbarHostRef.current = el;
    setSubToolbarReady(el != null);
  }, []);

  const state = useMemo(
    () => ({
      pageTitle,
      subToolbarHost: subToolbarReady ? subToolbarHostRef.current : null,
    }),
    [pageTitle, subToolbarReady],
  );

  const dispatch = useMemo(
    () => ({ setPageTitle, setSubToolbarHost }),
    [setPageTitle, setSubToolbarHost],
  );

  return (
    <TitleBarDispatchContext.Provider value={dispatch}>
      <TitleBarStateContext.Provider value={state}>
        {children}
      </TitleBarStateContext.Provider>
    </TitleBarDispatchContext.Provider>
  );
}

export function useTitleBarContext() {
  const state = useContext(TitleBarStateContext);
  const dispatch = useContext(TitleBarDispatchContext);
  if (!state || !dispatch) return null;
  return { ...state, ...dispatch };
}

export function useTitleBarDispatch() {
  return useContext(TitleBarDispatchContext);
}

/**
 * Titre titlebar + toolbar éditeur dans la barre secondaire (sous la titlebar).
 * Pass `active: false` when the editor is keep-mounted but hidden.
 */
export function useTitleBarSlot(
  pageTitle: string | undefined,
  toolbar: ReactNode,
  opts?: { active?: boolean },
) {
  const active = opts?.active !== false;
  const dispatch = useContext(TitleBarDispatchContext);
  const state = useContext(TitleBarStateContext);

  useEffect(() => {
    if (!dispatch || !active) return;
    dispatch.setPageTitle(pageTitle);
    return () => dispatch.setPageTitle(undefined);
  }, [dispatch, pageTitle, active]);

  if (!active || !state?.subToolbarHost) return null;
  return createPortal(toolbar, state.subToolbarHost);
}
