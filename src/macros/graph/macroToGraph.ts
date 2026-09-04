/**
 * Legacy graph projection helpers (UI layout only).
 * MacroEditorView no longer mounts MacroCanvas; kept for optional future use / uiLayout round-trip.
 */
import type { MacroAction, MacroDocument, MacroTrigger } from "../types";
import { actionDetailFr, actionTitleFr } from "../actionLabels";
import { triggerHotkeyLabel } from "../types";

export type MacroNodeKind = "trigger" | "action" | "if" | "while";

export type MacroGraphNode = {
  id: string;
  kind: MacroNodeKind;
  position: { x: number; y: number };
  actionId?: string;
  action?: MacroAction;
  trigger?: MacroTrigger;
  label: string;
  subtitle?: string;
};

export type MacroGraphEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
};

export type MacroGraph = {
  nodes: MacroGraphNode[];
  edges: MacroGraphEdge[];
};

export type MacroUiLayout = {
  nodes: Record<string, { x: number; y: number }>;
};

const X_GAP = 0;
const Y_GAP = 120;
const BRANCH_X = 220;

function triggerLabel(t: MacroTrigger): string {
  if (t.type === "manual") return "Manuel";
  return triggerHotkeyLabel(t);
}

function layoutPos(id: string, layout: MacroUiLayout | undefined, x: number, y: number) {
  return layout?.nodes[id] ?? { x, y };
}

function chainActions(
  actions: MacroAction[],
  startId: string | null,
  x: number,
  y: number,
  nodes: MacroGraphNode[],
  edges: MacroGraphEdge[],
  layout: MacroUiLayout | undefined,
): { lastId: string | null; nextY: number } {
  let prev = startId;
  let cy = y;
  for (const action of actions) {
    if (action.type === "control.if") {
      const nid = action.id;
      nodes.push({
        id: nid,
        kind: "if",
        position: layoutPos(nid, layout, x, cy),
        actionId: action.id,
        action,
        label: "Si / sinon",
        subtitle: actionDetailFr(action),
      });
      if (prev) {
        edges.push({
          id: `${prev}->${nid}`,
          source: prev,
          target: nid,
        });
      }
      cy += Y_GAP;
      const thenEnd = chainActions(
        action.then ?? [],
        null,
        x - BRANCH_X,
        cy,
        nodes,
        edges,
        layout,
      );
      if (thenEnd.lastId) {
        edges.push({
          id: `${nid}->then-${action.id}`,
          source: nid,
          target: action.then![0]?.id ?? thenEnd.lastId,
          sourceHandle: "then",
        });
      }
      const elseEnd = chainActions(
        action.else ?? [],
        null,
        x + BRANCH_X,
        cy,
        nodes,
        edges,
        layout,
      );
      if (elseEnd.lastId && (action.else?.length ?? 0) > 0) {
        edges.push({
          id: `${nid}->else-${action.id}`,
          source: nid,
          target: action.else![0].id,
          sourceHandle: "else",
        });
      }
      prev = nid;
      cy = Math.max(thenEnd.nextY, elseEnd.nextY);
      continue;
    }
    if (action.type === "control.while") {
      const nid = action.id;
      nodes.push({
        id: nid,
        kind: "while",
        position: layoutPos(nid, layout, x, cy),
        actionId: action.id,
        action,
        label: "Tant que",
        subtitle: actionDetailFr(action),
      });
      if (prev) {
        edges.push({ id: `${prev}->${nid}`, source: prev, target: nid });
      }
      cy += Y_GAP;
      const bodyEnd = chainActions(
        action.body ?? [],
        null,
        x,
        cy,
        nodes,
        edges,
        layout,
      );
      if (bodyEnd.lastId) {
        edges.push({
          id: `${nid}->body-${action.id}`,
          source: nid,
          target: action.body![0]?.id ?? bodyEnd.lastId,
          sourceHandle: "body",
        });
      }
      prev = nid;
      cy = bodyEnd.nextY;
      continue;
    }
    const nid = action.id;
    nodes.push({
      id: nid,
      kind: "action",
      position: layoutPos(nid, layout, x, cy),
      actionId: action.id,
      action,
      label: actionTitleFr(action.type),
      subtitle: actionDetailFr(action),
    });
    if (prev) {
      edges.push({ id: `${prev}->${nid}`, source: prev, target: nid });
    }
    prev = nid;
    cy += Y_GAP;
  }
  return { lastId: prev, nextY: cy };
}

export function macroToGraph(
  doc: MacroDocument,
  layout?: MacroUiLayout,
): MacroGraph {
  const nodes: MacroGraphNode[] = [];
  const edges: MacroGraphEdge[] = [];
  const triggerId = "__trigger__";
  nodes.push({
    id: triggerId,
    kind: "trigger",
    position: layoutPos(triggerId, layout, X_GAP, 0),
    trigger: doc.trigger,
    label: "Trigger",
    subtitle: triggerLabel(doc.trigger),
  });
  chainActions(doc.actions, triggerId, X_GAP, Y_GAP, nodes, edges, layout);
  return { nodes, edges };
}

export function extractUiLayout(graph: MacroGraph): MacroUiLayout {
  const nodes: Record<string, { x: number; y: number }> = {};
  for (const n of graph.nodes) {
    nodes[n.id] = { ...n.position };
  }
  return { nodes };
}

export function applyUiLayout(
  doc: MacroDocument,
  layout: MacroUiLayout,
): MacroDocument & { uiLayout?: MacroUiLayout } {
  return { ...doc, uiLayout: layout };
}
