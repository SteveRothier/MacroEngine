/**
 * Legacy: convert React Flow graph back to MacroDocument.actions.
 * Unused by the sequence MacroEditorView shell.
 */
import type { MacroAction, MacroDocument } from "../types";
import { newActionId } from "../types";
import type { MacroGraph, MacroGraphNode } from "./macroToGraph";

type OutEdge = { target: string; handle?: string };

function getOutEdges(
  map: Map<string, OutEdge[]>,
  id: string,
): OutEdge[] {
  return map.get(id) ?? [];
}

function collectLinearChain(
  startId: string,
  nodeMap: Map<string, MacroGraphNode>,
  outEdges: Map<string, OutEdge[]>,
  visited: Set<string>,
): MacroAction[] {
  const actions: MacroAction[] = [];
  let cur: string | null = startId;
  while (cur && !visited.has(cur)) {
    visited.add(cur);
    const node = nodeMap.get(cur);
    if (!node) break;
    if (node.kind === "trigger") {
      const outs = getOutEdges(outEdges, cur);
      cur = outs[0]?.target ?? null;
      continue;
    }
    if (node.kind === "action" && node.action) {
      actions.push(node.action);
      cur = getOutEdges(outEdges, cur).find((e) => !e.handle)?.target ?? null;
      continue;
    }
    if (node.kind === "if" && node.action?.type === "control.if") {
      const thenStart = getOutEdges(outEdges, cur).find((e) => e.handle === "then")?.target;
      const elseStart = getOutEdges(outEdges, cur).find((e) => e.handle === "else")?.target;
      const then = thenStart
        ? collectLinearChain(thenStart, nodeMap, outEdges, visited)
        : [];
      const elseBranch = elseStart
        ? collectLinearChain(elseStart, nodeMap, outEdges, visited)
        : [];
      actions.push({
        ...node.action,
        then,
        else: elseBranch.length ? elseBranch : undefined,
      });
      cur = getOutEdges(outEdges, cur).find((e) => !e.handle)?.target ?? null;
      continue;
    }
    if (node.kind === "while" && node.action?.type === "control.while") {
      const bodyStart = getOutEdges(outEdges, cur).find((e) => e.handle === "body")?.target;
      const body = bodyStart
        ? collectLinearChain(bodyStart, nodeMap, outEdges, visited)
        : [];
      actions.push({ ...node.action, body });
      cur = getOutEdges(outEdges, cur).find((e) => !e.handle)?.target ?? null;
      continue;
    }
    break;
  }
  return actions;
}

export function graphToMacro(
  graph: MacroGraph,
  base: MacroDocument,
): MacroDocument {
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  const outEdges = new Map<string, OutEdge[]>();
  for (const e of graph.edges) {
    const list = outEdges.get(e.source) ?? [];
    list.push({ target: e.target, handle: e.sourceHandle });
    outEdges.set(e.source, list);
  }
  const triggerNode = graph.nodes.find((n) => n.kind === "trigger");
  const trigger = triggerNode?.trigger ?? base.trigger;
  const start = (outEdges.get("__trigger__") ?? outEdges.get(triggerNode?.id ?? "") ?? [])[0]
    ?.target;
  const visited = new Set<string>();
  const actions = start
    ? collectLinearChain(start, nodeMap, outEdges, visited)
    : base.actions;

  return {
    ...base,
    trigger,
    actions,
  };
}

export function ensureGraphIds(graph: MacroGraph): MacroGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((n) => {
      if (n.kind === "trigger") return n;
      if (n.action?.id) return n;
      const id = newActionId();
      return {
        ...n,
        id,
        actionId: id,
        action: n.action
          ? ({ ...n.action, id } as MacroAction)
          : ({ id, type: "delay", ms: 100 } as MacroAction),
      };
    }),
  };
}
