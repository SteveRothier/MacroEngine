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
  /** Host in the window chrome for the document name. */
  chromeHost: HTMLElement | null;
  /** Host below the chrome for the editor toolbar. */
  subToolbarHost: HTMLElement | null;
};

type TitleBarDispatch = {
  setPageTitle: (title?: string) => void;
  setChromeHost: (el: HTMLElement | null) => void;
  setSubToolbarHost: (el: HTMLElement | null) => void;
};

const TitleBarStateContext = createContext<TitleBarState | null>(null);
const TitleBarDispatchContext = createContext<TitleBarDispatch | null>(null);

export function TitleBarProvider({ children }: { children: ReactNode }) {
  const [pageTitle, setPageTitleState] = useState<string | undefined>();
  const chromeHostRef = useRef<HTMLElement | null>(null);
  const subToolbarHostRef = useRef<HTMLElement | null>(null);
  const [chromeReady, setChromeReady] = useState(false);
  const [subToolbarReady, setSubToolbarReady] = useState(false);

  const setPageTitle = useCallback((title?: string) => {
    setPageTitleState((prev) => (prev === title ? prev : title));
  }, []);

  const setChromeHost = useCallback((el: HTMLElement | null) => {
    if (chromeHostRef.current === el) return;
    chromeHostRef.current = el;
    setChromeReady(el != null);
  }, []);

  const setSubToolbarHost = useCallback((el: HTMLElement | null) => {
    if (subToolbarHostRef.current === el) return;
    subToolbarHostRef.current = el;
    setSubToolbarReady(el != null);
  }, []);

  const state = useMemo(
    () => ({
      pageTitle,
      chromeHost: chromeReady ? chromeHostRef.current : null,
      subToolbarHost: subToolbarReady ? subToolbarHostRef.current : null,
    }),
    [pageTitle, chromeReady, subToolbarReady],
  );

  const dispatch = useMemo(
    () => ({ setPageTitle, setChromeHost, setSubToolbarHost }),
    [setPageTitle, setChromeHost, setSubToolbarHost],
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
 * Titre page + chrome (nom) + toolbar éditeur portailés.
 * Pass `active: false` when the editor is keep-mounted but hidden.
 */
export function useTitleBarSlot(
  pageTitle: string | undefined,
  toolbar: ReactNode,
  opts?: { active?: boolean; chrome?: ReactNode },
) {
  const active = opts?.active !== false;
  const chrome = opts?.chrome;
  const dispatch = useContext(TitleBarDispatchContext);
  const state = useContext(TitleBarStateContext);

  useEffect(() => {
    if (!dispatch || !active) return;
    dispatch.setPageTitle(pageTitle);
    return () => dispatch.setPageTitle(undefined);
  }, [dispatch, pageTitle, active]);

  if (!active) return null;

  return (
    <>
      {chrome != null && state?.chromeHost
        ? createPortal(chrome, state.chromeHost)
        : null}
      {toolbar != null && state?.subToolbarHost
        ? createPortal(toolbar, state.subToolbarHost)
        : null}
    </>
  );
}
