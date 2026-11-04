import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useT } from "../i18n";
import type { PixelPickPreview } from "../pick";

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

export type OverlayPickKey = { kbd: string; label: string };

type Props = {
  active: boolean;
  preview?: PixelPickPreview;
  /** When false, show XY coords (point pick). Default true = color swatch. */
  showColor?: boolean;
  title?: string;
  /** Label for left-click action (default: Valider / Échantillonner). */
  confirmLabel?: string;
  /** Override the three shortcut chips. */
  keys?: OverlayPickKey[];
  /** Custom center content (replaces coords / color preview). */
  center?: ReactNode;
};

/** Shared in-app banner while picking / capturing on screen (portal to body). */
export function PixelPickBanner({
  active,
  preview,
  showColor = true,
  title,
  confirmLabel,
  keys,
  center,
}: Props) {
  const t = useT();
  if (!active || typeof document === "undefined") return null;

  const pickPreviewCss = preview
    ? `rgb(${preview.r}, ${preview.g}, ${preview.b})`
    : "transparent";
  const pickPreviewHex = preview
    ? rgbToHex(preview.r, preview.g, preview.b)
    : "—";
  const leftAction =
    confirmLabel ??
    (showColor ? t("shell.pickActionSample") : t("shell.pickActionValidate"));

  const keyItems: OverlayPickKey[] = keys ?? [
    { kbd: t("shell.pickKeyLeft"), label: leftAction },
    { kbd: t("shell.pickKeyEsc"), label: t("shell.pickActionCancel") },
    { kbd: t("shell.pickKeyRight"), label: t("shell.pickActionStop") },
  ];

  let centerNode: ReactNode = center;
  if (centerNode === undefined) {
    centerNode = showColor ? (
      <div className="caster-pixel-pick-preview">
        <span
          className={[
            "caster-pixel-pick-swatch",
            preview ? "" : "is-empty",
          ]
            .filter(Boolean)
            .join(" ")}
          style={{ background: pickPreviewCss }}
          aria-hidden
        />
        <code className="caster-pixel-pick-hex">{pickPreviewHex}</code>
        {preview ? (
          <span className="caster-pixel-pick-rgb">
            {preview.r}, {preview.g}, {preview.b}
          </span>
        ) : null}
      </div>
    ) : (
      <code className="caster-pixel-pick-coords">
        {preview ? `${preview.x}, ${preview.y}` : "—, —"}
      </code>
    );
  }

  return createPortal(
    <div className="caster-pixel-pick-banner" role="status">
      <strong className="caster-pixel-pick-title">
        {title ?? t("shell.pickTitle")}
      </strong>
      <ul className="caster-pixel-pick-keys" aria-label={t("shell.pickKeysAria")}>
        {keyItems.map((item) => (
          <li key={`${item.kbd}-${item.label}`} className="caster-pixel-pick-key">
            <kbd>{item.kbd}</kbd>
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
      {centerNode}
    </div>,
    document.body,
  );
}
