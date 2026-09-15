import type { ClickerEditor } from "../useClickerEditor";
import type {
  ClickKind,
  ClickMode,
  ClickZoneOrder,
  DutyMode,
  InputKind,
  MouseButton,
  RateUnit,
  TimingMode,
} from "../clickerTypes";
import { Select } from "../../ui/shell";
import { useT } from "../../i18n";
import { ClickerProcessFilterRow } from "./ClickerProcessFilterRow";
import { ClickerTriggerRow } from "./ClickerTriggerRow";

type Props = {
  editor: ClickerEditor;
  onOpenProcessSettings?: () => void;
};

export function ClickerEntrySection({ editor: e, onOpenProcessSettings }: Props) {
  const t = useT();

  return (
    <div className="caster-clicker-section caster-clicker-entry-split">
      <ClickerProcessFilterRow
        filter={e.processFilter}
        onOpenSettings={onOpenProcessSettings}
      />
      <div className="caster-clicker-entry-col">
        <h3 className="caster-clicker-entry-col-title">{t("clicker.entry.title")}</h3>
        <div className="caster-settings-row">
          <div className="caster-settings-row-label">
            <span>{t("clicker.entry.inputKind")}</span>
          </div>
          <div className="caster-settings-row-control">
            <div
              className="caster-segmented"
              role="group"
              aria-label={t("clicker.entry.inputKindAria")}
            >
              {(
                [
                  ["mouse", t("clicker.segments.mouse")],
                  ["keyboard", t("clicker.segments.keyboard")],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={[
                    "caster-segmented-btn",
                    e.inputKind === value ? "active" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  disabled={e.editDisabled}
                  onClick={() => e.setInputKind(value as InputKind)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {e.inputKind === "mouse" ? (
          <>
            <div className="caster-settings-row">
              <div className="caster-settings-row-label">
                <span>{t("clicker.entry.button")}</span>
              </div>
              <div className="caster-settings-row-control">
                <div
                  className="caster-segmented"
                  role="group"
                  aria-label={t("clicker.entry.buttonAria")}
                >
                  {(
                    [
                      ["left", t("clicker.segments.left")],
                      ["right", t("clicker.segments.right")],
                      ["middle", t("clicker.segments.middle")],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={[
                        "caster-segmented-btn",
                        e.button === value ? "active" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      disabled={e.editDisabled}
                      onClick={() => e.setButton(value as MouseButton)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="caster-settings-row">
              <div className="caster-settings-row-label">
                <span>{t("clicker.entry.clickKind")}</span>
              </div>
              <div className="caster-settings-row-control">
                <Select
                  className="caster-select"
                  value={e.clickKind}
                  disabled={e.editDisabled}
                  options={[
                    { value: "single", label: t("clicker.segments.single") },
                    { value: "double", label: t("clicker.segments.double") },
                  ]}
                  onChange={(v) => e.setClickKind(v as ClickKind)}
                />
              </div>
            </div>
          </>
        ) : (
          <>
            <label className="caster-field">
              <span>{t("clicker.entry.key")}</span>
              <input
                type="text"
                value={e.keyName}
                disabled={e.editDisabled}
                maxLength={12}
                onChange={(ev) => e.setKeyName(ev.target.value || "A")}
              />
            </label>
            <div className="caster-settings-row">
              <div className="caster-settings-row-label">
                <span>{t("clicker.entry.keyShift")}</span>
              </div>
              <div className="caster-settings-row-control">
                <input
                  type="checkbox"
                  checked={e.keyShift}
                  disabled={e.editDisabled}
                  onChange={(ev) => e.setKeyShift(ev.target.checked)}
                />
              </div>
            </div>
          </>
        )}

        <div className="caster-settings-row">
          <div className="caster-settings-row-label">
            <span>{t("clicker.entry.hotkeyMode")}</span>
          </div>
          <div className="caster-settings-row-control">
            <Select
              className="caster-select"
              value={e.mode}
              disabled={e.editDisabled}
              options={[
                { value: "toggle", label: t("clicker.segments.toggle") },
                { value: "hold", label: t("clicker.segments.hold") },
              ]}
              onChange={(v) => e.setMode(v as ClickMode)}
            />
          </div>
        </div>
        <ClickerTriggerRow editor={e} />
      </div>

      <div className="caster-clicker-entry-col">
        <h3 className="caster-clicker-entry-col-title">
          {t("clicker.entry.timingTitle")}
        </h3>
        <div className="caster-settings-row">
          <div className="caster-settings-row-label">
            <span>{t("clicker.entry.timingMode")}</span>
          </div>
          <div className="caster-settings-row-control">
            <div
              className="caster-segmented"
              role="group"
              aria-label={t("clicker.entry.timingAria")}
            >
              {(
                [
                  ["rate", t("clicker.segments.rate")],
                  ["interval", t("clicker.segments.interval")],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={[
                    "caster-segmented-btn",
                    e.timingMode === value ? "active" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  disabled={e.editDisabled}
                  onClick={() => e.setTimingMode(value as TimingMode)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {e.timingMode === "rate" ? (
          <>
            <div className="caster-settings-row">
              <div className="caster-settings-row-label">
                <span>{t("clicker.entry.cadence")}</span>
                <p>{e.cadenceDisplay}</p>
              </div>
              <div className="caster-settings-row-control caster-settings-row-control--grow">
                <label className="caster-settings-range">
                  <input
                    type="range"
                    min={1}
                    max={500}
                    step={1}
                    value={Math.min(500, Math.max(1, e.cps))}
                    disabled={e.editDisabled}
                    onChange={(ev) => e.setCps(Number(ev.target.value))}
                  />
                </label>
              </div>
            </div>
            <label className="caster-field">
              <span>{t("clicker.entry.unit")}</span>
              <Select
                className="caster-select"
                value={e.rateUnit}
                disabled={e.editDisabled}
                options={[
                  {
                    value: "perSecond",
                    label: t("clicker.segments.perSecond"),
                  },
                  {
                    value: "perMinute",
                    label: t("clicker.segments.perMinute"),
                  },
                  { value: "perHour", label: t("clicker.segments.perHour") },
                  { value: "perDay", label: t("clicker.segments.perDay") },
                ]}
                onChange={(v) => e.setRateUnit(v as RateUnit)}
              />
            </label>
          </>
        ) : (
          <div className="caster-settings-row">
            <div className="caster-settings-row-label">
              <span>{t("clicker.entry.interval")}</span>
              <p>{e.cadenceDisplay}</p>
            </div>
            <div className="caster-settings-row-control caster-settings-row-control--grow">
              <label className="caster-settings-range">
                <input
                  type="range"
                  min={1}
                  max={2000}
                  step={1}
                  value={Math.min(2000, Math.max(1, e.intervalMs))}
                  disabled={e.editDisabled}
                  onChange={(ev) => e.setIntervalMs(Number(ev.target.value))}
                />
              </label>
            </div>
          </div>
        )}

        <div className="caster-settings-row">
          <div className="caster-settings-row-label">
            <span>{t("clicker.entry.randomTiming")}</span>
            <p>±{e.randomPct}%</p>
          </div>
          <div className="caster-settings-row-control">
            <input
              type="checkbox"
              checked={e.randomEnabled}
              disabled={e.editDisabled}
              onChange={(ev) => e.setRandomEnabled(ev.target.checked)}
            />
          </div>
        </div>
        {e.randomEnabled ? (
          <div className="caster-settings-row">
            <div className="caster-settings-row-label">
              <span>{t("clicker.entry.percent")}</span>
            </div>
            <div className="caster-settings-row-control caster-settings-row-control--grow">
              <label className="caster-settings-range">
                <input
                  type="range"
                  min={0}
                  max={95}
                  step={1}
                  value={e.randomPct}
                  disabled={e.editDisabled}
                  onChange={(ev) => e.setRandomPct(Number(ev.target.value))}
                />
                <span>{e.randomPct}%</span>
              </label>
            </div>
          </div>
        ) : null}

        <div className="caster-settings-row">
          <div className="caster-settings-row-label">
            <span>{t("clicker.entry.effectiveCap")}</span>
          </div>
          <div className="caster-settings-row-control">
            <strong>{t("clicker.entry.capValue")}</strong>
          </div>
        </div>

        <details className="caster-clicker-details">
          <summary>{t("clicker.entry.advancedTiming")}</summary>
          <div className="caster-settings-row">
            <div className="caster-settings-row-label">
              <span>{t("clicker.entry.cpsMin")}</span>
            </div>
            <div className="caster-settings-row-control">
              <input
                type="number"
                min={0}
                max={500}
                value={e.cpsMin}
                disabled={e.editDisabled}
                onChange={(ev) => e.setCpsMin(Number(ev.target.value) || 0)}
              />
            </div>
          </div>
          <div className="caster-settings-row">
            <div className="caster-settings-row-label">
              <span>{t("clicker.entry.cpsMax")}</span>
            </div>
            <div className="caster-settings-row-control">
              <input
                type="number"
                min={0}
                max={500}
                value={e.cpsMax}
                disabled={e.editDisabled}
                onChange={(ev) => e.setCpsMax(Number(ev.target.value) || 0)}
              />
            </div>
          </div>
          <div className="caster-settings-row">
            <div className="caster-settings-row-label">
              <span>{t("clicker.entry.clickZoneOrder")}</span>
            </div>
            <div className="caster-settings-row-control">
              <div
                className="caster-segmented"
                role="group"
                aria-label={t("clicker.entry.clickZoneOrderAria")}
              >
                {(
                  [
                    ["random", t("clicker.segments.random")],
                    ["sequence", t("clicker.segments.sequence")],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={[
                      "caster-segmented-btn",
                      e.clickZoneOrder === value ? "active" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    disabled={e.editDisabled}
                    onClick={() => e.setClickZoneOrder(value as ClickZoneOrder)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </details>

        <details className="caster-clicker-details">
          <summary>{t("clicker.entry.dutyAdvanced")}</summary>
          <label className="caster-field">
            <span>{t("clicker.entry.dutyMode")}</span>
            <Select
              className="caster-select"
              value={e.dutyMode}
              disabled={e.editDisabled}
              options={[
                { value: "pulse", label: t("clicker.segments.pulse") },
                { value: "holdPct", label: t("clicker.segments.holdPct") },
              ]}
              onChange={(v) => e.setDutyMode(v as DutyMode)}
            />
          </label>
          <div className="caster-settings-row">
            <div className="caster-settings-row-label">
              <span>{t("clicker.entry.duty")}</span>
            </div>
            <div className="caster-settings-row-control caster-settings-row-control--grow">
              <label className="caster-settings-range">
                <input
                  type="range"
                  min={5}
                  max={100}
                  step={5}
                  value={Math.round(e.duty * 100)}
                  disabled={e.editDisabled}
                  onChange={(ev) => e.setDuty(Number(ev.target.value) / 100)}
                />
                <span>{Math.round(e.duty * 100)}%</span>
              </label>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}
