import type { ProcessFilter } from "../clickerTypes";
import { useT, type TFunction } from "../../i18n";

type Props = {
  filter: ProcessFilter;
  onOpenSettings?: () => void;
};

function filterSummary(filter: ProcessFilter, t: TFunction): string {
  if (!filter.enabled) return t("clicker.process.allProcesses");
  const names = filter.names.filter((n) => n.trim().length > 0);
  if (names.length === 0) {
    return filter.mode === "allow"
      ? t("clicker.process.noneAllowed")
      : t("clicker.process.allAllowed");
  }
  const list = names.slice(0, 3).join(", ");
  const extra = names.length > 3 ? ` +${names.length - 3}` : "";
  return filter.mode === "allow"
    ? t("clicker.process.allowList", { list: `${list}${extra}` })
    : t("clicker.process.denyList", { list: `${list}${extra}` });
}

export function ClickerProcessFilterRow({ filter, onOpenSettings }: Props) {
  const t = useT();
  const summary = filterSummary(filter, t);

  return (
    <div className="caster-clicker-process-row">
      <span className="caster-clicker-process-label">{t("clicker.process.label")}</span>
      <span
        className={[
          "caster-clicker-process-badge",
          filter.enabled ? "caster-clicker-process-badge--active" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        title={summary}
      >
        {summary}
      </span>
      {onOpenSettings ? (
        <button
          type="button"
          className="caster-btn caster-btn-ghost caster-clicker-process-link"
          onClick={onOpenSettings}
        >
          {t("clicker.process.settings")}
        </button>
      ) : null}
    </div>
  );
}
