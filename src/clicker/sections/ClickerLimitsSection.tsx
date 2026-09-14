import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Select } from "../../ui/v2";
import { useT } from "../../i18n";
import type { ClickerEditor } from "../useClickerEditor";
import {
  DEFAULT_PIXEL_CONDITION,
  type LimitMode,
  type PixelCondition,
  type PixelConditionAction,
} from "../clickerTypes";

type Props = { editor: ClickerEditor };

type LimitChoice = "none" | "clicks" | "time" | "both";

function limitChoice(e: ClickerEditor): LimitChoice {
  if (!e.limitsEnabled) return "none";
  if (e.limitMode === "time") return "time";
  if (e.limitMode === "both") return "both";
  return "clicks";
}

export function ClickerLimitsSection({ editor: e }: Props) {
  const t = useT();
  const choice = limitChoice(e);
  const [macros, setMacros] = useState<string[]>([]);
  const pixel = e.pixelCondition ?? DEFAULT_PIXEL_CONDITION;

  useEffect(() => {
    void invoke<{ name: string }[]>("list_macro_library")
      .then((rows) => setMacros(rows.map((r) => r.name).sort()))
      .catch(() => setMacros([]));
  }, []);

  const setChoice = (next: LimitChoice) => {
    if (next === "none") {
      e.setLimitsEnabled(false);
      e.setMaxClicks("");
      e.setMaxDurationSec("");
      return;
    }
    e.setLimitsEnabled(true);
    const mode: LimitMode =
      next === "time" ? "time" : next === "both" ? "both" : "clicks";
    e.setLimitMode(mode);
    if ((next === "clicks" || next === "both") && e.maxClicks === "") {
      e.setMaxClicks("100");
    }
    if ((next === "time" || next === "both") && e.maxDurationSec === "") {
      e.setMaxDurationSec("60");
    }
  };

  const patchPixel = (patch: Partial<PixelCondition>) => {
    e.setPixelCondition({ ...pixel, ...patch });
  };

  const onPickPixel = async () => {
    try {
      const p = await invoke<{ x: number; y: number }>("pick_point");
      const sample = await invoke<{
        x: number;
        y: number;
        r: number;
        g: number;
        b: number;
      }>("read_pixel", { x: p.x, y: p.y });
      patchPixel({
        enabled: true,
        x: sample.x,
        y: sample.y,
        r: sample.r,
        g: sample.g,
        b: sample.b,
      });
    } catch {
      /* cancelled */
    }
  };

  const showClicks = choice === "clicks" || choice === "both";
  const showTime = choice === "time" || choice === "both";
  const swatch = `rgb(${pixel.r}, ${pixel.g}, ${pixel.b})`;

  return (
    <div className="v2-clicker-limits-panel">
      <div className="v2-settings-row v2-settings-row--stack">
        <div className="v2-settings-row-label">
          <span>{t("clicker.limits.sessionEnd")}</span>
          <p>{t("clicker.limits.sessionEndHint")}</p>
        </div>
        <div className="v2-settings-row-control v2-settings-row-control--full">
          <div
            className="v2-segmented v2-segmented--wide"
            role="group"
            aria-label={t("clicker.limits.modeAria")}
          >
            {(
              [
                ["none", t("clicker.segments.none")],
                ["clicks", t("clicker.segments.clicks")],
                ["time", t("clicker.segments.time")],
                ["both", t("clicker.segments.both")],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={["v2-segmented-btn", choice === value ? "active" : ""]
                  .filter(Boolean)
                  .join(" ")}
                disabled={e.editDisabled}
                onClick={() => setChoice(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {showClicks ? (
        <label className="v2-field v2-clicker-limits-field">
          <span>{t("clicker.limits.maxClicks")}</span>
          <input
            type="number"
            min={1}
            placeholder="100"
            value={e.maxClicks}
            disabled={e.editDisabled}
            onChange={(ev) => e.setMaxClicks(ev.target.value)}
          />
        </label>
      ) : null}

      {showTime ? (
        <label className="v2-field v2-clicker-limits-field">
          <span>{t("clicker.limits.durationSec")}</span>
          <input
            type="number"
            min={1}
            placeholder="60"
            value={e.maxDurationSec}
            disabled={e.editDisabled}
            onChange={(ev) => e.setMaxDurationSec(ev.target.value)}
          />
        </label>
      ) : null}

      <div className="v2-settings-row v2-settings-row--stack">
        <div className="v2-settings-row-label">
          <span>{t("clicker.limits.chainMacro")}</span>
          <p>{t("clicker.limits.chainMacroHint")}</p>
        </div>
        <div className="v2-settings-row-control v2-settings-row-control--full">
          <Select
            className="v2-select"
            disabled={e.editDisabled}
            value={e.onCompleteMacro ?? ""}
            options={[
              { value: "", label: t("clicker.segments.none") },
              ...macros.map((name) => ({ value: name, label: name })),
            ]}
            onChange={(v) => e.setOnCompleteMacro(v || null)}
          />
        </div>
      </div>

      <div className="v2-settings-row v2-settings-row--stack">
        <div className="v2-settings-row-label">
          <span>{t("clicker.limits.pixelCondition")}</span>
          <p>{t("clicker.limits.pixelConditionHint")}</p>
        </div>
        <div className="v2-settings-row-control v2-settings-row-control--full v2-clicker-pixel-controls">
          <label className="v2-check">
            <input
              type="checkbox"
              checked={pixel.enabled}
              disabled={e.editDisabled}
              onChange={(ev) => patchPixel({ enabled: ev.target.checked })}
            />
            {t("clicker.limits.enabled")}
          </label>
          <button
            type="button"
            className="v2-btn v2-btn-ghost"
            disabled={e.editDisabled}
            onClick={() => void onPickPixel()}
          >
            {t("clicker.limits.pickColor")}
          </button>
          <span
            className="v2-clicker-pixel-swatch"
            style={{ background: swatch }}
            title={`${pixel.x},${pixel.y} · ${swatch}`}
          />
          <label className="v2-field v2-clicker-limits-field">
            <span>{t("clicker.limits.tolerance")}</span>
            <input
              type="number"
              min={0}
              max={255}
              value={pixel.tolerance}
              disabled={e.editDisabled || !pixel.enabled}
              onChange={(ev) =>
                patchPixel({ tolerance: Number(ev.target.value) || 0 })
              }
            />
          </label>
          <div
            className="v2-segmented"
            role="group"
            aria-label={t("clicker.limits.pixelActionAria")}
          >
            {(
              [
                ["stop", t("clicker.segments.stop")],
                ["pause", t("clicker.segments.pause")],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={[
                  "v2-segmented-btn",
                  pixel.action === value ? "active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                disabled={e.editDisabled || !pixel.enabled}
                onClick={() =>
                  patchPixel({ action: value as PixelConditionAction })
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
