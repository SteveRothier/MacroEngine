import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { EngineStatus } from "../macros/types";
import { normalizeHotkeyTrigger } from "../macros/types";
import type { ThemeMode } from "../theme";
import { confirmChoice } from "../ui";
import { useT } from "../i18n";
import {
  DEFAULT_PROCESS_FILTER,
  FALLBACK_SCREEN_GEOM,
  MANUAL_TRIGGER,
  newZoneId,
  type ClickerConfigPayload,
  type ClickerTrigger,
  type ClickKind,
  type ClickMode,
  type ClickPoint,
  type ClickerProcessFilterMode,
  type ClickZoneOrder,
  type CustomZone,
  type DisplayDto,
  type DutyMode,
  type InputKind,
  type LimitMode,
  type MouseButton,
  type PixelCondition,
  type ProcessFilter,
  type RateUnit,
  type ScreenGeomDto,
  type TimingMode,
  type ZoneKind,
  type ZoneSelection,
  screenGeomFromDisplay,
} from "./clickerTypes";
import { useClickerSettingsApi } from "./useClickerSettings";
import { pickScreenPointDetailed } from "../pick";
import { useToast } from "../ui/shell";
import {
  drawSafetyZone,
  pushZoneOverlayState,
  setZoneOverlayVisible,
} from "./zoneOverlay";
import {
  EMPTY_ZONE_MODEL,
  clampCustomExtent,
  clampZoneModel,
  modelFromStopZones,
  moveCustom,
  nextCustomZoneColor,
  stopZonesFromModel,
  type ZoneModel,
} from "./zoneGeom";

const HISTORY_MAX = 50;

export type ClickerMetrics = {
  clicksEmitted: number;
  targetCps: number;
  measuredCps: number;
  cumulativeDeadlineErrorMs: number;
  elapsedMs: number;
  running: boolean;
  /** Ticks skipped because the process filter blocked the foreground exe. */
  filterBlockedTicks?: number;
};

export type UseClickerEditorOptions = {
  presetId: string;
  status: EngineStatus;
  onStatus: (s: EngineStatus) => void;
  refresh: () => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
  onRenamed?: (from: string, to: string) => void;
  theme: ThemeMode;
};

export function useClickerEditor(opts: UseClickerEditorOptions) {
  const { presetId, status, onStatus, refresh, onDirtyChange, onRenamed, theme } =
    opts;
  const t = useT();
  const toast = useToast();
  const { loadSettings, saveBundle } = useClickerSettingsApi();
  const onDirtyChangeRef = useRef(onDirtyChange);
  onDirtyChangeRef.current = onDirtyChange;
  const onRenamedRef = useRef(onRenamed);
  onRenamedRef.current = onRenamed;

  const [cps, setCps] = useState(10);
  const [cpsMin, setCpsMin] = useState(0);
  const [cpsMax, setCpsMax] = useState(0);
  const [rateUnit, setRateUnit] = useState<RateUnit>("perSecond");
  const [timingMode, setTimingMode] = useState<TimingMode>("rate");
  const [intervalMs, setIntervalMs] = useState(100);
  const [button, setButton] = useState<MouseButton>("left");
  const [mode, setMode] = useState<ClickMode>("toggle");
  const [inputKind, setInputKind] = useState<InputKind>("mouse");
  const [keyName, setKeyName] = useState("A");
  const [keyShift, setKeyShift] = useState(false);
  const [metrics, setMetrics] = useState<ClickerMetrics | null>(null);
  const [foregroundExe, setForegroundExe] = useState<string | null>(null);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [advancedUi, setAdvancedUi] = useState(false);
  const [targetFixed, setTargetFixed] = useState(false);
  const [targetX, setTargetX] = useState(0);
  const [targetY, setTargetY] = useState(0);
  const [clickKind, setClickKind] = useState<ClickKind>("single");
  const [duty, setDuty] = useState(1);
  const [dutyMode, setDutyMode] = useState<DutyMode>("pulse");
  const [limitsEnabled, setLimitsEnabled] = useState(false);
  const [limitMode, setLimitMode] = useState<LimitMode>("clicks");
  const [maxClicks, setMaxClicks] = useState("");
  const [maxDurationSec, setMaxDurationSec] = useState("");
  const [onCompleteMacro, setOnCompleteMacro] = useState<string | null>(null);
  const [pixelCondition, setPixelCondition] = useState<PixelCondition | null>(
    null,
  );
  const [cpsSamples, setCpsSamples] = useState<{ t: number; cps: number }[]>(
    [],
  );
  const [randomEnabled, setRandomEnabled] = useState(false);
  const [randomPct, setRandomPct] = useState(0);
  const [clickZoneOrder, setClickZoneOrder] =
    useState<ClickZoneOrder>("random");
  const [zoneModel, setZoneModel] = useState<ZoneModel>(EMPTY_ZONE_MODEL);
  const [zoneSelection, setZoneSelection] = useState<ZoneSelection | null>(
    null,
  );
  const [zoneOverlayVisible, setZoneOverlayVisibleState] = useState(false);
  const [screenGeom, setScreenGeom] =
    useState<ScreenGeomDto>(FALLBACK_SCREEN_GEOM);
  const [displays, setDisplays] = useState<DisplayDto[]>([]);
  const [activeDisplayId, setActiveDisplayId] = useState<string | null>(null);
  const [pointsEnabled, setPointsEnabled] = useState(false);
  const [points, setPoints] = useState<ClickPoint[]>([]);
  const [stopWhenComplete, setStopWhenComplete] = useState(false);
  const [picking, setPicking] = useState(false);
  const [pickingPointIndex, setPickingPointIndex] = useState<number | null>(null);
  const [capturingPoints, setCapturingPoints] = useState(false);
  const [capturedCount, setCapturedCount] = useState(0);
  const [drawing, setDrawing] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [selectedPreset, setSelectedPreset] = useState("");
  const [trigger, setTriggerState] = useState<ClickerTrigger>(MANUAL_TRIGGER);
  const [dirty, setDirty] = useState(false);
  const [locked, setLocked] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [processFilter, setProcessFilter] = useState<ProcessFilter>(
    DEFAULT_PROCESS_FILTER,
  );
  const [presetFilterMode, setPresetFilterMode] =
    useState<ClickerProcessFilterMode>("inherit");
  const [localProcessFilter, setLocalProcessFilter] = useState<ProcessFilter>(
    DEFAULT_PROCESS_FILTER,
  );

  const pastRef = useRef<ClickerConfigPayload[]>([]);
  const futureRef = useRef<ClickerConfigPayload[]>([]);
  const baselineKeyRef = useRef<string>("");
  const skipHistoryRef = useRef(false);
  const dirtyRef = useRef(false);
  const lockedRef = useRef(false);
  const selectedPresetRef = useRef("");
  const triggerRef = useRef<ClickerTrigger>(MANUAL_TRIGGER);
  const autosaveTimerRef = useRef<number | null>(null);
  const capturingPointsRef = useRef(false);
  const buildConfigRef = useRef<() => ClickerConfigPayload>(() => {
    throw new Error("buildConfig not ready");
  });

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
  useEffect(() => {
    lockedRef.current = locked;
  }, [locked]);
  useEffect(() => {
    selectedPresetRef.current = selectedPreset;
  }, [selectedPreset]);
  useEffect(() => {
    triggerRef.current = trigger;
  }, [trigger]);
  useEffect(() => {
    capturingPointsRef.current = capturingPoints;
  }, [capturingPoints]);

  const syncHistFlags = useCallback(() => {
    setCanUndo(pastRef.current.length > 0);
    setCanRedo(futureRef.current.length > 0);
  }, []);

  const clearHistory = useCallback(() => {
    pastRef.current = [];
    futureRef.current = [];
    syncHistFlags();
  }, [syncHistFlags]);

  const buildConfig = useCallback((): ClickerConfigPayload => {
    return {
      button,
      cps,
      mode,
      target: targetFixed
        ? { type: "fixed", x: targetX, y: targetY }
        : { type: "currentCursor" },
      cpsJitter: 0,
      cpsMin,
      cpsMax,
      rateUnit,
      timingMode,
      intervalMs,
      inputKind,
      key: keyName,
      keyShift,
      clickKind,
      dutyCycle: duty,
      dutyMode,
      limitsEnabled,
      limitMode,
      maxClicks: maxClicks === "" ? null : Number(maxClicks),
      maxDurationMs:
        maxDurationSec === "" ? null : Number(maxDurationSec) * 1000,
      onCompleteMacro,
      pixelCondition,
      randomEnabled,
      randomPct,
      pointsEnabled,
      points,
      stopWhenComplete,
      clickZoneOrder,
      stopZones: stopZonesFromModel(zoneModel),
      processFilter: presetFilterMode,
      localProcessFilter,
    };
  }, [
    button,
    cps,
    mode,
    targetFixed,
    targetX,
    targetY,
    cpsMin,
    cpsMax,
    rateUnit,
    timingMode,
    intervalMs,
    inputKind,
    keyName,
    keyShift,
    clickKind,
    duty,
    dutyMode,
    limitsEnabled,
    limitMode,
    maxClicks,
    maxDurationSec,
    onCompleteMacro,
    pixelCondition,
    randomEnabled,
    randomPct,
    pointsEnabled,
    points,
    stopWhenComplete,
    clickZoneOrder,
    zoneModel,
    presetFilterMode,
    localProcessFilter,
  ]);

  buildConfigRef.current = buildConfig;

  const applyConfig = useCallback((c: ClickerConfigPayload) => {
    setCps(c.cps);
    setCpsMin(c.cpsMin ?? 0);
    setCpsMax(c.cpsMax ?? 0);
    setRateUnit(c.rateUnit ?? "perSecond");
    setTimingMode(c.timingMode ?? "rate");
    setIntervalMs(c.intervalMs ?? 100);
    setButton(c.button);
    setMode(c.mode);
    setInputKind(c.inputKind ?? "mouse");
    setKeyName(c.key ?? "A");
    setKeyShift(!!c.keyShift);
    setClickKind(c.clickKind ?? "single");
    setDuty(c.dutyCycle ?? 1);
    setDutyMode(c.dutyMode ?? "pulse");
    setLimitsEnabled(!!c.limitsEnabled);
    setLimitMode(c.limitMode ?? "clicks");
    setMaxClicks(c.maxClicks != null ? String(c.maxClicks) : "");
    setMaxDurationSec(
      c.maxDurationMs != null ? String(c.maxDurationMs / 1000) : "",
    );
    setOnCompleteMacro(c.onCompleteMacro ?? null);
    setPixelCondition(c.pixelCondition ?? null);
    setRandomEnabled(!!c.randomEnabled);
    setRandomPct(c.randomPct ?? 0);
    setClickZoneOrder(c.clickZoneOrder ?? "random");
    setPointsEnabled(!!c.pointsEnabled);
    setPoints(c.points ?? []);
    setStopWhenComplete(!!c.stopWhenComplete);
    if (c.target?.type === "fixed") {
      setTargetFixed(true);
      setTargetX(c.target.x);
      setTargetY(c.target.y);
    } else {
      setTargetFixed(false);
    }
    setZoneModel(
      clampZoneModel(modelFromStopZones(c.stopZones ?? []), screenGeom),
    );
    setZoneSelection(null);
    setPresetFilterMode(c.processFilter ?? "inherit");
    setLocalProcessFilter({
      ...DEFAULT_PROCESS_FILTER,
      ...(c.localProcessFilter ?? {}),
    });
  }, [screenGeom]);

  const persistUi = useCallback(
    async (
      nextOverlay = overlayVisible,
      nextFilter = processFilter,
      nextTheme = theme,
      nextDisplayId = activeDisplayId,
    ) => {
      await saveBundle({
        clicker: buildConfig(),
        advancedUi,
        overlayVisible: nextOverlay,
        processFilter: nextFilter,
        theme: nextTheme,
        displayId: nextDisplayId,
      });
    },
    [
      activeDisplayId,
      advancedUi,
      buildConfig,
      overlayVisible,
      processFilter,
      saveBundle,
      theme,
    ],
  );

  const loadPresetLockedState = useCallback(async (name: string) => {
    try {
      const dto = await invoke<{
        items: { id: string; locked: boolean }[];
      }>("get_library_index_cmd", { kind: "clicker" });
      setLocked(Boolean(dto.items.find((i) => i.id === name)?.locked));
    } catch {
      setLocked(false);
    }
  }, []);

  const resolveDirtyBeforeSwitch = useCallback(
    async (nextName: string | null): Promise<boolean> => {
      if (!dirty || !selectedPreset) return true;
      if (nextName && nextName === selectedPreset) return true;
      if (locked) {
        const outcome = await confirmChoice({
          title: t("clicker.confirms.lockedTitle"),
          message: t("clicker.confirms.lockedMessage", {
            name: selectedPreset,
          }),
          confirmLabel: t("clicker.confirms.discard"),
          cancelLabel: t("common.cancel"),
          danger: true,
        });
        return outcome === "confirm";
      }
      try {
        await invoke("save_clicker_preset", {
          name: selectedPreset,
          config: buildConfig(),
          trigger,
        });
        baselineKeyRef.current = JSON.stringify(buildConfig());
        setDirty(false);
        return true;
      } catch {
        const outcome = await confirmChoice({
          title: t("clicker.confirms.saveFailedTitle"),
          message: t("clicker.confirms.saveFailedMessage", {
            name: selectedPreset,
          }),
          confirmLabel: t("common.save"),
          discardLabel: t("clicker.confirms.discard"),
          cancelLabel: t("common.cancel"),
          danger: false,
        });
        if (outcome === "cancel") return false;
        if (outcome === "confirm") {
          try {
            await invoke("save_clicker_preset", {
              name: selectedPreset,
              config: buildConfig(),
              trigger,
            });
            baselineKeyRef.current = JSON.stringify(buildConfig());
            setDirty(false);
          } catch {
            return false;
          }
        }
        return true;
      }
    },
    [buildConfig, dirty, locked, selectedPreset, t, trigger],
  );

  const onLoadPreset = useCallback(
    async (name: string, loadOpts?: { skipDirtyGuard?: boolean }) => {
      if (!loadOpts?.skipDirtyGuard) {
        const ok = await resolveDirtyBeforeSwitch(name);
        if (!ok) return;
      }
      const preset = await invoke<{
        name: string;
        config: ClickerConfigPayload;
        trigger?: ClickerTrigger;
      }>("load_clicker_preset", { name });
      skipHistoryRef.current = true;
      applyConfig(preset.config);
      setPresetName(preset.name);
      setSelectedPreset(preset.name);
      setTriggerState(
        normalizeHotkeyTrigger(preset.trigger ?? MANUAL_TRIGGER) as ClickerTrigger,
      );
      baselineKeyRef.current = JSON.stringify(preset.config);
      setDirty(false);
      clearHistory();
      await loadPresetLockedState(preset.name);
    },
    [
      applyConfig,
      clearHistory,
      loadPresetLockedState,
      resolveDirtyBeforeSwitch,
    ],
  );

  const onLoadPresetRef = useRef(onLoadPreset);
  onLoadPresetRef.current = onLoadPreset;

  const undoConfig = useCallback(() => {
    if (locked || pastRef.current.length === 0) return;
    const prev = pastRef.current[pastRef.current.length - 1]!;
    pastRef.current = pastRef.current.slice(0, -1);
    futureRef.current = [
      ...futureRef.current,
      structuredClone(buildConfig()),
    ].slice(-HISTORY_MAX);
    syncHistFlags();
    skipHistoryRef.current = true;
    applyConfig(prev);
  }, [applyConfig, buildConfig, locked, syncHistFlags]);

  const redoConfig = useCallback(() => {
    if (locked || futureRef.current.length === 0) return;
    const next = futureRef.current[futureRef.current.length - 1]!;
    futureRef.current = futureRef.current.slice(0, -1);
    pastRef.current = [
      ...pastRef.current,
      structuredClone(buildConfig()),
    ].slice(-HISTORY_MAX);
    syncHistFlags();
    skipHistoryRef.current = true;
    applyConfig(next);
  }, [applyConfig, buildConfig, locked, syncHistFlags]);

  const discardChanges = useCallback(() => {
    if (!baselineKeyRef.current) return;
    try {
      const baseline = JSON.parse(
        baselineKeyRef.current,
      ) as ClickerConfigPayload;
      skipHistoryRef.current = true;
      applyConfig(baseline);
      setDirty(false);
      clearHistory();
    } catch {
      /* ignore */
    }
  }, [applyConfig, clearHistory]);

  const applyTemplate = useCallback(
    (config: ClickerConfigPayload) => {
      if (locked) return;
      try {
        pastRef.current = [...pastRef.current, buildConfig()].slice(-HISTORY_MAX);
        futureRef.current = [];
        syncHistFlags();
      } catch {
        /* ignore */
      }
      applyConfig(config);
    },
    [applyConfig, buildConfig, locked, syncHistFlags],
  );

  const onSelectDisplay = useCallback(
    async (id: string) => {
      const running =
        status.state === "running" || status.state === "paused";
      if (!id || running || locked) return;
      try {
        const display = await invoke<DisplayDto>("set_active_display", {
          displayId: id,
        });
        setActiveDisplayId(id);
        setScreenGeom(screenGeomFromDisplay(display));
        await persistUi(undefined, undefined, undefined, id);
      } catch {
        /* ignore */
      }
    },
    [locked, persistUi, status.state],
  );

  const onStart = useCallback(async () => {
    setCpsSamples([]);
    const next = await invoke<EngineStatus>("start_clicker", {
      request: buildConfig(),
    });
    onStatus(next);
    await refresh();
  }, [buildConfig, onStatus, refresh]);

  const onStop = useCallback(async () => {
    const next = await invoke<EngineStatus>("request_cancel");
    onStatus(next);
    await refresh();
  }, [onStatus, refresh]);

  const onPause = useCallback(async () => {
    const next = await invoke<EngineStatus>("pause_clicker");
    onStatus(next);
    await refresh();
  }, [onStatus, refresh]);

  const onResume = useCallback(async () => {
    const next = await invoke<EngineStatus>("resume_clicker");
    onStatus(next);
    await refresh();
  }, [onStatus, refresh]);

  const onPick = useCallback(async () => {
    setPicking(true);
    setPickingPointIndex(null);
    try {
      const result = await pickScreenPointDetailed();
      if (!result.ok) {
        if (result.reason === "timeout" || result.reason === "error") {
          toast.info(t("macros.params.pickCancelled"));
        }
        return;
      }
      setTargetFixed(true);
      setTargetX(result.point.x);
      setTargetY(result.point.y);
      await persistUi();
    } finally {
      setPicking(false);
    }
  }, [persistUi, t, toast]);

  const onPickPoint = useCallback(
    async (index: number) => {
      setPicking(true);
      setPickingPointIndex(index);
      try {
        const result = await pickScreenPointDetailed();
        if (!result.ok) {
          if (result.reason === "timeout" || result.reason === "error") {
            toast.info(t("macros.params.pickCancelled"));
          }
          return;
        }
        setPointsEnabled(true);
        setPoints((prev) =>
          prev.map((pt, j) =>
            j === index
              ? { ...pt, x: result.point.x, y: result.point.y }
              : pt,
          ),
        );
        await persistUi();
      } finally {
        setPicking(false);
        setPickingPointIndex(null);
      }
    },
    [persistUi, t, toast],
  );

  const finishPointCapture = useCallback(async () => {
    try {
      const captured = await invoke<ClickPoint[]>(
        "stop_clicker_point_capture",
      );
      if (captured.length > 0) {
        setPoints((prev) => [...prev, ...captured]);
        setPointsEnabled(true);
      }
      return captured;
    } finally {
      setCapturingPoints(false);
      setCapturedCount(0);
    }
  }, []);

  const onTogglePointCapture = useCallback(async () => {
    if (capturingPoints) {
      await finishPointCapture();
      return;
    }
    await invoke("start_clicker_point_capture");
    setCapturedCount(0);
    setCapturingPoints(true);
  }, [capturingPoints, finishPointCapture]);

  // Poll progress so the button shows the count and reacts to Esc (cancel).
  useEffect(() => {
    if (!capturingPoints) return;
    let stopped = false;
    const id = window.setInterval(() => {
      void invoke<{ active: boolean; count: number; cancelled: boolean }>(
        "get_clicker_point_capture_state",
      )
        .then((s) => {
          if (stopped) return;
          setCapturedCount(s.count);
          if (!s.active) {
            stopped = true;
            void finishPointCapture().catch(() => {});
          }
        })
        .catch(() => {});
    }, 250);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [capturingPoints, finishPointCapture]);

  useEffect(() => {
    return () => {
      if (!capturingPointsRef.current) return;
      void invoke("stop_clicker_point_capture").catch(() => {});
    };
  }, []);

  const addCustomZone = useCallback(
    (
      rect: { x: number; y: number; width: number; height: number },
      kind: ZoneKind = "safety",
    ) => {
      const id = newZoneId();
      setZoneModel((m) => {
        const color = nextCustomZoneColor(m.customZones.map((z) => z.color));
        const newZone = clampCustomExtent(
          {
            id,
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            action: "stop",
            kind,
            color,
            clickMode: "random",
          },
          {},
          screenGeom,
        );
        return {
          ...m,
          customZones: [...m.customZones, newZone],
        };
      });
      setZoneSelection({ kind: "custom", id });
    },
    [screenGeom],
  );

  const onDrawZone = useCallback(
    async (kind: ZoneKind = "safety") => {
      setDrawing(true);
      try {
        if (zoneOverlayVisible) {
          await pushZoneOverlayState(screenGeom, stopZonesFromModel(zoneModel));
        }
        const r = await drawSafetyZone();
        if (!r) return;
        addCustomZone(r, kind);
      } finally {
        setDrawing(false);
      }
    },
    [addCustomZone, screenGeom, zoneModel, zoneOverlayVisible],
  );

  const updateCustomZone = useCallback(
    (id: string, patch: Partial<CustomZone>) => {
      setZoneModel((m) => ({
        ...m,
        customZones: m.customZones.map((z) =>
          z.id === id ? { ...z, ...patch } : z,
        ),
      }));
    },
    [],
  );

  const removeCustomZone = useCallback((id: string) => {
    setZoneModel((m) => ({
      ...m,
      customZones: m.customZones.filter((z) => z.id !== id),
    }));
    setZoneSelection((cur) =>
      cur?.kind === "custom" && cur.id === id ? null : cur,
    );
  }, []);

  const duplicateCustomZone = useCallback(
    (id: string) => {
      let newId: string | null = null;
      setZoneModel((m) => {
        const src = m.customZones.find((z) => z.id === id);
        if (!src) return m;
        newId = newZoneId();
        const color = nextCustomZoneColor(m.customZones.map((z) => z.color));
        const offset = moveCustom(src, 16, 16, screenGeom);
        const clone: CustomZone = {
          ...offset,
          id: newId,
          color,
        };
        return {
          ...m,
          customZones: [...m.customZones, clone],
        };
      });
      if (newId) setZoneSelection({ kind: "custom", id: newId });
    },
    [screenGeom],
  );

  const moveCustomZoneOrder = useCallback(
    (id: string, where: "front" | "back") => {
      setZoneModel((m) => {
        const idx = m.customZones.findIndex((z) => z.id === id);
        if (idx < 0) return m;
        const next = [...m.customZones];
        const [zone] = next.splice(idx, 1);
        if (!zone) return m;
        if (where === "front") next.push(zone);
        else next.unshift(zone);
        return { ...m, customZones: next };
      });
    },
    [],
  );

  const onSavePreset = useCallback(async () => {
    if (!selectedPreset || locked) return;
    const normalized = normalizeHotkeyTrigger(trigger) as ClickerTrigger;
    if (normalized !== trigger) setTriggerState(normalized);
    await invoke("save_clicker_preset", {
      name: selectedPreset,
      config: buildConfig(),
      trigger: normalized,
    });
    baselineKeyRef.current = JSON.stringify(buildConfig());
    setDirty(false);
  }, [buildConfig, locked, selectedPreset, trigger]);

  /** Save the current config under a new name (keeps this tab untouched). */
  const onSaveAsNewPreset = useCallback(
    async (rawName: string): Promise<string> => {
      const name = rawName.trim();
      if (!name) throw new Error("empty preset name");
      const preset = await invoke<{ name: string }>("save_clicker_preset", {
        name,
        config: buildConfig(),
        trigger: MANUAL_TRIGGER,
      });
      return preset?.name ?? name;
    },
    [buildConfig],
  );

  const setTrigger = useCallback(
    async (next: ClickerTrigger) => {
      if (!selectedPreset || locked) return;
      const normalized = normalizeHotkeyTrigger(next) as ClickerTrigger;
      setTriggerState(normalized);
      await invoke("save_clicker_preset", {
        name: selectedPreset,
        config: buildConfig(),
        trigger: normalized,
      });
    },
    [buildConfig, locked, selectedPreset],
  );

  useEffect(() => {
    if (!dirty || locked || !selectedPreset) return;
    if (autosaveTimerRef.current != null) {
      window.clearTimeout(autosaveTimerRef.current);
    }
    autosaveTimerRef.current = window.setTimeout(() => {
      autosaveTimerRef.current = null;
      void onSavePreset().catch((e: unknown) => {
        console.error(e);
      });
    }, 600);
    return () => {
      if (autosaveTimerRef.current != null) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [dirty, locked, onSavePreset, selectedPreset]);

  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current != null) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      if (
        dirtyRef.current &&
        !lockedRef.current &&
        selectedPresetRef.current
      ) {
        const normalized = normalizeHotkeyTrigger(
          triggerRef.current,
        ) as ClickerTrigger;
        void invoke("save_clicker_preset", {
          name: selectedPresetRef.current,
          config: buildConfigRef.current(),
          trigger: normalized,
        }).catch(() => {});
      }
    };
  }, []);

  const onRenamePreset = useCallback(
    async (raw: string) => {
      if (!selectedPreset || locked) return;
      const from = selectedPreset;
      const to = raw.trim();
      if (!to || to === from) return;
      try {
        if (dirty) {
          await invoke("save_clicker_preset", {
            name: from,
            config: buildConfig(),
          });
        }
        const preset = await invoke<{
          name: string;
          config: ClickerConfigPayload;
        }>("rename_clicker_preset", { from, to });
        await onLoadPreset(preset.name, { skipDirtyGuard: true });
        onRenamedRef.current?.(from, preset.name);
        await refresh();
      } catch (e) {
        setPresetName(from);
        console.error(e);
      }
    },
    [buildConfig, dirty, locked, onLoadPreset, refresh, selectedPreset],
  );

  const onImportPreset = useCallback(async () => {
    try {
      const ok = await resolveDirtyBeforeSwitch(null);
      if (!ok) return;
      const path = await open({
        multiple: false,
        filters: [{ name: t("clicker.fileFilter"), extensions: ["json"] }],
      });
      if (!path || Array.isArray(path)) return;
      const preset = await invoke<{
        name: string;
        config: ClickerConfigPayload;
      }>("import_clicker_preset_path", { path });
      await onLoadPreset(preset.name, { skipDirtyGuard: true });
    } catch (e) {
      console.error(e);
    }
  }, [onLoadPreset, resolveDirtyBeforeSwitch, t]);

  const onExportPreset = useCallback(async () => {
    if (!selectedPreset) return;
    try {
      if (dirty && !locked) {
        await invoke("save_clicker_preset", {
          name: selectedPreset,
          config: buildConfig(),
        });
        baselineKeyRef.current = JSON.stringify(buildConfig());
        setDirty(false);
        clearHistory();
      }
      const path = await save({
        filters: [{ name: t("clicker.fileFilter"), extensions: ["json"] }],
        defaultPath: `${selectedPreset.replace(/\s+/g, "-").toLowerCase()}.json`,
      });
      if (!path) return;
      await invoke("export_clicker_preset_path", {
        name: selectedPreset,
        path,
      });
    } catch (e) {
      console.error(e);
    }
  }, [buildConfig, clearHistory, dirty, locked, selectedPreset, t]);

  useEffect(() => {
    void (async () => {
      try {
        const s = await loadSettings();
        if (s) {
          setOverlayVisible(s.overlayVisible);
          setAdvancedUi(s.advancedUi);
          setProcessFilter(s.processFilter ?? DEFAULT_PROCESS_FILTER);
          setActiveDisplayId(s.displayId ?? null);
        }
      } catch {
        /* first launch */
      }
      try {
        await onLoadPresetRef.current(presetId, { skipDirtyGuard: true });
      } catch {
        /* ignore */
      }
    })();
    // Charge le preset une seule fois par presetId — évite reload en boucle.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onLoadPresetRef
  }, [loadSettings, presetId]);

  useEffect(() => {
    void invoke<DisplayDto[]>("list_displays")
      .then((list) => {
        setDisplays(list);
      })
      .catch(() => setDisplays([]));
    void invoke<ScreenGeomDto>("get_screen_geom")
      .then(setScreenGeom)
      .catch(() => setScreenGeom(FALLBACK_SCREEN_GEOM));
  }, []);

  // Keep screenGeom in lockstep with the selected display (same source as the dropdown).
  useEffect(() => {
    if (displays.length === 0) return;
    const active =
      displays.find((d) => d.id === activeDisplayId) ??
      displays.find((d) => d.isPrimary) ??
      displays[0];
    if (!active) return;
    if (activeDisplayId == null) setActiveDisplayId(active.id);
    setScreenGeom((prev) => {
      const next = screenGeomFromDisplay(active);
      if (
        prev.x === next.x &&
        prev.y === next.y &&
        prev.width === next.width &&
        prev.height === next.height &&
        prev.scaleFactor === next.scaleFactor
      ) {
        return prev;
      }
      return next;
    });
  }, [displays, activeDisplayId]);

  useEffect(() => {
    setZoneModel((m) => clampZoneModel(m, screenGeom));
  }, [screenGeom]);

  useEffect(() => {
    void (async () => {
      await setZoneOverlayVisible(zoneOverlayVisible);
      if (zoneOverlayVisible) {
        await pushZoneOverlayState(screenGeom, stopZonesFromModel(zoneModel));
      }
    })();
  }, [zoneOverlayVisible, screenGeom, zoneModel]);

  useEffect(() => {
    return () => {
      void setZoneOverlayVisible(false);
    };
  }, []);

  useEffect(() => {
    onDirtyChangeRef.current?.(dirty);
  }, [dirty]);

  useEffect(() => {
    const tick = async () => {
      try {
        const m = await invoke<ClickerMetrics>("get_clicker_metrics");
        setMetrics(m);
        const fg = await invoke<string | null>("get_foreground_exe");
        setForegroundExe(fg);
        const active =
          status.state === "running" || status.state === "paused";
        if (active) {
          setCpsSamples((prev) => {
            const now = Date.now();
            const next = [...prev, { t: now, cps: m.measuredCps }];
            const cutoff = now - 30_000;
            return next.filter((s) => s.t >= cutoff).slice(-60);
          });
        } else if (status.state === "idle") {
          setCpsSamples((prev) => (prev.length === 0 ? prev : []));
        }
      } catch {
        /* ignore */
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 500);
    return () => window.clearInterval(id);
  }, [status]);

  useEffect(() => {
    const key = JSON.stringify(buildConfig());
    const isDirty = key !== baselineKeyRef.current;
    setDirty((prev) => (prev === isDirty ? prev : isDirty));
    if (
      isDirty &&
      pastRef.current.length === 0 &&
      baselineKeyRef.current &&
      !locked
    ) {
      try {
        pastRef.current = [
          JSON.parse(baselineKeyRef.current) as ClickerConfigPayload,
        ];
        futureRef.current = [];
        syncHistFlags();
      } catch {
        /* ignore */
      }
    }
  }, [
    locked,
    buildConfig,
    syncHistFlags,
    cps,
    cpsMin,
    cpsMax,
    rateUnit,
    timingMode,
    intervalMs,
    button,
    mode,
    inputKind,
    keyName,
    keyShift,
    targetFixed,
    targetX,
    targetY,
    clickKind,
    duty,
    dutyMode,
    limitsEnabled,
    limitMode,
    maxClicks,
    maxDurationSec,
    onCompleteMacro,
    pixelCondition,
    randomEnabled,
    randomPct,
    clickZoneOrder,
    zoneModel,
    pointsEnabled,
    points,
    stopWhenComplete,
    presetFilterMode,
    localProcessFilter,
  ]);

  useEffect(() => {
    if (!selectedPreset) return;
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      ) {
        return;
      }
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        undoConfig();
        return;
      }
      if (key === "y" || (key === "z" && e.shiftKey)) {
        e.preventDefault();
        redoConfig();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [redoConfig, selectedPreset, undoConfig]);

  const running = status.state === "running" || status.state === "paused";
  const sessionPaused = status.state === "paused";
  const editDisabled = running || locked;

  const cadenceDisplay =
    timingMode === "rate"
      ? `${cps.toFixed(rateUnit === "perSecond" ? 0 : 1)}`
      : `${Math.round(intervalMs)} ms`;

  return {
    running,
    sessionPaused,
    editDisabled,
    cadenceDisplay,
    cps,
    setCps,
    cpsMin,
    setCpsMin,
    cpsMax,
    setCpsMax,
    rateUnit,
    setRateUnit,
    timingMode,
    setTimingMode,
    intervalMs,
    setIntervalMs,
    button,
    setButton,
    mode,
    setMode,
    inputKind,
    setInputKind,
    keyName,
    setKeyName,
    keyShift,
    setKeyShift,
    metrics,
    foregroundExe,
    targetFixed,
    setTargetFixed,
    targetX,
    setTargetX,
    targetY,
    setTargetY,
    clickKind,
    setClickKind,
    duty,
    setDuty,
    dutyMode,
    setDutyMode,
    limitsEnabled,
    setLimitsEnabled,
    limitMode,
    setLimitMode,
    maxClicks,
    setMaxClicks,
    maxDurationSec,
    setMaxDurationSec,
    onCompleteMacro,
    setOnCompleteMacro,
    pixelCondition,
    setPixelCondition,
    cpsSamples,
    randomEnabled,
    setRandomEnabled,
    randomPct,
    setRandomPct,
    clickZoneOrder,
    setClickZoneOrder,
    zoneModel,
    setZoneModel,
    zoneSelection,
    setZoneSelection,
    zoneOverlayVisible,
    setZoneOverlayVisible: setZoneOverlayVisibleState,
    screenGeom,
    displays,
    activeDisplayId,
    pointsEnabled,
    setPointsEnabled,
    points,
    setPoints,
    stopWhenComplete,
    setStopWhenComplete,
    picking,
    pickingPointIndex,
    capturingPoints,
    capturedCount,
    onTogglePointCapture,
    processFilter,
    presetFilterMode,
    setPresetFilterMode,
    localProcessFilter,
    setLocalProcessFilter,
    drawing,
    presetName,
    setPresetName,
    selectedPreset,
    trigger,
    setTrigger,
    dirty,
    locked,
    canUndo,
    canRedo,
    buildConfig,
    applyConfig,
    applyTemplate,
    undoConfig,
    redoConfig,
    discardChanges,
    persistUi,
    onSelectDisplay,
    onStart,
    onStop,
    onPause,
    onResume,
    onPick,
    onPickPoint,
    onDrawZone,
    addCustomZone,
    updateCustomZone,
    removeCustomZone,
    duplicateCustomZone,
    moveCustomZoneOrder,
    onSavePreset,
    onSaveAsNewPreset,
    onLoadPreset,
    onRenamePreset,
    onImportPreset,
    onExportPreset,
  };
}

export type ClickerEditor = ReturnType<typeof useClickerEditor>;
