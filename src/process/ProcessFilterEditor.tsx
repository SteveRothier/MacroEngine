import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import {
  Check,
  Copy,
  Download,
  MoreHorizontal,
  RefreshCw,
  Save,
  X,
} from "lucide-react";
import { useT } from "../i18n";
import { promptAction } from "../ui";
import { pushRecentExe, readRecentExes } from "./recentExes";
import {
  displayExeName,
  type ProcessFilter,
  type ProcessFilterMode,
  type ProcessFilterPreset,
} from "./types";
import {
  addProcessName,
  removeProcessName,
  useProcessExePicker,
  withLocalEnabled,
} from "./useProcessExePicker";

export type ProcessFilterEditorProps = {
  filter: ProcessFilter;
  onChange: (filter: ProcessFilter) => void;
  disabled?: boolean;
  /** Settings: show enabled switch. */
  showEnabledToggle?: boolean;
  /** Document local mode: keep enabled=true on every edit. */
  forceEnabled?: boolean;
  presets?: ProcessFilterPreset[];
  onPresetsChange?: (presets: ProcessFilterPreset[]) => void;
  /** When false, hide the ⋯ menu (e.g. hosted in panel title). Default true. */
  showPresetsMenu?: boolean;
  onCopyToGlobal?: () => void;
  onImportFromGlobal?: () => void;
};

function ExeIcon({ dataUrl }: { dataUrl?: string | null }) {
  if (!dataUrl) {
    return <span className="caster-process-exe-icon-fallback" aria-hidden />;
  }
  return (
    <img
      className="caster-process-exe-icon"
      src={dataUrl}
      alt=""
      width={16}
      height={16}
      draggable={false}
    />
  );
}

function newPresetId(): string {
  return `pfp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export type ProcessFilterPresetsMenuProps = {
  filter: ProcessFilter;
  onApply: (next: ProcessFilter) => void;
  disabled?: boolean;
  listDisabled?: boolean;
  presets?: ProcessFilterPreset[];
  onPresetsChange: (presets: ProcessFilterPreset[]) => void;
  onCopyToGlobal?: () => void;
  onImportFromGlobal?: () => void;
};

export function ProcessFilterPresetsMenu({
  filter,
  onApply,
  disabled,
  listDisabled,
  presets = [],
  onPresetsChange,
  onCopyToGlobal,
  onImportFromGlobal,
}: ProcessFilterPresetsMenuProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<CSSProperties | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const id = window.setTimeout(() => {
      document.addEventListener("mousedown", onDoc);
      document.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;
    const update = () => {
      const tRect = trigger.getBoundingClientRect();
      const pRect = panel.getBoundingClientRect();
      const pad = 8;
      let left = tRect.right - pRect.width;
      left = Math.max(pad, Math.min(left, window.innerWidth - pad - pRect.width));
      let top = tRect.bottom + 6;
      if (top + pRect.height > window.innerHeight - pad) {
        const above = tRect.top - 6 - pRect.height;
        if (above >= pad) top = above;
      }
      setCoords({
        position: "fixed",
        top,
        left,
        right: "auto",
        zIndex: 12000,
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, presets.length]);

  const savePreset = () => {
    setOpen(false);
    void (async () => {
      const label =
        filter.names.length === 0
          ? t("common.process.presetUntitled")
          : filter.names
              .slice(0, 2)
              .map(displayExeName)
              .join(", ") + (filter.names.length > 2 ? "…" : "");
      const name = await promptAction({
        title: t("common.process.presetNamePrompt"),
        message: t("common.process.presetSave"),
        defaultValue: label,
        confirmLabel: t("common.save"),
        placeholder: t("common.process.presetUntitled"),
      });
      const trimmed = name?.trim();
      if (!trimmed) return;
      onPresetsChange([
        ...presets,
        {
          id: newPresetId(),
          name: trimmed,
          mode: filter.mode,
          names: [...filter.names],
        },
      ]);
    })();
  };

  const applyPreset = (preset: ProcessFilterPreset) => {
    onApply({
      ...filter,
      mode: preset.mode,
      names: [...preset.names],
    });
    setOpen(false);
  };

  const removePreset = (id: string) => {
    onPresetsChange(presets.filter((p) => p.id !== id));
  };

  const panel =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={panelRef}
            id={menuId}
            role="menu"
            aria-label={t("common.process.presetsAria")}
            className="caster-menu-popover caster-process-filter-presets-menu"
            style={coords ?? { position: "fixed", visibility: "hidden" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              className="caster-menu-item"
              disabled={disabled}
              onClick={savePreset}
            >
              <span className="caster-menu-item-icon" aria-hidden>
                <Save size={14} />
              </span>
              <span className="caster-menu-item-text">
                <span className="caster-menu-item-label">
                  {t("common.process.presetSave")}
                </span>
              </span>
            </button>
            {onCopyToGlobal || onImportFromGlobal ? (
              <>
                <div className="caster-menu-separator" role="separator" />
                {onCopyToGlobal ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="caster-menu-item"
                    disabled={disabled || listDisabled}
                    onClick={() => {
                      onCopyToGlobal();
                      setOpen(false);
                    }}
                  >
                    <span className="caster-menu-item-icon" aria-hidden>
                      <Copy size={14} />
                    </span>
                    <span className="caster-menu-item-text">
                      <span className="caster-menu-item-label">
                        {t("common.process.copyToGlobal")}
                      </span>
                    </span>
                  </button>
                ) : null}
                {onImportFromGlobal ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="caster-menu-item"
                    disabled={disabled || listDisabled}
                    onClick={() => {
                      onImportFromGlobal();
                      setOpen(false);
                    }}
                  >
                    <span className="caster-menu-item-icon" aria-hidden>
                      <Download size={14} />
                    </span>
                    <span className="caster-menu-item-text">
                      <span className="caster-menu-item-label">
                        {t("common.process.importFromGlobal")}
                      </span>
                    </span>
                  </button>
                ) : null}
              </>
            ) : null}
            {presets.length > 0 ? (
              <>
                <div className="caster-menu-separator" role="separator" />
                {presets.map((preset) => (
                  <div
                    key={preset.id}
                    className="caster-process-filter-presets-row"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      className="caster-menu-item"
                      disabled={listDisabled || disabled}
                      onClick={() => applyPreset(preset)}
                    >
                      <span className="caster-menu-item-text">
                        <span className="caster-menu-item-label">
                          {preset.name}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="caster-process-filter-presets-row-remove"
                      disabled={disabled}
                      aria-label={t("common.process.presetRemove")}
                      title={t("common.process.presetRemove")}
                      onClick={(e) => {
                        e.stopPropagation();
                        removePreset(preset.id);
                      }}
                    >
                      <X size={12} aria-hidden />
                    </button>
                  </div>
                ))}
              </>
            ) : null}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="caster-process-filter-presets" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="caster-process-filter-presets-btn"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        aria-label={t("common.process.presetsAria")}
        title={t("common.process.presetsAria")}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreHorizontal size={14} aria-hidden />
      </button>
      {panel}
    </div>
  );
}

export function ProcessFilterEditor({
  filter,
  onChange,
  disabled,
  showEnabledToggle,
  forceEnabled,
  presets = [],
  onPresetsChange,
  showPresetsMenu = true,
  onCopyToGlobal,
  onImportFromGlobal,
}: ProcessFilterEditorProps) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState(readRecentExes);
  const { rows, iconsByName, loading, refresh } = useProcessExePicker(filter.names);

  const commit = (next: ProcessFilter) => {
    onChange(forceEnabled ? withLocalEnabled(next) : next);
  };

  const remember = (raw: string) => {
    setRecent(pushRecentExe(raw));
  };

  const listDisabled = Boolean(disabled || (showEnabledToggle && !filter.enabled));

  const toggleName = (raw: string, inFilter: boolean) => {
    if (inFilter) {
      commit(removeProcessName(filter, raw));
      return;
    }
    const next = addProcessName(filter, raw);
    if (!next) return;
    commit(next);
    remember(raw);
  };

  const addFromQuery = () => {
    const next = addProcessName(filter, query);
    if (!next) return;
    commit(next);
    remember(query);
    setQuery("");
  };

  const q = query.trim().toLowerCase();
  const liveRows = useMemo(() => {
    if (!q) return rows;
    return rows.filter((r) => r.name.includes(q));
  }, [rows, q]);

  return (
    <div className="caster-process-filter-editor">
      {showEnabledToggle ? (
        <label className="caster-process-filter-editor-enabled">
          <input
            type="checkbox"
            checked={filter.enabled}
            disabled={disabled}
            onChange={(e) => commit({ ...filter, enabled: e.target.checked })}
          />
          <span>{t("common.process.localEnabled")}</span>
        </label>
      ) : null}

      <div className="caster-process-filter-panel-head-local">
        <div className="caster-process-filter-editor-mode-row">
          <div
            className="caster-segmented"
            role="group"
            aria-label={t("common.process.localModeAria")}
          >
            {(
              [
                ["allow", t("common.process.localModeAllow")],
                ["deny", t("common.process.localModeDeny")],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={[
                  "caster-segmented-btn",
                  filter.mode === value ? "active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                disabled={listDisabled}
                onClick={() =>
                  commit({ ...filter, mode: value as ProcessFilterMode })
                }
              >
                {label}
              </button>
            ))}
          </div>
          {showPresetsMenu && onPresetsChange ? (
            <ProcessFilterPresetsMenu
              filter={filter}
              onApply={commit}
              disabled={disabled}
              listDisabled={listDisabled}
              presets={presets}
              onPresetsChange={onPresetsChange}
              onCopyToGlobal={onCopyToGlobal}
              onImportFromGlobal={onImportFromGlobal}
            />
          ) : null}
        </div>

        {filter.names.length === 0 ? (
          <p className="caster-process-filter-panel-summary">
            {t("common.process.localEmpty")}
          </p>
        ) : (
          <ul
            className="caster-process-filter-panel-chip-list"
            aria-label={t("common.process.filterList")}
          >
            {filter.names.map((name) => (
              <li key={name}>
                <ExeIcon dataUrl={iconsByName.get(name)} />
                <span>{displayExeName(name)}</span>
                <button
                  type="button"
                  className="caster-process-filter-panel-chip-remove"
                  disabled={listDisabled}
                  aria-label={t("common.process.localRemove")}
                  onClick={() => commit(removeProcessName(filter, name))}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="caster-process-filter-panel-live">
        {recent.length > 0 ? (
          <div className="caster-process-filter-recent">
            <span className="caster-process-filter-recent-label">
              {t("common.process.recent")}
            </span>
            <ul className="caster-process-filter-recent-list">
              {recent.map((name) => {
                const inFilter = filter.names.some(
                  (n) => n.toLowerCase() === name,
                );
                return (
                  <li key={name}>
                    <button
                      type="button"
                      className={[
                        "caster-process-filter-recent-btn",
                        inFilter ? "is-in-filter" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      disabled={listDisabled || inFilter}
                      title={t("common.process.recentAdd", {
                        name: displayExeName(name),
                      })}
                      onClick={() => toggleName(name, false)}
                    >
                      <ExeIcon dataUrl={iconsByName.get(name)} />
                      <span>{displayExeName(name)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
        <div className="caster-process-filter-panel-search-row">
          <input
            type="search"
            className="caster-process-filter-panel-search"
            value={query}
            disabled={listDisabled}
            placeholder={t("common.process.liveSearch")}
            aria-label={t("common.process.liveSearch")}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              addFromQuery();
            }}
          />
          <button
            type="button"
            className="caster-process-filter-panel-refresh"
            disabled={listDisabled || loading}
            aria-label={t("common.process.liveRefresh")}
            title={t("common.process.liveRefresh")}
            onClick={() => void refresh()}
          >
            <RefreshCw size={14} aria-hidden />
          </button>
        </div>
        <ul
          className="caster-process-filter-panel-live-list"
          aria-busy={loading || undefined}
        >
          {liveRows.length === 0 ? (
            <li className="caster-process-filter-panel-empty">
              {loading
                ? t("common.process.liveLoading")
                : t("common.process.pickEmpty")}
            </li>
          ) : (
            liveRows.map((row) => (
              <li key={row.name}>
                <button
                  type="button"
                  className={[
                    "caster-process-filter-panel-live-item",
                    row.foreground ? "is-foreground" : "",
                    row.inFilter ? "is-in-filter" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  disabled={listDisabled}
                  aria-pressed={row.inFilter}
                  onClick={() => toggleName(row.name, row.inFilter)}
                >
                  <ExeIcon dataUrl={row.iconDataUrl} />
                  <span>
                    {row.foreground
                      ? t("common.process.foreground", {
                          name: displayExeName(row.name),
                        })
                      : displayExeName(row.name)}
                  </span>
                  {row.inFilter ? (
                    <Check
                      className="caster-process-filter-panel-check"
                      size={14}
                      aria-hidden
                    />
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
