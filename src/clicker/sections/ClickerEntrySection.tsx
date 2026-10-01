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
import { WheelNumberInput } from "../../ui/WheelNumberInput";
import { useT } from "../../i18n";
import { ClickerInfoTip } from "../ClickerInfoTip";

type Props = {
  editor: ClickerEditor;
};

export function ClickerEntrySection({ editor: e }: Props) {
  const t = useT();

  return (
    <div className="caster-clicker-section caster-clicker-entry-split">
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
                <div
                  className="caster-segmented"
                  role="group"
                  aria-label={t("clicker.entry.clickKind")}
                >
                  {(
                    [
                      ["single", t("clicker.segments.single")],
                      ["double", t("clicker.segments.double")],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={[
                        "caster-segmented-btn",
                        e.clickKind === value ? "active" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      disabled={e.editDisabled}
                      onClick={() => e.setClickKind(value as ClickKind)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
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
            <span className="caster-settings-row-label-with-info">
              <span>{t("clicker.entry.hotkeyMode")}</span>
              <ClickerInfoTip text={t("clicker.entry.triggerHintMeta")} />
            </span>
          </div>
          <div className="caster-settings-row-control">
            <div
              className="caster-segmented"
              role="group"
              aria-label={t("clicker.entry.hotkeyMode")}
            >
              {(
                [
                  ["toggle", t("clicker.segments.toggle")],
                  ["hold", t("clicker.segments.hold")],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={[
                    "caster-segmented-btn",
                    e.mode === value ? "active" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  disabled={e.editDisabled}
                  onClick={() => e.setMode(value as ClickMode)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
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
                  <WheelNumberInput
                    className="action-cell-input action-cell-num"
                    min={1}
                    max={500}
                    value={Math.round(e.cps)}
                    disabled={e.editDisabled}
                    aria-label={t("clicker.entry.cadence")}
                    onValueChange={(n) => e.setCps(n)}
                  />
                </label>
              </div>
            </div>
            <div className="caster-settings-row">
              <div className="caster-settings-row-label">
                <span>{t("clicker.entry.unit")}</span>
              </div>
              <div className="caster-settings-row-control">
                <div
                  className="caster-segmented"
                  role="group"
                  aria-label={t("clicker.entry.unit")}
                >
                  {(
                    [
                      [
                        "perSecond",
                        t("clicker.segments.perSecondShort"),
                        t("clicker.segments.perSecond"),
                      ],
                      [
                        "perMinute",
                        t("clicker.segments.perMinuteShort"),
                        t("clicker.segments.perMinute"),
                      ],
                      [
                        "perHour",
                        t("clicker.segments.perHourShort"),
                        t("clicker.segments.perHour"),
                      ],
                      [
                        "perDay",
                        t("clicker.segments.perDayShort"),
                        t("clicker.segments.perDay"),
                      ],
                    ] as const
                  ).map(([value, short, full]) => (
                    <button
                      key={value}
                      type="button"
                      className={[
                        "caster-segmented-btn",
                        e.rateUnit === value ? "active" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      disabled={e.editDisabled}
                      title={full}
                      aria-label={full}
                      onClick={() => e.setRateUnit(value as RateUnit)}
                    >
                      {short}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="caster-settings-row">
            <div className="caster-settings-row-label">
              <span>{t("clicker.entry.interval")}</span>
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
                <WheelNumberInput
                  className="action-cell-input action-cell-num"
                  min={1}
                  max={2000}
                  value={Math.round(e.intervalMs)}
                  disabled={e.editDisabled}
                  aria-label={t("clicker.entry.interval")}
                  onValueChange={(n) => e.setIntervalMs(n)}
                />
                <span>ms</span>
              </label>
            </div>
          </div>
        )}

        <div className="caster-settings-row">
          <div className="caster-settings-row-label">
            <span>{t("clicker.entry.randomTiming")}</span>
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
                <WheelNumberInput
                  className="action-cell-input action-cell-num"
                  min={0}
                  max={95}
                  value={e.randomPct}
                  disabled={e.editDisabled}
                  aria-label={t("clicker.entry.percent")}
                  onValueChange={(n) => e.setRandomPct(n)}
                />
                <span>%</span>
              </label>
            </div>
          </div>
        ) : null}

        <details className="caster-clicker-details">
          <summary>{t("clicker.entry.advancedTiming")}</summary>
          <div className="caster-settings-row">
            <div className="caster-settings-row-label">
              <span>{t("clicker.entry.effectiveCap")}</span>
            </div>
            <div className="caster-settings-row-control">
              <strong>{t("clicker.entry.capValue")}</strong>
            </div>
          </div>
          <div className="caster-settings-row">
            <div className="caster-settings-row-label">
              <span>{t("clicker.entry.cpsMin")}</span>
            </div>
            <div className="caster-settings-row-control">
              <WheelNumberInput
                min={0}
                max={500}
                value={e.cpsMin}
                disabled={e.editDisabled}
                onValueChange={(n) => e.setCpsMin(n)}
              />
            </div>
          </div>
          <div className="caster-settings-row">
            <div className="caster-settings-row-label">
              <span>{t("clicker.entry.cpsMax")}</span>
            </div>
            <div className="caster-settings-row-control">
              <WheelNumberInput
                min={0}
                max={500}
                value={e.cpsMax}
                disabled={e.editDisabled}
                onValueChange={(n) => e.setCpsMax(n)}
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
          <div className="caster-settings-row">
            <div className="caster-settings-row-label">
              <span>{t("clicker.entry.dutyMode")}</span>
            </div>
            <div className="caster-settings-row-control">
              <div
                className="caster-segmented"
                role="group"
                aria-label={t("clicker.entry.dutyMode")}
              >
                {(
                  [
                    ["pulse", t("clicker.segments.pulse")],
                    ["holdPct", t("clicker.segments.holdPct")],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={[
                      "caster-segmented-btn",
                      e.dutyMode === value ? "active" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    disabled={e.editDisabled}
                    onClick={() => e.setDutyMode(value as DutyMode)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {e.dutyMode === "pulse" ? (
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
                  <WheelNumberInput
                    className="action-cell-input action-cell-num"
                    min={5}
                    max={100}
                    step={5}
                    value={Math.round(e.duty * 100)}
                    disabled={e.editDisabled}
                    aria-label={t("clicker.entry.duty")}
                    onValueChange={(n) => e.setDuty(n / 100)}
                  />
                  <span>%</span>
                </label>
              </div>
            </div>
          ) : null}
        </details>
        {e.dutyMode === "holdPct" ? (
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
                <WheelNumberInput
                  className="action-cell-input action-cell-num"
                  min={5}
                  max={100}
                  step={5}
                  value={Math.round(e.duty * 100)}
                  disabled={e.editDisabled}
                  aria-label={t("clicker.entry.duty")}
                  onValueChange={(n) => e.setDuty(n / 100)}
                />
                <span>%</span>
              </label>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
