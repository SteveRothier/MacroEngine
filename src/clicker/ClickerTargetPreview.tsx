import { useState } from "react";
import { Switch } from "../ui";
import {
  ContextMenu,
  Select,
  useContextMenuState,
  type MenuItemDef,
} from "../ui/shell";
import { useT } from "../i18n";
import { TargetMap, type TargetMode } from "./TargetMap";
import type { ClickerEditor } from "./useClickerEditor";

type Props = { editor: ClickerEditor };

type CtxKind =
  | { kind: "point"; index: number }
  | { kind: "canvas"; x: number; y: number };

function targetMode(e: ClickerEditor): TargetMode {
  if (e.pointsEnabled || e.capturingPoints) return "sequence";
  if (e.targetFixed) return "fixed";
  return "cursor";
}

export function ClickerTargetPreview({ editor: e }: Props) {
  const t = useT();
  const mode = targetMode(e);
  const ctxMenu = useContextMenuState();
  const [ctx, setCtx] = useState<CtxKind | null>(null);

  const displayValue =
    e.activeDisplayId ?? e.displays.find((d) => d.isPrimary)?.id ?? "";

  const previewPoints = e.capturingPoints
    ? [...e.points, ...e.liveCapturePoints]
    : mode === "sequence"
      ? e.points
      : [];

  const canEdit = !e.editDisabled && !e.running && !e.capturingPoints;

  const ctxItems: MenuItemDef[] = (() => {
    if (!canEdit || ctx == null) return [];
    if (ctx.kind === "point") {
      return [
        {
          id: "delete",
          label: t("clicker.target.removePoint"),
          danger: true,
        },
      ];
    }
    const items: MenuItemDef[] = [
      { id: "addPoint", label: t("clicker.target.addPointHere") },
      { id: "capture", label: t("clicker.target.captureStart") },
      {
        id: "toggleOverlay",
        label: e.targetOverlayVisible
          ? t("clicker.target.hideOverlay")
          : t("clicker.target.showOverlay"),
      },
    ];
    if (e.points.length > 0) {
      items.push({
        id: "clearAll",
        label: t("clicker.target.clearAllPoints"),
        danger: true,
      });
    }
    return items;
  })();

  const removePointAt = (index: number) => {
    e.setPoints((prev) => prev.filter((_, j) => j !== index));
    e.setSelectedPointIndex((cur) =>
      cur == null
        ? null
        : cur === index
          ? null
          : cur > index
            ? cur - 1
            : cur,
    );
  };

  const addPointAt = (x: number, y: number) => {
    const nextIndex = e.points.length;
    e.setPointsEnabled(true);
    e.setPoints((prev) => [...prev, { x, y, clicks: 1, radius: 0, pauseAfterMs: 0 }]);
    e.setSelectedPointIndex(nextIndex);
  };

  return (
    <div className="caster-clicker-zone-stage">
      <div className="caster-clicker-zone-toolbar caster-clicker-zone-toolbar--full">
        {e.displays.length > 0 ? (
          <Select
            className="caster-clicker-zone-select"
            value={displayValue}
            disabled={e.editDisabled || e.capturingPoints}
            ariaLabel={t("clicker.zones.displayAria")}
            options={e.displays.map((d) => ({
              value: d.id,
              label: `${d.label}${d.isPrimary ? t("clicker.zones.primarySuffix") : ""}`,
            }))}
            onChange={(v) => void e.onSelectDisplay(v)}
          />
        ) : (
          <span className="caster-clicker-hint-inline">
            {e.screenGeom.width}×{e.screenGeom.height}
          </span>
        )}
        <Switch
          checked={e.targetOverlayVisible || e.capturingPoints}
          disabled={e.editDisabled || e.capturingPoints}
          label={t("clicker.target.overlay")}
          onChange={e.setTargetOverlayVisible}
        />
      </div>
      {e.capturingPoints ? (
        <p className="caster-clicker-hint caster-clicker-zone-draw-hint">
          {t("clicker.target.captureScreenHint", { n: e.capturedCount })}
        </p>
      ) : mode !== "cursor" && !e.editDisabled ? (
        <p className="caster-clicker-hint caster-clicker-zone-draw-hint">
          {mode === "fixed"
            ? t("clicker.target.previewFixedHint")
            : t("clicker.target.previewSequenceHint")}
        </p>
      ) : null}
      <TargetMap
        geom={e.screenGeom}
        mode={mode}
        fixed={mode === "fixed" ? { x: e.targetX, y: e.targetY } : null}
        points={previewPoints}
        selectedIndex={e.selectedPointIndex}
        editable={canEdit}
        onPlaceFixed={(x, y) => {
          e.setTargetX(x);
          e.setTargetY(y);
        }}
        onMovePoint={(index, x, y) => {
          e.setPoints((prev) =>
            prev.map((p, i) => (i === index ? { ...p, x, y } : p)),
          );
        }}
        onSelectPoint={(index) => e.setSelectedPointIndex(index)}
        onPointContextMenu={(index, x, y) => {
          setCtx({ kind: "point", index });
          ctxMenu.openAt(x, y);
        }}
        onCanvasContextMenu={(screen, x, y) => {
          setCtx({ kind: "canvas", x: screen.x, y: screen.y });
          ctxMenu.openAt(x, y);
        }}
      />
      <ContextMenu
        open={ctxMenu.open}
        x={ctxMenu.x}
        y={ctxMenu.y}
        items={ctxItems}
        onClose={() => {
          ctxMenu.close();
          setCtx(null);
        }}
        onSelect={(id) => {
          const current = ctx;
          setCtx(null);
          if (!current) return;
          if (current.kind === "point") {
            if (id === "delete") removePointAt(current.index);
            return;
          }
          switch (id) {
            case "addPoint":
              addPointAt(current.x, current.y);
              break;
            case "capture":
              void e.onTogglePointCapture();
              break;
            case "toggleOverlay":
              e.setTargetOverlayVisible(!e.targetOverlayVisible);
              break;
            case "clearAll":
              e.setPoints([]);
              e.setSelectedPointIndex(null);
              break;
            default:
              break;
          }
        }}
        ariaLabel={t("clicker.target.contextAria")}
      />
    </div>
  );
}
