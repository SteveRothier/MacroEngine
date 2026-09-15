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
        <div className="v2-root v2-fatal-error">
          <h1>{t("shell.errorTitle")}</h1>
          <p>{this.state.error.message}</p>
          <button
            type="button"
            className="v2-btn"
            onClick={() => this.setState({ error: null })}
          >
            {t("shell.retry")}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
