import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { Switch } from "../../ui";
import { Select, useToast } from "../../ui/shell";
import { WheelNumberInput } from "../../ui/WheelNumberInput";
import { useT } from "../../i18n";
import { ClickerInfoTip } from "../ClickerInfoTip";
import type { ClickerEditor } from "../useClickerEditor";
import {
  DEFAULT_PIXEL_CONDITION,
  type LimitMode,
  type PixelCondition,
  type PixelConditionAction,
} from "../clickerTypes";

type Props = { editor: ClickerEditor };

type LimitChoice = "none" | "clicks" | "time" | "both";

type PixelSample = { x: number; y: number; r: number; g: number; b: number };

type PixelCaptureState = {
  active: boolean;
  cancelled: boolean;
  sample: PixelSample | null;
};

const NUM = "action-cell-input action-cell-num";
const DURATION_PRESETS_SEC = [30, 60, 300, 600] as const;

function limitChoice(e: ClickerEditor): LimitChoice {
  if (!e.limitsEnabled) return "none";
  if (e.limitMode === "time") return "time";
  if (e.limitMode === "both") return "both";
  return "clicks";
}

function parseDurationSec(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n) || 0));
}

function errMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message: unknown }).message;
    if (typeof m === "string") return m;
  }
  return String(err ?? "");
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = Number.parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function ClickerLimitsSection({ editor: e }: Props) {
  const t = useT();
  const toast = useToast();
  const choice = limitChoice(e);
  const [macros, setMacros] = useState<string[]>([]);
  const [liveRgb, setLiveRgb] = useState<{ r: number; g: number; b: number } | null>(
    null,
  );
  const [sampling, setSampling] = useState(false);
  const [pickingScreen, setPickingScreen] = useState(false);
  const [pickPreview, setPickPreview] = useState<PixelSample | null>(null);
  const [pixelDetailsOpen, setPixelDetailsOpen] = useState(false);
  const pickingRef = useRef(false);
  const pixel = e.pixelCondition ?? DEFAULT_PIXEL_CONDITION;
  const pixelRef = useRef(pixel);
  pixelRef.current = pixel;

  useEffect(() => {
    void invoke<{ name: string }[]>("list_macro_library")
      .then((rows) => setMacros(rows.map((r) => r.name).sort()))
      .catch(() => setMacros([]));
  }, []);

  const sampleAt = useCallback(
    async (x: number, y: number): Promise<PixelSample | null> => {
      try {
        return await invoke<PixelSample>("read_pixel", { x, y });
      } catch {
        return null;
      }
    },
    [],
  );

  const samplePixel = useCallback(
    () => sampleAt(pixel.x, pixel.y),
    [pixel.x, pixel.y, sampleAt],
  );

  const applySample = useCallback(
    (sample: PixelSample) => {
      e.setPixelCondition({
        ...pixelRef.current,
        enabled: true,
        x: sample.x,
        y: sample.y,
        r: sample.r,
        g: sample.g,
        b: sample.b,
      });
      setLiveRgb({ r: sample.r, g: sample.g, b: sample.b });
      setPixelDetailsOpen(true);
      toast.success(
        t("clicker.limits.pickOk", {
          x: sample.x,
          y: sample.y,
          rgb: `${sample.r},${sample.g},${sample.b}`,
        }),
      );
    },
    [e, t, toast],
  );

  const finishPixelCapture = useCallback(async (opts?: { cancelled?: boolean }) => {
    try {
      const sample = await invoke<PixelSample | null>("stop_pixel_color_capture");
      if (opts?.cancelled || !sample) {
        toast.info(t("clicker.limits.pickCancel"));
      } else {
        applySample(sample);
      }
    } catch {
      // Already stopped (race with Esc / natural end).
      if (opts?.cancelled) toast.info(t("clicker.limits.pickCancel"));
    } finally {
      pickingRef.current = false;
      setPickingScreen(false);
    }
  }, [applySample, t, toast]);

  const cancelPixelCapture = useCallback(async () => {
    await finishPixelCapture({ cancelled: true });
  }, [finishPixelCapture]);

  const pickReference = useCallback(async () => {
    if (pickingRef.current || sampling) return;
    try {
      await invoke("start_pixel_color_capture");
      pickingRef.current = true;
      setPickingScreen(true);
    } catch (err) {
      toast.error(errMessage(err) || t("clicker.limits.pickFailed"));
    }
  }, [sampling, t, toast]);

  // Live color under cursor while picking (swatch + hex in banner).
  useEffect(() => {
    if (!pickingScreen) {
      setPickPreview(null);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      try {
        const pos = await invoke<{ x: number; y: number }>("get_cursor_position");
        const sample = await invoke<PixelSample>("read_pixel", {
          x: pos.x,
          y: pos.y,
        });
        if (!cancelled) setPickPreview(sample);
      } catch {
        /* ignore transient read errors */
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 80);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [pickingScreen]);

  // Poll like clicker point capture — no blocking await on the pick itself.
  useEffect(() => {
    if (!pickingScreen) return;
    let stopped = false;
    const id = window.setInterval(() => {
      void invoke<PixelCaptureState>("get_pixel_color_capture_state")
        .then((s) => {
          if (stopped || !pickingRef.current) return;
          if (!s.active) {
            stopped = true;
            void finishPixelCapture({ cancelled: s.cancelled });
          }
        })
        .catch(() => {});
    }, 200);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [pickingScreen, finishPixelCapture]);

  useEffect(() => {
    return () => {
      if (!pickingRef.current) return;
      void invoke("stop_pixel_color_capture").catch(() => {});
    };
  }, []);

  const refreshLive = useCallback(async () => {
    setSampling(true);
    const sample = await samplePixel();
    setSampling(false);
    if (!sample) {
      toast.error(t("clicker.limits.refreshFailed"));
      return;
    }
    setLiveRgb({ r: sample.r, g: sample.g, b: sample.b });
  }, [samplePixel, t, toast]);

  useEffect(() => {
    if (!pixel.enabled || e.editDisabled || pickingScreen) {
      if (pickingScreen) setLiveRgb(null);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      const sample = await samplePixel();
      if (!cancelled && sample) {
        setLiveRgb({ r: sample.r, g: sample.g, b: sample.b });
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [pixel.enabled, pixel.x, pixel.y, e.editDisabled, samplePixel, pickingScreen]);

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

  const totalSec = parseDurationSec(e.maxDurationSec);
  const durationMin = Math.floor(totalSec / 60);
  const durationSecPart = totalSec % 60;

  const setDurationParts = (min: number, sec: number) => {
    const m = Math.max(0, Math.floor(min) || 0);
    const s = Math.max(0, Math.min(59, Math.floor(sec) || 0));
    const total = m * 60 + s;
    e.setMaxDurationSec(total > 0 ? String(total) : "");
  };

  const showClicks = choice === "clicks" || choice === "both";
  const showTime = choice === "time" || choice === "both";
  const liveSwatch = liveRgb
    ? `rgb(${liveRgb.r}, ${liveRgb.g}, ${liveRgb.b})`
    : "transparent";
  const pixelDelta =
    liveRgb == null
      ? null
      : Math.max(
          Math.abs(liveRgb.r - pixel.r),
          Math.abs(liveRgb.g - pixel.g),
          Math.abs(liveRgb.b - pixel.b),
        );
  const pixelMatch =
    pixelDelta == null ? null : pixelDelta <= pixel.tolerance;
  const pickPreviewCss = pickPreview
    ? `rgb(${pickPreview.r}, ${pickPreview.g}, ${pickPreview.b})`
    : "transparent";
  const pickPreviewHex = pickPreview
    ? rgbToHex(pickPreview.r, pickPreview.g, pickPreview.b)
    : "—";

  return (
    <div className="caster-clicker-limits-panel">
      {pickingScreen && typeof document !== "undefined"
        ? createPortal(
            <div className="caster-pixel-pick-banner" role="status">
              <strong>{t("shell.pickPixelTitle")}</strong>
              <span>{t("clicker.limits.pickHint")}</span>
              <div className="caster-pixel-pick-preview">
                <span
                  className={[
                    "caster-pixel-pick-swatch",
                    pickPreview ? "" : "is-empty",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={{ background: pickPreviewCss }}
                  aria-hidden
                />
                <code className="caster-pixel-pick-hex">{pickPreviewHex}</code>
                {pickPreview ? (
                  <span className="caster-pixel-pick-rgb">
                    {pickPreview.r}, {pickPreview.g}, {pickPreview.b}
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                className="caster-btn caster-btn-ghost caster-btn-sm"
                onClick={() => void cancelPixelCapture()}
              >
                {t("clicker.limits.pickCancelBtn")}
              </button>
            </div>,
            document.body,
          )
        : null}
      <div className="caster-clicker-limits-block">
        <h3 className="caster-clicker-limits-block-title caster-settings-row-label-with-info">
          <span>{t("clicker.scenario.limitsTitle")}</span>
          <ClickerInfoTip text={t("clicker.limits.titlebarProgressHint")} />
        </h3>
      <div className="caster-settings-row caster-settings-row--stack">
        <div className="caster-settings-row-label">
          <span className="caster-settings-row-label-with-info">
            <span>{t("clicker.limits.sessionEnd")}</span>
            <ClickerInfoTip text={t("clicker.limits.sessionEndHint")} />
          </span>
        </div>
        <div className="caster-settings-row-control caster-settings-row-control--full">
          <div
            className="caster-segmented caster-segmented--wide"
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
                className={["caster-segmented-btn", choice === value ? "active" : ""]
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
        <label className="caster-field caster-clicker-limits-field">
          <span>{t("clicker.limits.maxClicks")}</span>
          <WheelNumberInput
            className={NUM}
            min={1}
            placeholder="100"
            value={e.maxClicks}
            disabled={e.editDisabled}
            onValueChange={(n) => e.setMaxClicks(String(n))}
            onEmptyChange={() => e.setMaxClicks("")}
          />
        </label>
      ) : null}

      {showTime ? (
        <div className="caster-clicker-limits-duration">
          <div className="caster-clicker-limits-duration-fields">
            <label className="caster-field caster-clicker-limits-field">
              <span>{t("clicker.limits.durationMin")}</span>
              <WheelNumberInput
                className={NUM}
                min={0}
                max={999}
                value={durationMin}
                disabled={e.editDisabled}
                onValueChange={(n) => setDurationParts(n, durationSecPart)}
              />
            </label>
            <label className="caster-field caster-clicker-limits-field">
              <span>{t("clicker.limits.durationSecPart")}</span>
              <WheelNumberInput
                className={NUM}
                min={0}
                max={59}
                value={durationSecPart}
                disabled={e.editDisabled}
                onValueChange={(n) => setDurationParts(durationMin, n)}
              />
            </label>
          </div>
          <div
            className="caster-segmented caster-segmented--compact"
            role="group"
            aria-label={t("clicker.limits.durationPresetsAria")}
          >
            {DURATION_PRESETS_SEC.map((sec) => (
              <button
                key={sec}
                type="button"
                className={[
                  "caster-segmented-btn",
                  totalSec === sec ? "active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                disabled={e.editDisabled}
                onClick={() => e.setMaxDurationSec(String(sec))}
              >
                {sec < 60
                  ? t("clicker.limits.presetSec", { n: sec })
                  : t("clicker.limits.presetMin", { n: sec / 60 })}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="caster-settings-row caster-settings-row--stack">
        <div className="caster-settings-row-label">
          <span className="caster-settings-row-label-with-info">
            <span>{t("clicker.limits.chainMacro")}</span>
            <ClickerInfoTip text={t("clicker.limits.chainMacroHint")} />
          </span>
        </div>
        <div className="caster-settings-row-control caster-settings-row-control--full">
          <Select
            className="caster-select"
            disabled={e.editDisabled}
            value={e.onCompleteMacro ?? ""}
            ariaLabel={t("clicker.limits.chainMacroAria")}
            options={[
              { value: "", label: t("clicker.segments.none") },
              ...macros.map((name) => ({ value: name, label: name })),
            ]}
            onChange={(v) => e.setOnCompleteMacro(v || null)}
          />
        </div>
      </div>
      </div>

      <div className="caster-clicker-limits-block">
        <h3 className="caster-clicker-limits-block-title caster-settings-row-label-with-info">
          <span>{t("clicker.limits.pixelCondition")}</span>
          <ClickerInfoTip text={t("clicker.limits.pixelConditionHint")} />
        </h3>
        <div className="caster-settings-row caster-settings-row--stack">
          <div className="caster-settings-row-control caster-settings-row-control--full caster-clicker-pixel-controls">
            <div className="caster-clicker-pixel-summary">
              <div className="caster-clicker-pixel-panel-head">
                <div className="caster-clicker-pixel-panel-title">
                  {t("clicker.limits.pixelSummaryPanel")}
                </div>
                <Switch
                  checked={pixel.enabled}
                  disabled={e.editDisabled}
                  label={t("clicker.limits.enabled")}
                  onChange={(on) => patchPixel({ enabled: on })}
                />
              </div>
              <div
                className={[
                  "caster-clicker-pixel-summary-body",
                  pixel.enabled ? "" : "is-inactive",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <div className="caster-clicker-pixel-main">
                  <button
                    type="button"
                    className="caster-btn caster-btn-sm"
                    disabled={
                      e.editDisabled ||
                      !pixel.enabled ||
                      sampling ||
                      pickingScreen
                    }
                    onClick={() => void pickReference()}
                  >
                    {t("clicker.limits.pickColor")}
                  </button>
                  <div className="caster-clicker-pixel-status">
                    <div className="caster-clicker-pixel-swatch-pair">
                      <span className="caster-clicker-pixel-swatch-slot">
                        <input
                          type="color"
                          className="caster-clicker-pixel-swatch"
                          value={rgbToHex(pixel.r, pixel.g, pixel.b).toLowerCase()}
                          disabled={e.editDisabled || !pixel.enabled}
                          aria-label={t("clicker.limits.refSwatchTitle", {
                            rgb: `${pixel.r},${pixel.g},${pixel.b}`,
                          })}
                          title={t("clicker.limits.refSwatchTitle", {
                            rgb: `${pixel.r},${pixel.g},${pixel.b}`,
                          })}
                          onChange={(ev) => {
                            const rgb = hexToRgb(ev.target.value);
                            if (rgb) patchPixel(rgb);
                          }}
                        />
                        <span className="caster-clicker-pixel-swatch-caption">
                          {t("clicker.limits.pixelGroupRef")}
                        </span>
                      </span>
                      <span className="caster-clicker-pixel-swatch-slot">
                        <span
                          className={[
                            "caster-clicker-pixel-swatch",
                            liveRgb ? "" : "is-empty",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          style={{ background: liveSwatch }}
                          title={
                            liveRgb
                              ? t("clicker.limits.liveSwatchTitle", {
                                  rgb: `${liveRgb.r},${liveRgb.g},${liveRgb.b}`,
                                })
                              : t("clicker.limits.liveSwatchEmpty")
                          }
                        />
                        <span className="caster-clicker-pixel-swatch-caption">
                          {t("clicker.limits.pixelGroupLive")}
                        </span>
                      </span>
                    </div>
                    {pixelMatch != null ? (
                      <span
                        className={[
                          "caster-clicker-pixel-match",
                          pixelMatch ? "is-match" : "is-mismatch",
                        ].join(" ")}
                      >
                        {pixelMatch
                          ? t("clicker.limits.pixelMatchOk", {
                              delta: pixelDelta,
                            })
                          : t("clicker.limits.pixelMatchBad", {
                              delta: pixelDelta,
                            })}
                      </span>
                    ) : null}
                    <span className="caster-clicker-pixel-coords">
                      {t("clicker.limits.pixelCoords", {
                        x: pixel.x,
                        y: pixel.y,
                      })}
                    </span>
                  </div>
                </div>

                <div className="caster-clicker-pixel-action-row">
                  <span className="caster-clicker-pixel-action-label">
                    {t("clicker.limits.pixelIfGap")}
                  </span>
                  <div
                    className="caster-segmented"
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
                          "caster-segmented-btn",
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

            <details
              className="caster-clicker-details caster-clicker-pixel-details"
              open={pixelDetailsOpen}
              onToggle={(ev) =>
                setPixelDetailsOpen(
                  (ev.currentTarget as HTMLDetailsElement).open,
                )
              }
            >
              <summary>{t("clicker.limits.pixelManualSettings")}</summary>
              <div className="caster-clicker-pixel-manual">
                <div className="caster-clicker-pixel-point-grid">
                  <label className="caster-field caster-clicker-limits-field">
                    <span>X</span>
                    <WheelNumberInput
                      className={NUM}
                      value={pixel.x}
                      disabled={e.editDisabled || !pixel.enabled}
                      onValueChange={(n) => patchPixel({ x: n })}
                    />
                  </label>
                  <label className="caster-field caster-clicker-limits-field">
                    <span>Y</span>
                    <WheelNumberInput
                      className={NUM}
                      value={pixel.y}
                      disabled={e.editDisabled || !pixel.enabled}
                      onValueChange={(n) => patchPixel({ y: n })}
                    />
                  </label>
                  <label className="caster-field caster-clicker-limits-field">
                    <span>{t("clicker.limits.tolerance")}</span>
                    <WheelNumberInput
                      className={NUM}
                      min={0}
                      max={255}
                      value={pixel.tolerance}
                      disabled={e.editDisabled || !pixel.enabled}
                      onValueChange={(n) =>
                        patchPixel({ tolerance: n || 0 })
                      }
                    />
                  </label>
                </div>
                <div className="caster-clicker-pixel-rgb-row">
                  <div className="caster-clicker-pixel-rgb-grid">
                    <label className="caster-field caster-clicker-limits-field">
                      <span>R</span>
                      <WheelNumberInput
                        className={NUM}
                        min={0}
                        max={255}
                        value={pixel.r}
                        disabled={e.editDisabled || !pixel.enabled}
                        onValueChange={(n) =>
                          patchPixel({ r: clampByte(n) })
                        }
                      />
                    </label>
                    <label className="caster-field caster-clicker-limits-field">
                      <span>G</span>
                      <WheelNumberInput
                        className={NUM}
                        min={0}
                        max={255}
                        value={pixel.g}
                        disabled={e.editDisabled || !pixel.enabled}
                        onValueChange={(n) =>
                          patchPixel({ g: clampByte(n) })
                        }
                      />
                    </label>
                    <label className="caster-field caster-clicker-limits-field">
                      <span>B</span>
                      <WheelNumberInput
                        className={NUM}
                        min={0}
                        max={255}
                        value={pixel.b}
                        disabled={e.editDisabled || !pixel.enabled}
                        onValueChange={(n) =>
                          patchPixel({ b: clampByte(n) })
                        }
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    className="caster-btn caster-btn-sm"
                    disabled={
                      e.editDisabled ||
                      !pixel.enabled ||
                      sampling ||
                      pickingScreen
                    }
                    onClick={() => void refreshLive()}
                  >
                    {t("clicker.limits.refreshColor")}
                  </button>
                </div>
              </div>
            </details>
          </div>
        </div>
      </div>
    </div>
  );
}
