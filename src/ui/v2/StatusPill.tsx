export type StatusKind =
  | "healthy"
  | "attention"
  | "failed"
  | "paused"
  | "running";

type Props = {
  kind: StatusKind;
  label: string;
  dot?: boolean;
};

export function StatusPill({ kind, label, dot = true }: Props) {
  return (
    <span className={`v2-pill v2-pill--${kind}`}>
      {dot ? <span className="v2-pill-dot" aria-hidden /> : null}
      {label}
    </span>
  );
}
