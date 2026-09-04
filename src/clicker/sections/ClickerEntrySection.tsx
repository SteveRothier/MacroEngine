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
import { ClickerProcessFilterRow } from "./ClickerProcessFilterRow";
import { ClickerTriggerRow } from "./ClickerTriggerRow";

type Props = {
  editor: ClickerEditor;
  onOpenProcessSettings?: () => void;
};

export function ClickerEntrySection({ editor: e, onOpenProcessSettings }: Props) {
  return (
    <div className="v2-clicker-section v2-clicker-entry-split">
      <ClickerProcessFilterRow
        filter={e.processFilter}
        onOpenSettings={onOpenProcessSettings}
      />
      <div className="v2-clicker-entry-col">
        <h3 className="v2-clicker-entry-col-title">Entrée</h3>
        <div className="v2-settings-row">
          <div className="v2-settings-row-label">
            <span>Type d&apos;entrée</span>
          </div>
          <div className="v2-settings-row-control">
            <div className="v2-segmented" role="group" aria-label="Type d'entrée">
              {(
                [
                  ["mouse", "Souris"],
                  ["keyboard", "Clavier"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={[
                    "v2-segmented-btn",
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
            <div className="v2-settings-row">
              <div className="v2-settings-row-label">
                <span>Bouton</span>
              </div>
              <div className="v2-settings-row-control">
                <div className="v2-segmented" role="group" aria-label="Bouton souris">
                  {(
                    [
                      ["left", "Gauche"],
                      ["right", "Droit"],
                      ["middle", "Molette"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={[
                        "v2-segmented-btn",
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
            <div className="v2-settings-row">
              <div className="v2-settings-row-label">
                <span>Type de clic</span>
              </div>
              <div className="v2-settings-row-control">
                <select
                  value={e.clickKind}
                  disabled={e.editDisabled}
                  onChange={(ev) => e.setClickKind(ev.target.value as ClickKind)}
                >
                  <option value="single">Simple</option>
                  <option value="double">Double</option>
                </select>
              </div>
            </div>
          </>
        ) : (
          <>
            <label className="v2-field">
              <span>Touche</span>
              <input
                type="text"
                value={e.keyName}
                disabled={e.editDisabled}
                maxLength={12}
                onChange={(ev) => e.setKeyName(ev.target.value || "A")}
              />
            </label>
            <div className="v2-settings-row">
              <div className="v2-settings-row-label">
                <span>Majuscule (Shift)</span>
              </div>
              <div className="v2-settings-row-control">
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

        <div className="v2-settings-row">
          <div className="v2-settings-row-label">
            <span>Mode hotkey</span>
          </div>
          <div className="v2-settings-row-control">
            <select
              value={e.mode}
              disabled={e.editDisabled}
              onChange={(ev) => e.setMode(ev.target.value as ClickMode)}
            >
              <option value="toggle">Basculer</option>
              <option value="hold">Maintenir</option>
            </select>
          </div>
        </div>
        <ClickerTriggerRow editor={e} />
      </div>

      <div className="v2-clicker-entry-col">
        <h3 className="v2-clicker-entry-col-title">Timing</h3>
        <div className="v2-settings-row">
          <div className="v2-settings-row-label">
            <span>Mode</span>
          </div>
          <div className="v2-settings-row-control">
            <div className="v2-segmented" role="group" aria-label="Timing">
              {(
                [
                  ["rate", "Cadence"],
                  ["interval", "Intervalle"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={[
                    "v2-segmented-btn",
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
            <div className="v2-settings-row">
              <div className="v2-settings-row-label">
                <span>Cadence</span>
                <p>{e.cadenceDisplay}</p>
              </div>
              <div className="v2-settings-row-control v2-settings-row-control--grow">
                <label className="v2-settings-range">
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
            <label className="v2-field">
              <span>Unité</span>
              <select
                value={e.rateUnit}
                disabled={e.editDisabled}
                onChange={(ev) => e.setRateUnit(ev.target.value as RateUnit)}
              >
                <option value="perSecond">/ seconde</option>
                <option value="perMinute">/ minute</option>
                <option value="perHour">/ heure</option>
                <option value="perDay">/ jour</option>
              </select>
            </label>
          </>
        ) : (
          <div className="v2-settings-row">
            <div className="v2-settings-row-label">
              <span>Intervalle</span>
              <p>{e.cadenceDisplay}</p>
            </div>
            <div className="v2-settings-row-control v2-settings-row-control--grow">
              <label className="v2-settings-range">
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

        <div className="v2-settings-row">
          <div className="v2-settings-row-label">
            <span>Aléa timing</span>
            <p>±{e.randomPct}%</p>
          </div>
          <div className="v2-settings-row-control">
            <input
              type="checkbox"
              checked={e.randomEnabled}
              disabled={e.editDisabled}
              onChange={(ev) => e.setRandomEnabled(ev.target.checked)}
            />
          </div>
        </div>
        {e.randomEnabled ? (
          <div className="v2-settings-row">
            <div className="v2-settings-row-label">
              <span>Pourcentage</span>
            </div>
            <div className="v2-settings-row-control v2-settings-row-control--grow">
              <label className="v2-settings-range">
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

        <div className="v2-settings-row">
          <div className="v2-settings-row-label">
            <span>Cap effectif</span>
          </div>
          <div className="v2-settings-row-control">
            <strong>500 CPS</strong>
          </div>
        </div>

        <details className="v2-clicker-details">
          <summary>Timing avancé</summary>
          <div className="v2-settings-row">
            <div className="v2-settings-row-label">
              <span>CPS min</span>
            </div>
            <div className="v2-settings-row-control">
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
          <div className="v2-settings-row">
            <div className="v2-settings-row-label">
              <span>CPS max</span>
            </div>
            <div className="v2-settings-row-control">
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
          <div className="v2-settings-row">
            <div className="v2-settings-row-label">
              <span>Ordre zones clic</span>
            </div>
            <div className="v2-settings-row-control">
              <div className="v2-segmented" role="group" aria-label="Ordre zones clic">
                {(
                  [
                    ["random", "Aléatoire"],
                    ["sequence", "Séquence"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={[
                      "v2-segmented-btn",
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

        <details className="v2-clicker-details">
          <summary>Duty (avancé)</summary>
          <label className="v2-field">
            <span>Mode duty</span>
            <select
              value={e.dutyMode}
              disabled={e.editDisabled}
              onChange={(ev) => e.setDutyMode(ev.target.value as DutyMode)}
            >
              <option value="pulse">Impulsion</option>
              <option value="holdPct">Maintien %</option>
            </select>
          </label>
          <div className="v2-settings-row">
            <div className="v2-settings-row-label">
              <span>Duty</span>
            </div>
            <div className="v2-settings-row-control v2-settings-row-control--grow">
              <label className="v2-settings-range">
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
