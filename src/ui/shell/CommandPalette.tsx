import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useT } from "../../i18n";

export type CommandItem = {
  id: string;
  label: string;
  hint?: string;
  group?: string;
  onSelect: () => void;
};

type Props = {
  open: boolean;
  onClose: () => void;
  items: CommandItem[];
};

type Grouped = { group: string; items: { item: CommandItem; index: number }[] };

export function CommandPalette({ open, onClose, items }: Props) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const defaultGroup = t("shell.commandGroup");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.label.toLowerCase().includes(q) ||
        i.hint?.toLowerCase().includes(q) ||
        i.group?.toLowerCase().includes(q),
    );
  }, [items, query]);

  const grouped = useMemo((): Grouped[] => {
    const order: string[] = [];
    const map = new Map<string, { item: CommandItem; index: number }[]>();
    filtered.forEach((item, index) => {
      const g = item.group?.trim() || defaultGroup;
      if (!map.has(g)) {
        map.set(g, []);
        order.push(g);
      }
      map.get(g)!.push({ item, index });
    });
    return order.map((group) => ({ group, items: map.get(group)! }));
  }, [filtered, defaultGroup]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => Math.min(a + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => Math.max(a - 1, 0));
      } else if (e.key === "Enter" && filtered[active]) {
        e.preventDefault();
        filtered[active].onSelect();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, filtered, active, onClose]);

  if (!open) return null;

  return (
    <div
      className="caster-cmd-overlay"
      role="dialog"
      aria-modal
      aria-label={t("shell.commandPalette")}
    >
      <button
        type="button"
        className="caster-cmd-backdrop"
        aria-label={t("common.close")}
        onClick={onClose}
      />
      <div className="caster-cmd-panel">
        <input
          className="caster-cmd-input"
          autoFocus
          placeholder={t("shell.searchCommand")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <ul className="caster-cmd-list" role="listbox">
          {filtered.length === 0 ? (
            <li className="caster-cmd-empty">{t("shell.noResults")}</li>
          ) : (
            grouped.map((g) => (
              <li key={g.group} className="caster-cmd-group">
                <div className="caster-cmd-group-label">{g.group}</div>
                <ul className="caster-cmd-group-list">
                  {g.items.map(({ item, index }) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={index === active}
                        className={["caster-cmd-item", index === active ? "active" : ""].join(" ")}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => {
                          item.onSelect();
                          onClose();
                        }}
                      >
                        <span>{item.label}</span>
                        {item.hint ? <span className="caster-cmd-hint">{item.hint}</span> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))
          )}
        </ul>
        <div className="caster-cmd-footer">
          <span>{t("shell.cmdNavigate")}</span>
          <span>{t("shell.cmdOpen")}</span>
          <span>{t("shell.cmdClose")}</span>
        </div>
      </div>
    </div>
  );
}

export function DisplayPopover({
  open,
  onClose,
  anchorRef,
  children,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
}) {
  const [style, setStyle] = useState<React.CSSProperties>({});

  useLayoutEffect(() => {
    if (!open) return;
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setStyle({
      top: rect.bottom + 4,
      left: rect.left,
    });
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const el = anchorRef.current;
      if (el && !el.contains(e.target as Node)) {
        const pop = document.querySelector(".caster-display-popover");
        if (pop && pop.contains(e.target as Node)) return;
        onClose();
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onClose, anchorRef]);

  if (!open) return null;
  return (
    <div className="caster-display-popover" style={style}>
      {children}
    </div>
  );
}
