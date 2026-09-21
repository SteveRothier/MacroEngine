import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useT } from "../i18n";
import {
  FALLBACK_SCREEN_GEOM,
  type ScreenGeomDto,
  type StopZone,
} from "./clickerTypes";
import { ZoneMap } from "./ZoneMap";
import {
  clientToScreen,
  modelFromStopZones,
  normalizeRect,
} from "./zoneGeom";

type OverlaySnap = {
  visible: boolean;
  drawing: boolean;
  geom: ScreenGeomDto;
  zones: StopZone[];
};

type Draft = { x: number; y: number; width: number; height: number };

function applySnap(
  snap: OverlaySnap,
  setGeom: (g: ScreenGeomDto) => void,
  setZones: (z: StopZone[]) => void,
  setDrawing: (d: boolean) => void,
) {
  setGeom(snap.geom);
  setZones(snap.zones);
  setDrawing(snap.drawing);
  const el = document.documentElement;
  el.style.opacity = "0.999";
  requestAnimationFrame(() => {
    el.style.opacity = "1";
  });
}

type ZonesHost = Window & {
  __macroZonesApply?: (snap: OverlaySnap) => void;
};

export function ZoneOverlayView() {
  const t = useT();
  const rootRef = useRef<HTMLDivElement>(null);
  const [geom, setGeom] = useState<ScreenGeomDto>(FALLBACK_SCREEN_GEOM);
  const [zones, setZones] = useState<StopZone[]>([]);
  const [drawing, setDrawing] = useState(false);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const finishing = useRef(false);

  useEffect(() => {
    document.documentElement.dataset.window = "zones";
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    const root = document.getElementById("root");
    if (root) root.style.background = "transparent";
    void getCurrentWebviewWindow().setBackgroundColor([0, 0, 0, 0]);
    return () => {
      delete document.documentElement.dataset.window;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const unlistens: UnlistenFn[] = [];
    const win = getCurrentWebviewWindow();
    const host = window as ZonesHost;

    const lastJson = { current: "" };
    const onState = (snap: OverlaySnap) => {
      if (cancelled) return;
      const json = JSON.stringify(snap);
      if (json === lastJson.current) return;
      lastJson.current = json;
      applySnap(snap, setGeom, setZones, setDrawing);
    };

    host.__macroZonesApply = onState;

    void (async () => {
      try {
        const snap = await invoke<OverlaySnap>("get_zone_overlay_snapshot");
        onState(snap);
      } catch {
        /* first paint */
      }
      if (cancelled) return;
      try {
        unlistens.push(
          await listen<OverlaySnap>("zones://state", (e) => onState(e.payload)),
        );
        unlistens.push(
          await win.listen<OverlaySnap>("zones://state", (e) => onState(e.payload)),
        );
        unlistens.push(
          await listen("zones://draw-begin", () => {
            if (cancelled) return;
            finishing.current = false;
            setDrawing(true);
            origin.current = null;
            setDraft(null);
          }),
        );
        unlistens.push(
          await win.listen("zones://draw-begin", () => {
            if (cancelled) return;
            finishing.current = false;
            setDrawing(true);
            origin.current = null;
            setDraft(null);
          }),
        );
      } catch {
        /* overlay listeners */
      }
      if (cancelled) {
        unlistens.forEach((u) => u());
        return;
      }
      try {
        const snap = await invoke<OverlaySnap>("get_zone_overlay_snapshot");
        onState(snap);
      } catch {
        /* keep last */
      }
    })();

    const poll = window.setInterval(() => {
      void invoke<OverlaySnap>("get_zone_overlay_snapshot")
        .then((snap) => {
          if (!snap.visible && !snap.drawing) return;
          onState(snap);
        })
        .catch(() => {});
    }, 150);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      if (host.__macroZonesApply === onState) {
        delete host.__macroZonesApply;
      }
      unlistens.forEach((u) => u());
    };
  }, []);

  useEffect(() => {
    if (!drawing) return;
    rootRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        finish(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // finish is stable enough for this overlay session
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawing]);

  function pointFromEvent(e: ReactMouseEvent | MouseEvent) {
    const el = rootRef.current;
    if (!el) return { x: 0, y: 0 };
    return clientToScreen(e.clientX, e.clientY, el.getBoundingClientRect(), geom);
  }

  function finish(rect: Draft | null) {
    if (finishing.current) return;
    finishing.current = true;
    origin.current = null;
    setDraft(null);
    setDrawing(false);
    void invoke("complete_zone_overlay_draw", { rect });
  }

  return (
    <div
      ref={rootRef}
      className={["zone-overlay", drawing ? "drawing" : ""].join(" ")}
      onMouseDown={(e) => {
        if (!drawing || e.button !== 0) return;
        e.preventDefault();
        origin.current = pointFromEvent(e);
        setDraft({
          x: origin.current.x,
          y: origin.current.y,
          width: 1,
          height: 1,
        });
      }}
      onMouseMove={(e) => {
        if (!drawing || !origin.current) return;
        const p = pointFromEvent(e);
        setDraft(normalizeRect(origin.current.x, origin.current.y, p.x, p.y));
      }}
      onMouseUp={(e) => {
        if (!drawing || e.button !== 0) return;
        if (!origin.current) return;
        const p = pointFromEvent(e);
        const rect = normalizeRect(origin.current.x, origin.current.y, p.x, p.y);
        if (rect.width < 4 || rect.height < 4) {
          finish(null);
          return;
        }
        finish(rect);
      }}
      onContextMenu={(e) => {
        if (!drawing) return;
        e.preventDefault();
        finish(null);
      }}
      onKeyDown={(e) => {
        if (drawing && e.key === "Escape") {
          e.preventDefault();
          finish(null);
        }
      }}
      tabIndex={drawing ? 0 : -1}
    >
      <ZoneMap
        geom={geom}
        model={modelFromStopZones(zones)}
        variant="overlay"
        draftRect={draft}
      />
      {drawing ? (
        <div className="zone-overlay-banner">
          <strong>{t("clicker.zones.overlayBannerTitle")}</strong>
          <span>{t("clicker.zones.overlayBannerHint")}</span>
        </div>
      ) : null}
    </div>
  );
}
