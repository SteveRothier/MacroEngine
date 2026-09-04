import { useMemo, useState, type MouseEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { MousePointer2, Play, Star, Workflow } from "lucide-react";
import { StatusPill, Tooltip, TruncatedTooltip, useToast } from "../ui/v2";
import { confirmAction } from "../ui";
import type { AppRoute } from "../app/types";
import { ScriptsLibraryPanel } from "../scripts/ScriptsLibraryPanel";
import { AutomationRowMenu } from "./AutomationRowMenu";
import { AutomationsToolbar } from "./AutomationsToolbar";
import {
  favoriteTooltip,
  kindTooltip,
  metaTooltip,
  statusTooltip,
} from "./rowLabels";
import {
  statusToPill,
  type AutomationFilter,
  type AutomationRow,
  type DisplayOptions,
} from "./types";
import { useUnifiedAutomations } from "./useUnifiedAutomations";

type Props = {
  onNavigate: (route: AppRoute) => void;
  onCreateMacro: () => void;
  onCreateClicker: () => void;
  onLaunchMacro?: (name: string) => void;
  onLaunchClicker?: (name: string) => void;
  dirtyMacroId?: string | null;
  dirtyClickerId?: string | null;
  refreshKey?: number;
  query: string;
  onQueryChange: (q: string) => void;
  filter: AutomationFilter;
  display: DisplayOptions;
  onDisplayChange: (d: DisplayOptions) => void;
  onFilterChange?: (f: AutomationFilter) => void;
  onRefresh?: () => void;
};

function rowKey(r: AutomationRow): string {
  return `${r.kind}:${r.id}`;
}

function KindIcon({ row }: { row: AutomationRow }) {
  const tip = kindTooltip(row);
  if (row.kind === "macro") {
    return (
      <Tooltip content={tip}>
        <span className="v2-auto-kind v2-auto-kind--macro" tabIndex={0}>
          <Workflow size={14} aria-hidden />
        </span>
      </Tooltip>
    );
  }
  return (
    <Tooltip content={tip}>
      <span className="v2-auto-kind v2-auto-kind--clicker" tabIndex={0}>
        <MousePointer2 size={14} aria-hidden />
      </span>
    </Tooltip>
  );
}

export function AutomationsTable({
  onNavigate,
  onCreateMacro,
  onCreateClicker,
  onLaunchMacro,
  onLaunchClicker,
  dirtyMacroId,
  dirtyClickerId,
  refreshKey,
  query,
  onQueryChange,
  filter,
  display,
  onDisplayChange,
  onFilterChange,
  onRefresh,
}: Props) {
  const toast = useToast();
  const { rows, loading, refresh } = useUnifiedAutomations({
    dirtyMacroId,
    dirtyClickerId,
    refreshKey,
    query,
    filter,
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menuKey, setMenuKey] = useState<string | null>(null);

  async function onToggleFavorite(r: AutomationRow, ev: MouseEvent) {
    ev.stopPropagation();
    const favorite = !r.favorite;
    try {
      await invoke("set_quick_favorite", {
        kind: r.kind,
        id: r.id,
        favorite,
      });
      await refresh();
      onRefresh?.();
    } catch (e) {
      const msg =
        typeof e === "string"
          ? e
          : e && typeof e === "object" && "message" in e
            ? String((e as { message?: unknown }).message)
            : "Impossible de modifier le favori";
      toast.error(msg);
    }
  }

  function launchRow(r: AutomationRow) {
    if (r.kind === "macro") onLaunchMacro?.(r.id);
    else onLaunchClicker?.(r.id);
  }

  const sorted = useMemo(() => {
    if (filter === "recent") return rows;
    const list = [...rows];
    list.sort((a, b) => {
      if (filter === "all" || filter === "favorites") {
        if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
      }
      if (display.sortBy === "type") return a.kind.localeCompare(b.kind);
      if (display.sortBy === "status") return a.status.localeCompare(b.status);
      return a.name.localeCompare(b.name, "fr");
    });
    return list;
  }, [rows, display.sortBy, filter]);

  const sections = useMemo(() => {
    if (filter !== "all") {
      return [{ id: "all", label: null as string | null, items: sorted }];
    }
    const favs = sorted.filter((r) => r.favorite);
    const rest = sorted.filter((r) => !r.favorite);
    const out: { id: string; label: string | null; items: AutomationRow[] }[] =
      [];
    if (favs.length > 0) {
      out.push({ id: "favorites", label: "Favoris", items: favs });
    }
    if (rest.length > 0 || favs.length === 0) {
      out.push({
        id: "all",
        label: favs.length > 0 ? "Toutes" : null,
        items: rest.length > 0 ? rest : sorted,
      });
    }
    return out;
  }, [sorted, filter]);

  const selectedRows = useMemo(() => {
    return sorted.filter((r) => selected.has(rowKey(r)));
  }, [sorted, selected]);

  const emptyState = useMemo(() => {
    if (filter === "favorites") {
      return (
        <div className="v2-empty-state">
          <strong>Aucun favori</strong>
          <p>Clique l’étoile sur une automation pour la retrouver ici.</p>
          <button
            type="button"
            className="v2-btn v2-btn-ghost"
            onClick={() => onFilterChange?.("all")}
          >
            Voir toutes les automations
          </button>
        </div>
      );
    }
    if (filter === "recent") {
      return (
        <div className="v2-empty-state">
          <strong>Aucune exécution récente</strong>
          <p>Lance une macro ou un clicker pour la voir apparaître ici.</p>
          <div className="v2-empty-actions">
            <button type="button" className="v2-btn" onClick={onCreateClicker}>
              Nouveau clicker
            </button>
            <button
              type="button"
              className="v2-btn v2-btn-primary"
              onClick={onCreateMacro}
            >
              Nouvelle macro
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="v2-empty-state">
        <strong>Aucune automation</strong>
        <p>Crée une macro ou un preset clicker pour commencer.</p>
        <button
          type="button"
          className="v2-btn v2-btn-primary"
          onClick={onCreateMacro}
        >
          Créer une macro
        </button>
      </div>
    );
  }, [filter, onCreateClicker, onCreateMacro, onFilterChange]);

  async function onDeleteSelected() {
    if (selectedRows.length === 0) return;
    const ok = await confirmAction({
      title: "Supprimer",
      message: `Supprimer ${selectedRows.length} automation${selectedRows.length > 1 ? "s" : ""} ?`,
      confirmLabel: "Supprimer",
      danger: true,
    });
    if (!ok) return;
    try {
      for (const r of selectedRows) {
        if (r.kind === "macro") {
          await invoke("delete_saved_macro", { name: r.id });
        } else {
          await invoke("delete_clicker_preset", { name: r.id });
        }
      }
      setSelected(new Set());
      onRefresh?.();
      toast.success("Suppression effectuée");
    } catch (e) {
      const msg =
        typeof e === "string"
          ? e
          : e && typeof e === "object" && "message" in e
            ? String((e as { message?: unknown }).message)
            : "Échec de la suppression";
      toast.error(msg);
    }
  }

  function onLaunchSelected() {
    const first = selectedRows[0];
    if (!first) return;
    launchRow(first);
  }

  function onOpenSelected() {
    const first = selectedRows[0];
    if (!first) return;
    onNavigate({ name: "automation", id: first.id, kind: first.kind });
  }

  function toggleSelect(id: string, multi: boolean) {
    setSelected((prev) => {
      const next = multi ? new Set(prev) : new Set<string>();
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onDeleteOne(r: AutomationRow) {
    const ok = await confirmAction({
      title: "Supprimer",
      message: `Supprimer « ${r.name} » ?`,
      confirmLabel: "Supprimer",
      danger: true,
    });
    if (!ok) return;
    try {
      if (r.kind === "macro") {
        await invoke("delete_saved_macro", { name: r.id });
      } else {
        await invoke("delete_clicker_preset", { name: r.id });
      }
      setMenuKey(null);
      onRefresh?.();
      toast.success("Suppression effectuée");
    } catch (e) {
      const msg =
        typeof e === "string"
          ? e
          : e && typeof e === "object" && "message" in e
            ? String((e as { message?: unknown }).message)
            : "Échec de la suppression";
      toast.error(msg);
    }
  }

  return (
    <div className="v2-page v2-automations-page">
      <AutomationsToolbar
        query={query}
        onQueryChange={onQueryChange}
        filter={filter}
        onFilterChange={(f) => onFilterChange?.(f)}
        display={display}
        onDisplayChange={onDisplayChange}
        onCreateMacro={onCreateMacro}
        onCreateClicker={onCreateClicker}
      />

      {filter === "scripts" ? (
        <ScriptsLibraryPanel refreshKey={refreshKey} />
      ) : (
        <>
      {selected.size > 0 ? (
        <div className="v2-automations-selection">
          <span>
            {selected.size} sélectionnée{selected.size > 1 ? "s" : ""}
          </span>
          <button
            type="button"
            className="v2-btn v2-btn-ghost"
            onClick={onOpenSelected}
          >
            Ouvrir
          </button>
          <button
            type="button"
            className="v2-btn v2-btn-primary"
            onClick={onLaunchSelected}
          >
            Lancer
          </button>
          <button
            type="button"
            className="v2-btn v2-btn-danger-ghost"
            onClick={() => void onDeleteSelected()}
          >
            Supprimer
          </button>
          <button
            type="button"
            className="v2-btn v2-btn-ghost"
            onClick={() => setSelected(new Set())}
          >
            Annuler
          </button>
        </div>
      ) : null}


      <div className="v2-page-body v2-automations-list-body">
        {loading ? (
          <p className="v2-empty-state">Chargement…</p>
        ) : sorted.length === 0 ? (
          emptyState
        ) : (
          <div className="v2-automations-list" role="list">
            {sections.map((section) => (
              <div key={section.id} className="v2-automations-section">
                {section.label ? (
                  <div className="v2-automations-section-label">
                    {section.label}
                  </div>
                ) : null}
                {section.items.map((r) => {
                  const key = rowKey(r);
                  const isSelected = selected.has(key);
                  const pill = statusToPill(r.status);
                  const metaParts = [
                    r.triggerLabel,
                    r.folderLabel !== "—" ? r.folderLabel : null,
                    r.lastRunLabel,
                  ].filter(Boolean);
                  const metaText = metaParts.join(" · ");
                  return (
                    <div
                      key={key}
                      role="listitem"
                      className={[
                        "v2-auto-row",
                        isSelected ? "is-selected" : "",
                        menuKey === key ? "is-menu-open" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() =>
                        onNavigate({
                          name: "automation",
                          id: r.id,
                          kind: r.kind,
                        })
                      }
                      onDoubleClick={(e) => {
                        e.preventDefault();
                        launchRow(r);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onNavigate({
                            name: "automation",
                            id: r.id,
                            kind: r.kind,
                          });
                        }
                      }}
                      tabIndex={0}
                    >
                      <Tooltip content="Sélectionner pour actions groupées">
                        <label
                          className="v2-auto-row-check"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(key, true)}
                            aria-label={`Sélectionner ${r.name}`}
                          />
                        </label>
                      </Tooltip>
                      <KindIcon row={r} />
                      <div className="v2-auto-row-main">
                        <TruncatedTooltip content={r.name}>
                          <span className="v2-auto-row-name">{r.name}</span>
                        </TruncatedTooltip>
                        {metaText ? (
                          <TruncatedTooltip content={metaTooltip(r)}>
                            <span className="v2-auto-row-meta">{metaText}</span>
                          </TruncatedTooltip>
                        ) : null}
                      </div>
                      <div
                        className="v2-auto-row-trail"
                        onClick={(e) => e.stopPropagation()}
                        onDoubleClick={(e) => e.stopPropagation()}
                      >
                        {r.status !== "healthy" ? (
                          <Tooltip content={statusTooltip(r.status)}>
                            <span className="v2-auto-row-status-wrap" tabIndex={0}>
                              <StatusPill kind={pill.kind} label={pill.label} />
                            </span>
                          </Tooltip>
                        ) : null}
                        <Tooltip content="Lancer">
                          <button
                            type="button"
                            className="v2-auto-row-play-btn"
                            aria-label={`Lancer ${r.name}`}
                            onClick={() => launchRow(r)}
                          >
                            <Play size={16} aria-hidden />
                          </button>
                        </Tooltip>
                        <Tooltip content={favoriteTooltip(r.favorite)}>
                          <button
                            type="button"
                            className={[
                              "v2-automation-fav",
                              r.favorite ? "is-on" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            aria-pressed={r.favorite}
                            aria-label={favoriteTooltip(r.favorite)}
                            onClick={(ev) => void onToggleFavorite(r, ev)}
                          >
                            <Star
                              size={16}
                              aria-hidden
                              fill={r.favorite ? "currentColor" : "none"}
                            />
                          </button>
                        </Tooltip>
                        <AutomationRowMenu
                          row={r}
                          open={menuKey === key}
                          onOpenChange={(open) =>
                            setMenuKey(open ? key : null)
                          }
                          onOpen={() =>
                            onNavigate({
                              name: "automation",
                              id: r.id,
                              kind: r.kind,
                            })
                          }
                          onLaunch={() => launchRow(r)}
                          onDelete={() => void onDeleteOne(r)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
        </>
      )}
    </div>
  );
}
