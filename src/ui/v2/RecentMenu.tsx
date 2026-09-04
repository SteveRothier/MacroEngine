import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export type RecentMenuItem = {
  id: string;
  label: string;
  onSelect: () => void;
};

type Props = {
  items: RecentMenuItem[];
};

export function RecentMenu({ items }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="v2-toolbar-menu v2-recent-menu" ref={wrapRef}>
      <button
        type="button"
        className={[
          "v2-titlebar-btn v2-titlebar-text-btn",
          open ? "active" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        Récents
        <ChevronDown size={12} aria-hidden />
      </button>
      {open ? (
        <div className="v2-menu-popover v2-recent-menu-popover" role="menu">
          {items.length === 0 ? (
            <p className="v2-recent-menu-empty">Aucun récent</p>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                className="v2-btn v2-btn-ghost v2-recent-menu-item"
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                {item.label}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
