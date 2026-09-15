import { StatusPill, type StatusKind } from "./StatusPill";

type Segment = {
  kind: StatusKind;
  label: string;
  count: number;
};

type Props = {
  totalLabel: string;
  segments: Segment[];
};

export function SummaryBar({ totalLabel, segments }: Props) {
  return (
    <footer className="caster-summary-bar">
      <span className="caster-summary-total">{totalLabel}</span>
      <div className="caster-summary-segments">
        {segments
          .filter((s) => s.count > 0)
          .map((s) => (
            <StatusPill key={s.label} kind={s.kind} label={`${s.count} ${s.label}`} />
          ))}
      </div>
    </footer>
  );
}
