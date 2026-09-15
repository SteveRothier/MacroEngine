import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export type TooltipSide = "top" | "bottom" | "left" | "right";
export type TooltipAlign = "start" | "center" | "end";

const TOOLTIP_GAP = 6;
const VIEWPORT_PAD = 8;

const HIDDEN_MEASURE_STYLE: CSSProperties = {
  position: "fixed",
  left: 0,
  top: 0,
  visibility: "hidden",
  pointerEvents: "none",
};

type Props = {
  content: ReactNode;
  side?: TooltipSide;
  /** Horizontal align for top/bottom; vertical align for left/right. */
  align?: TooltipAlign;
  delay?: number;
  gap?: number;
  disabled?: boolean;
  className?: string;
  wrapClassName?: string;
  children: ReactElement;
};

function clampTooltip(
  anchor: DOMRect,
  tipSize: { width: number; height: number },
  side: TooltipSide,
  align: TooltipAlign,
  gap: number,
): CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const maxLeft = vw - VIEWPORT_PAD - tipSize.width;
  const maxTop = vh - VIEWPORT_PAD - tipSize.height;

  let left = 0;
  let top = 0;

  switch (side) {
    case "top":
      top = anchor.top - gap - tipSize.height;
      if (align === "start") left = anchor.left;
      else if (align === "end") left = anchor.right - tipSize.width;
      else left = anchor.left + anchor.width / 2 - tipSize.width / 2;
      break;
    case "bottom":
      top = anchor.bottom + gap;
      if (align === "start") left = anchor.left;
      else if (align === "end") left = anchor.right - tipSize.width;
      else left = anchor.left + anchor.width / 2 - tipSize.width / 2;
      break;
    case "left":
      left = anchor.left - gap - tipSize.width;
      if (align === "start") top = anchor.top;
      else if (align === "end") top = anchor.bottom - tipSize.height;
      else top = anchor.top + anchor.height / 2 - tipSize.height / 2;
      break;
    case "right":
      left = anchor.right + gap;
      if (align === "start") top = anchor.top;
      else if (align === "end") top = anchor.bottom - tipSize.height;
      else top = anchor.top + anchor.height / 2 - tipSize.height / 2;
      break;
  }

  left = Math.max(VIEWPORT_PAD, Math.min(left, maxLeft));
  top = Math.max(VIEWPORT_PAD, Math.min(top, maxTop));

  return { position: "fixed", left, top };
}

export function Tooltip({
  content,
  side = "top",
  align = "center",
  delay = 400,
  gap = TOOLTIP_GAP,
  disabled = false,
  className,
  wrapClassName,
  children,
}: Props) {
  const tipId = useId();
  const wrapRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const timerRef = useRef<number | null>(null);
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState<CSSProperties | null>(null);
  const [positioned, setPositioned] = useState(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const reposition = useCallback(() => {
    const wrap = wrapRef.current;
    const tip = tipRef.current;
    if (!wrap || !tip || tip.offsetWidth <= 0) return;

    const anchor = wrap.getBoundingClientRect();
    setCoords(
      clampTooltip(
        anchor,
        { width: tip.offsetWidth, height: tip.offsetHeight },
        side,
        align,
        gap,
      ),
    );
    setPositioned(true);
  }, [align, gap, side]);

  const show = useCallback(() => {
    if (disabled || content == null || content === "") return;
    clearTimer();
    timerRef.current = window.setTimeout(() => setVisible(true), delay);
  }, [clearTimer, content, delay, disabled]);

  const hide = useCallback(() => {
    clearTimer();
    setVisible(false);
    setPositioned(false);
    setCoords(null);
  }, [clearTimer]);

  useLayoutEffect(() => {
    if (!visible) return;

    reposition();

    const onScroll = () => reposition();
    const onResize = () => reposition();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [visible, reposition, content]);

  if (!isValidElement(children)) {
    return children;
  }

  const child = children as ReactElement<Record<string, unknown>>;

  const portal =
    visible && content != null && content !== ""
      ? createPortal(
          <span
            ref={tipRef}
            id={tipId}
            role="tooltip"
            className={["caster-tooltip", "caster-tooltip-portal", className]
              .filter(Boolean)
              .join(" ")}
            style={
              positioned && coords
                ? coords
                : HIDDEN_MEASURE_STYLE
            }
          >
            {content}
          </span>,
          document.body,
        )
      : null;

  return (
    <>
      <span
        ref={wrapRef}
        className={["caster-tooltip-wrap", wrapClassName].filter(Boolean).join(" ")}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {cloneElement(child, {
          "aria-describedby": positioned ? tipId : undefined,
        } as Record<string, unknown>)}
      </span>
      {portal}
    </>
  );
}

type TruncatedProps = {
  content: string;
  side?: TooltipSide;
  align?: TooltipAlign;
  delay?: number;
  gap?: number;
  className?: string;
  wrapClassName?: string;
  disabled?: boolean;
  children: ReactElement<{ className?: string; ref?: React.Ref<HTMLElement> }>;
};

/** Shows tooltip only when child text is truncated (ellipsis). */
export function TruncatedTooltip({
  content,
  side = "top",
  align,
  delay,
  gap,
  className,
  wrapClassName,
  disabled = false,
  children,
}: TruncatedProps) {
  const ref = useRef<HTMLElement>(null);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      const label = el.querySelector<HTMLElement>(".caster-doc-tab-label");
      const target = label ?? el;
      setTruncated(target.scrollWidth > target.clientWidth + 1);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    const label = el.querySelector(".caster-doc-tab-label");
    if (label) ro.observe(label);
    return () => ro.disconnect();
  }, [content]);

  const child = cloneElement(children, {
    ref: (node: HTMLElement | null) => {
      ref.current = node;
      const childRef = (children as ReactElement & { ref?: React.Ref<HTMLElement> }).ref;
      if (typeof childRef === "function") childRef(node);
      else if (childRef && typeof childRef === "object") {
        (childRef as React.MutableRefObject<HTMLElement | null>).current = node;
      }
    },
  });

  return (
    <Tooltip
      content={content}
      side={side}
      align={align}
      delay={delay}
      gap={gap}
      className={className}
      wrapClassName={wrapClassName}
      disabled={disabled || !truncated}
    >
      {child}
    </Tooltip>
  );
}
