import { type ReactNode } from "react";

type CardProps = {
  children?: ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
};

export function Card({ children, className = "", title, subtitle }: CardProps) {
  return (
    <section className={["ui-card", className].filter(Boolean).join(" ")}>
      {title || subtitle ? (
        <header className="ui-card-head">
          {title ? <h2 className="ui-card-title">{title}</h2> : null}
          {subtitle ? <p className="ui-card-sub">{subtitle}</p> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

type SectionTitleProps = {
  children: ReactNode;
  className?: string;
};

export function SectionTitle({ children, className = "" }: SectionTitleProps) {
  return (
    <h3 className={["ui-section-title", className].filter(Boolean).join(" ")}>
      {children}
    </h3>
  );
}

type BadgeProps = {
  children: ReactNode;
  className?: string;
};

export function Badge({ children, className = "" }: BadgeProps) {
  return (
    <span className={["ui-badge", className].filter(Boolean).join(" ")}>
      {children}
    </span>
  );
}

type SegmentedOption<T extends string> = {
  value: T;
  label: string;
};

type SegmentedProps<T extends string> = {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  ariaLabel?: string;
};

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  disabled,
  ariaLabel,
}: SegmentedProps<T>) {
  return (
    <div className="ui-segmented" role="group" aria-label={ariaLabel}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          disabled={disabled}
          className={value === opt.value ? "ui-segment active" : "ui-segment"}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

type StatusPillProps = {
  on: boolean;
  label: string;
  detail?: string;
};

export function StatusPill({ on, label, detail }: StatusPillProps) {
  return (
    <div className={["ui-status-pill", on ? "on" : "off"].join(" ")}>
      <span className="ui-status-dot" />
      {label}
      {detail ? (
        <>
          <span className="ui-status-sep">·</span>
          <span className="ui-status-detail">{detail}</span>
        </>
      ) : null}
    </div>
  );
}

type PageHeaderProps = {
  title: string;
  badge?: string;
  hint?: string;
  trailing?: ReactNode;
};

export function PageHeader({ title, badge, hint, trailing }: PageHeaderProps) {
  return (
    <div className="page-header">
      <div className="page-header-text">
        {badge ? <Badge>{badge}</Badge> : null}
        <h1>{title}</h1>
        {hint ? <p>{hint}</p> : null}
      </div>
      {trailing ? <div className="page-header-trailing">{trailing}</div> : null}
    </div>
  );
}

type SwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  "aria-label"?: string;
};

export function Switch({
  checked,
  onChange,
  disabled,
  label,
  "aria-label": ariaLabel,
}: SwitchProps) {
  return (
    <label className={["ui-switch-wrap", disabled ? "disabled" : ""].join(" ")}>
      {label ? <span className="ui-switch-label">{label}</span> : null}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel ?? label}
        disabled={disabled}
        className={["ui-switch", checked ? "on" : ""].join(" ")}
        onClick={() => onChange(!checked)}
      >
        <span className="ui-switch-thumb" />
      </button>
    </label>
  );
}

type SliderProps = {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  label?: string;
  display?: string;
};

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  disabled,
  label,
  display,
}: SliderProps) {
  return (
    <div className={["ui-slider-wrap", disabled ? "disabled" : ""].join(" ")}>
      {(label || display) && (
        <div className="ui-slider-meta">
          {label ? <span>{label}</span> : <span />}
          {display ? <strong>{display}</strong> : null}
        </div>
      )}
      <input
        type="range"
        className="ui-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

type RadioOption<T extends string> = {
  value: T;
  label: string;
};

type RadioGroupProps<T extends string> = {
  value: T;
  options: RadioOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  name: string;
};

export function RadioGroup<T extends string>({
  value,
  options,
  onChange,
  disabled,
  name,
}: RadioGroupProps<T>) {
  return (
    <div className="ui-radio-group" role="radiogroup">
      {options.map((opt) => (
        <label
          key={opt.value}
          className={[
            "ui-radio",
            value === opt.value ? "selected" : "",
            disabled ? "disabled" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <input
            type="radio"
            name={name}
            value={opt.value}
            checked={value === opt.value}
            disabled={disabled}
            onChange={() => onChange(opt.value)}
          />
          <span className="ui-radio-dot" />
          <span>{opt.label}</span>
        </label>
      ))}
    </div>
  );
}

type IconButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  className?: string;
};

export function IconButton({
  children,
  onClick,
  active,
  disabled,
  title,
  className = "",
}: IconButtonProps) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      className={[
        "ui-icon-btn",
        active ? "active" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

type KbdChipProps = {
  children: ReactNode;
  className?: string;
};

export function KbdChip({ children, className = "" }: KbdChipProps) {
  return (
    <kbd className={["kbd-chip", className].filter(Boolean).join(" ")}>
      {children}
    </kbd>
  );
}

type EmptyStateProps = {
  title: string;
  lead?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function EmptyState({
  title,
  lead,
  icon,
  actions,
  className = "",
}: EmptyStateProps) {
  return (
    <div className={["empty-state", className].filter(Boolean).join(" ")}>
      {icon ? (
        <div className="empty-state-icon" aria-hidden>
          {icon}
        </div>
      ) : null}
      <h2 className="empty-state-title">{title}</h2>
      {lead ? <p className="empty-state-lead">{lead}</p> : null}
      {actions ? <div className="empty-state-actions">{actions}</div> : null}
    </div>
  );
}

/** Inline SVG icons for the rail */
export const Icons = {
  target: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </svg>
  ),
  macros: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M4 6h16M4 12h10M4 18h14" />
      <rect x="14" y="9" width="6" height="6" rx="1" />
    </svg>
  ),
  key: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="8" cy="14" r="4" />
      <path d="M11.5 12.5 20 4l2 2-2 2-2-1-2 2" />
    </svg>
  ),
  info: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 10v6M12 7.5h.01" />
    </svg>
  ),
  home: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5z" />
    </svg>
  ),
  gear: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3v2.2M4.9 6.5l1.6 1.6M17.5 15.9l1.6 1.6M3.5 12h2.2M18.3 12h2.2M4.9 17.5l1.6-1.6M17.5 8.1l1.6-1.6" />
    </svg>
  ),
  eye: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  ),
  list: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M9 7h11M9 12h11M9 17h11M5 7h.01M5 12h.01M5 17h.01" />
    </svg>
  ),
  bookmark: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M7 4h10a1 1 0 0 1 1 1v15l-6-3.5L6 20V5a1 1 0 0 1 1-1z" />
    </svg>
  ),
  star: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M12 3.2 14.4 9l6.1.5-4.6 3.9 1.4 5.9L12 16.2 6.7 19.3l1.4-5.9L3.5 9.5 9.6 9 12 3.2z" />
    </svg>
  ),
  starFilled: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" stroke="currentColor" strokeWidth="1">
      <path d="M12 3.2 14.4 9l6.1.5-4.6 3.9 1.4 5.9L12 16.2 6.7 19.3l1.4-5.9L3.5 9.5 9.6 9 12 3.2z" />
    </svg>
  ),
  wrench: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M14.5 6.5a4 4 0 0 0-5.6 5.6L4 17v3h3l4.9-4.9a4 4 0 0 0 5.6-5.6l-2.5 2.5-2.5-2.5 2.5-2.5z" />
    </svg>
  ),
  sun: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5 5l1.8 1.8M17.2 17.2 19 19M5 19l1.8-1.8M17.2 6.8 19 5" />
    </svg>
  ),
  moon: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M20.2 14.4A8.6 8.6 0 1 1 9.6 3.8a7 7 0 0 0 10.6 10.6Z" />
    </svg>
  ),
};

export { ConfirmHost, confirmAction, confirmBusy, confirmChoice } from "./ConfirmDialog";
export type {
  ConfirmHold,
  ConfirmOptions,
  ConfirmOutcome,
} from "./ConfirmDialog";
export { PromptHost, promptAction } from "./PromptDialog";
export type { PromptOptions } from "./PromptDialog";
export {
  ScriptLanguageHost,
  askScriptLanguage,
} from "./ScriptLanguageDialog";
export type {
  ScriptLanguageChoice,
  ScriptLanguageDialogOptions,
} from "./ScriptLanguageDialog";
