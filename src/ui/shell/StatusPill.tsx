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
    <span className={`caster-pill caster-pill--${kind}`}>
      {dot ? <span className="caster-pill-dot" aria-hidden /> : null}
      {label}
    </span>
  );
}
