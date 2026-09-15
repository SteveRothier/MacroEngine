type Props = {
  size?: number;
  className?: string;
  /** Glyph alone (transparent) vs full squircle app icon. */
  variant?: "mark" | "glyph";
};

export function CasterLogo({
  size = 16,
  className,
  variant = "mark",
}: Props) {
  const src = variant === "glyph" ? "/app-icon-glyph.png" : "/app-icon.png";
  return (
    <img
      src={src}
      width={size}
      height={size}
      alt=""
      aria-hidden
      className={className}
      draggable={false}
    />
  );
}
