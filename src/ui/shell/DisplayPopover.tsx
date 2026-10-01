import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function DisplayPopover({
  open,
  onClose,
  anchorRef,
  children,
  labelledBy,
  label,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  /** Prefer `labelledBy` when a visible title exists. */
  labelledBy?: string;
  label?: string;
}) {
  const [style, setStyle] = useState<CSSProperties>({});
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setStyle({
      top: rect.bottom + 4,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - 288)),
    });
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();

    function onDoc(e: MouseEvent) {
      const el = anchorRef.current;
      const pop = panelRef.current;
      if (el && el.contains(e.target as Node)) return;
      if (pop && pop.contains(e.target as Node)) return;
      onClose();
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const nodes = [
        ...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ].filter((n) => !n.hasAttribute("disabled") && n.tabIndex !== -1);
      if (nodes.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = nodes[0]!;
      const lastEl = nodes[nodes.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === firstEl || !panelRef.current.contains(active)) {
          e.preventDefault();
          lastEl.focus();
        }
      } else if (active === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }

    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey, true);
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;
  return (
    <div
      ref={panelRef}
      className="caster-display-popover"
      style={style}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : label}
    >
      {children}
    </div>
  );
}
