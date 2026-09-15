/**
 * Legacy React Flow projection of MacroDocument.actions.
 * Not mounted by MacroEditorView (sequence is the primary editor).
 */
import { useCallback, useEffect, useMemo } from "react";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { MacroGraphNode } from "./macroToGraph";

function MacroFlowNode({ data, selected }: NodeProps) {
  const d = data as MacroGraphNode & { onSelect?: () => void };
  const color =
    d.kind === "trigger"
      ? "var(--caster-node-trigger)"
      : d.kind === "if" || d.kind === "while"
        ? "var(--caster-node-logic)"
        : d.kind === "action" && d.action?.type === "delay"
          ? "var(--caster-node-delay)"
          : "var(--caster-node-action)";

  return (
    <div
      className={["macro-node", selected ? "selected" : ""].join(" ")}
      style={{ borderLeftColor: color, borderLeftWidth: 3 }}
    >
      <Handle type="target" position={Position.Top} />
      <div className="macro-node-kind">{d.kind}</div>
      <div className="macro-node-title">{d.label}</div>
      {d.subtitle ? <div className="macro-node-sub">{d.subtitle}</div> : null}
      {d.kind === "if" ? (
        <>
          <Handle type="source" position={Position.Left} id="then" />
          <Handle type="source" position={Position.Right} id="else" />
        </>
      ) : d.kind === "while" ? (
        <Handle type="source" position={Position.Bottom} id="body" />
      ) : (
        <Handle type="source" position={Position.Bottom} />
      )}
    </div>
  );
}

const nodeTypes = { macro: MacroFlowNode };

type Props = {
  graphNodes: MacroGraphNode[];
  graphEdges: { id: string; source: string; target: string; sourceHandle?: string }[];
  selectedNodeId?: string | null;
  onSelectNode: (id: string | null) => void;
  onGraphChange?: (
    nodes: MacroGraphNode[],
    edges: { id: string; source: string; target: string; sourceHandle?: string }[],
  ) => void;
  readOnly?: boolean;
  highlightedNodeIds?: Set<string>;
};

export function MacroCanvas({
  graphNodes,
  graphEdges,
  selectedNodeId,
  onSelectNode,
  onGraphChange,
  readOnly,
  highlightedNodeIds,
}: Props) {
  const initialNodes: Node[] = useMemo(
    () =>
      graphNodes.map((n) => ({
        id: n.id,
        type: "macro",
        position: n.position,
        data: n,
        selected: n.id === selectedNodeId,
        className: highlightedNodeIds?.has(n.id) ? "macro-node-highlight" : undefined,
      })),
    [graphNodes, selectedNodeId, highlightedNodeIds],
  );

  const initialEdges: Edge[] = useMemo(
    () =>
      graphEdges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        animated: highlightedNodeIds?.has(e.target),
      })),
    [graphEdges, highlightedNodeIds],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const onNodeClick = useCallback(
    (_: unknown, node: Node) => {
      onSelectNode(node.id === "__trigger__" ? null : node.id);
    },
    [onSelectNode],
  );

  const onPaneClick = useCallback(() => onSelectNode(null), [onSelectNode]);

  const onNodeDragStop = useCallback(() => {
    if (!onGraphChange || readOnly) return;
    const nextNodes: MacroGraphNode[] = nodes.map((n) => ({
      ...(n.data as MacroGraphNode),
      position: n.position,
    }));
    onGraphChange(
      nextNodes,
      edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? undefined,
      })),
    );
  }, [nodes, edges, onGraphChange, readOnly]);

  return (
    <div className="caster-canvas-wrap">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={readOnly ? undefined : onNodesChange}
        onEdgesChange={readOnly ? undefined : onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
        nodesDraggable={!readOnly}
        nodesConnectable={false}
        panOnScroll
      >
        <Background gap={16} size={1} color="var(--caster-border-subtle)" />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={(n) => {
            const k = (n.data as MacroGraphNode).kind;
            if (k === "trigger") return "var(--caster-node-trigger)";
            if (k === "if" || k === "while") return "var(--caster-node-logic)";
            return "var(--caster-node-action)";
          }}
        />
      </ReactFlow>
    </div>
  );
}
