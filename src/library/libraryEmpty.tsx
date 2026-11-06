import type { ReactNode } from "react";
import type { useT } from "../i18n";
import type { AutomationKindFilter } from "../automations/types";
import type { LibScope } from "./libTree";

type Translate = ReturnType<typeof useT>;

export type LibraryEmptyAction = { label: string; onClick: () => void };

export function LibraryEmpty({
  title,
  lead,
  action,
}: {
  title: string;
  lead: string;
  action?: LibraryEmptyAction;
}) {
  return (
    <div className="caster-lib-empty">
      <p className="caster-lib-empty-title">{title}</p>
      <p className="caster-lib-empty-lead">{lead}</p>
      {action ? (
        <button
          type="button"
          className="caster-lib-empty-action"
          onClick={action.onClick}
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}

export function libraryEmptyForScope({
  t,
  query,
  scope,
  onClearSearch,
  onSeeAll,
}: {
  t: Translate;
  query: string;
  scope: LibScope;
  onClearSearch: () => void;
  onSeeAll: () => void;
}): ReactNode {
  if (query.trim()) {
    return (
      <LibraryEmpty
        title={t("automations.empty.noResultsTitle")}
        lead={t("automations.empty.noResultsLead")}
        action={{
          label: t("automations.empty.clearSearch"),
          onClick: onClearSearch,
        }}
      />
    );
  }
  if (scope === "favorites") {
    return (
      <LibraryEmpty
        title={t("automations.empty.noFavoritesTitle")}
        lead={t("automations.empty.noFavoritesLead")}
        action={{
          label: t("automations.empty.seeAll"),
          onClick: onSeeAll,
        }}
      />
    );
  }
  return (
    <LibraryEmpty
      title={t("automations.empty.noResultsTitle")}
      lead={t("automations.empty.noResultsLead")}
    />
  );
}

export function libraryEmptyForBrowse({
  t,
  query,
  kindFilter,
  allRowsLength,
  onClearSearch,
  onClearKind,
}: {
  t: Translate;
  query: string;
  kindFilter: AutomationKindFilter;
  allRowsLength: number;
  onClearSearch: () => void;
  onClearKind: () => void;
}): ReactNode {
  if (query.trim()) {
    return (
      <LibraryEmpty
        title={t("automations.empty.noResultsTitle")}
        lead={t("automations.empty.noResultsLead")}
        action={{
          label: t("automations.empty.clearSearch"),
          onClick: onClearSearch,
        }}
      />
    );
  }
  const kindCopy =
    kindFilter === "macro"
      ? {
          title: t("automations.empty.noKindMacroTitle"),
          lead: t("automations.empty.noKindMacroLead"),
        }
      : kindFilter === "clicker"
        ? {
            title: t("automations.empty.noKindClickerTitle"),
            lead: t("automations.empty.noKindClickerLead"),
          }
        : kindFilter === "script"
          ? {
              title: t("automations.empty.noKindScriptTitle"),
              lead: t("automations.empty.noKindScriptLead"),
            }
          : null;
  if (kindCopy) {
    return (
      <LibraryEmpty
        title={kindCopy.title}
        lead={kindCopy.lead}
        action={{
          label: t("automations.empty.clearKindFilter"),
          onClick: onClearKind,
        }}
      />
    );
  }
  if (allRowsLength === 0) {
    return (
      <LibraryEmpty
        title={t("automations.empty.noAutomationsTitle")}
        lead={t("automations.empty.noAutomationsLead")}
      />
    );
  }
  return (
    <LibraryEmpty
      title={t("automations.empty.noResultsTitle")}
      lead={t("automations.empty.noResultsLead")}
    />
  );
}
