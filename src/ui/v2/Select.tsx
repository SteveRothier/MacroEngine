/**
 * Select custom — liste ouverte = v2-menu-popover (comme DropdownMenu).
 * Les <select> natifs Windows ne stylent pas la liste ouverte.
 */
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type Props = {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Classes on the trigger button (e.g. action-cell-select, v2-select) */
  className?: string;
  ariaLabel?: string;
  title?: string;
  /** Override label shown on the closed trigger (menu options keep `options[].label`). */
  triggerLabel?: string;
};

const MENU_GAP = 6;
const MENU_PAD = 8;

function placeMenu(
  trigger: DOMRect,
  menu: DOMRect,
): { top: number; left: number; width: number; origin: string } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.max(trigger.width, menu.width);
  let left = trigger.left;
  if (left + width > vw - MENU_PAD) {
    left = Math.max(MENU_PAD, trigger.right - width);
  }
  left = Math.max(MENU_PAD, Math.min(left, vw - MENU_PAD - width));

  let top = trigger.bottom + MENU_GAP;
  let origin = "top left";
  if (top + menu.height > vh - MENU_PAD) {
    const above = trigger.top - MENU_GAP - menu.height;
    if (above >= MENU_PAD) {
      top = above;
      origin = "bottom left";
    } else {
      top = Math.max(MENU_PAD, vh - MENU_PAD - menu.height);
    }
  }
  return { top, left, width, origin };
}

export function Select({
  value,
  options,
  onChange,
  disabled,
  className,
  ariaLabel,
  title,
  triggerLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [coords, setCoords] = useState<CSSProperties | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? options[0],
    [options, value],
  );

  const enabledOptions = useMemo(
    () => options.filter((o) => !o.disabled),
    [options],
  );

  useEffect(() => {
    if (!open) {
      setActiveIdx(-1);
    }
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    const tEl = triggerRef.current;
    const panel = panelRef.current;
    if (!tEl || !panel) return;

    const update = () => {
      const t = tEl.getBoundingClientRect();
      const m = panel.getBoundingClientRect();
      const { top, left, width, origin } = placeMenu(t, m);
      setCoords({
        position: "fixed",
        top,
        left,
        width,
        minWidth: t.width,
        right: "auto",
        transformOrigin: origin,
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
  }, [open, options.length]);

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

  function pick(opt: SelectOption) {
    if (opt.disabled) return;
    onChange(opt.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onListKeyDown(e: ReactKeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => {
        const next = i < 0 ? 0 : i + 1;
        return Math.min(next, Math.max(0, enabledOptions.length - 1));
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => {
        if (i < 0) return Math.max(0, enabledOptions.length - 1);
        return Math.max(i - 1, 0);
      });
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = enabledOptions[activeIdx];
      if (hit) pick(hit);
    }
  }

  let enabledCursor = -1;
  const panel = open
    ? createPortal(
        <div
          ref={panelRef}
          id={listId}
          role="listbox"
          aria-label={ariaLabel ?? title ?? "Options"}
          className="v2-menu-popover v2-select-menu"
          style={coords ?? { position: "fixed", visibility: "hidden" }}
          onKeyDown={onListKeyDown}
        >
          {options.map((opt) => {
            if (!opt.disabled) enabledCursor += 1;
            const selIdx = opt.disabled ? -1 : enabledCursor;
            const isSelected = opt.value === value;
            const isActive = !opt.disabled && selIdx === activeIdx;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={opt.disabled}
                className={[
                  "v2-menu-item",
                  "v2-select-option",
                  isActive ? "is-active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onMouseEnter={() => {
                  if (!opt.disabled) setActiveIdx(selIdx);
                }}
                onMouseMove={() => {
                  if (!opt.disabled) setActiveIdx(selIdx);
                }}
                onClick={() => pick(opt)}
              >
                <span className="v2-menu-item-label">{opt.label}</span>
              </button>
            );
          })}
        </div>,
        document.body,
      )
    : null;

  return (
    <div className="v2-select-root" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={["v2-select-trigger", className].filter(Boolean).join(" ")}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        title={title}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <span className="v2-select-trigger-label">
          {triggerLabel ?? selected?.label ?? value}
        </span>
        <ChevronDown size={12} className="v2-select-chevron" aria-hidden />
      </button>
      {panel}
    </div>
  );
}
