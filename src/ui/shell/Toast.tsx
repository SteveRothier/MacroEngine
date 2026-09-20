import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { useT } from "../../i18n";

export type ToastKind = "success" | "error" | "info";

export type ToastAction = {
  label: string;
  onClick: () => void;
};

export type ToastItem = {
  id: string;
  kind: ToastKind;
  message: string;
  action?: ToastAction;
};

type ToastPushOptions = {
  action?: ToastAction;
  durationMs?: number;
};

type ToastApi = {
  push: (kind: ToastKind, message: string, opts?: ToastPushOptions) => void;
  success: (message: string, opts?: ToastPushOptions) => void;
  error: (message: string, opts?: ToastPushOptions) => void;
  info: (message: string, opts?: ToastPushOptions) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const MAX_TOASTS = 3;
const DISMISS_MS = 4200;
const ACTION_DISMISS_MS = 8000;

let toastSeq = 0;

function ToastKindIcon({ kind }: { kind: ToastKind }) {
  const props = { size: 18, strokeWidth: 2, "aria-hidden": true as const };
  if (kind === "success") return <CheckCircle2 {...props} />;
  if (kind === "error") return <AlertCircle {...props} />;
  return <Info {...props} />;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string, opts?: ToastPushOptions) => {
      const id = `toast-${++toastSeq}`;
      setItems((prev) => {
        const next = [
          ...prev,
          { id, kind, message, action: opts?.action },
        ];
        return next.slice(-MAX_TOASTS);
      });
      const ms =
        opts?.durationMs ??
        (opts?.action ? ACTION_DISMISS_MS : DISMISS_MS);
      window.setTimeout(() => dismiss(id), ms);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      push,
      success: (m, o) => push("success", m, o),
      error: (m, o) => push("error", m, o),
      info: (m, o) => push("info", m, o),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="caster-toast-host" aria-live="polite" aria-relevant="additions">
        {items.map((toast) => (
          <div
            key={toast.id}
            className={["caster-toast", `caster-toast--${toast.kind}`].join(" ")}
            role={toast.kind === "error" ? "alert" : "status"}
          >
            <span className="caster-toast-icon">
              <ToastKindIcon kind={toast.kind} />
            </span>
            <div className="caster-toast-body">
              <span className="caster-toast-msg">{toast.message}</span>
              {toast.action ? (
                <button
                  type="button"
                  className="caster-toast-action"
                  onClick={() => {
                    toast.action?.onClick();
                    dismiss(toast.id);
                  }}
                >
                  {toast.action.label}
                </button>
              ) : null}
            </div>
            <button
              type="button"
              className="caster-toast-dismiss"
              aria-label={t("common.close")}
              onClick={() => dismiss(toast.id)}
            >
              <X size={16} strokeWidth={2.25} aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      push: () => undefined,
      success: () => undefined,
      error: () => undefined,
      info: () => undefined,
    };
  }
  return ctx;
}
