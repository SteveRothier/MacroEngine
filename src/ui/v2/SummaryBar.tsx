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
    <footer className="v2-summary-bar">
      <span className="v2-summary-total">{totalLabel}</span>
      <div className="v2-summary-segments">
        {segments
          .filter((s) => s.count > 0)
          .map((s) => (
            <StatusPill key={s.label} kind={s.kind} label={`${s.count} ${s.label}`} />
          ))}
      </div>
    </footer>
  );
}
