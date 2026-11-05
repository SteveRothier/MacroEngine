import { Component, type ErrorInfo, type ReactNode } from "react";
import { resolveLocale, tStatic } from "../../i18n";

type Props = {
  children: ReactNode;
};

type State = {
  error: Error | null;
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Caster UI error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      const t = (key: string) => tStatic(resolveLocale("system"), key);
      return (
        <div className="caster-root caster-fatal-error">
          <h1>{t("shell.errorTitle")}</h1>
          <p>{this.state.error.message}</p>
          <button
            type="button"
            className="caster-btn"
            onClick={() => {
              // Soft remount fails after Vite HMR invalidates React context
              // modules (e.g. LocaleProvider / useLocale). Full reload recovers.
              window.location.reload();
            }}
          >
            {t("shell.retry")}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
