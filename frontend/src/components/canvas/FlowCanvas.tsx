import { useCallback, useMemo, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type NodeChange,
  type OnSelectionChangeParams,
} from '@xyflow/react';
import type { FlowEdge, FlowNode } from '../../api/types';
import { computeAlignment, type AlignmentGuide } from '../../lib/alignment';
import { categoryOf } from '../../lib/catalog';
import { nodeSize } from '../../lib/edge/nodes';
import { absolutePosition, useGraphStore } from '../../store/graph';
import { AlignmentGuides } from './AlignmentGuides';
import { InfraEdge } from './InfraEdge';
import { InfraNode } from './InfraNode';
import { ZoneNode } from './ZoneNode';

const nodeTypes = { infra: InfraNode, zone: ZoneNode };
const edgeTypes = { infra: InfraEdge };

/** IDs des Nodes und aller Nachfahren (bewegen sich beim Drag mit). */
function withDescendants(nodes: FlowNode[], id: string): Set<string> {
  const result = new Set([id]);
  let grown = true;
  while (grown) {
    grown = false;
    for (const node of nodes) {
      if (node.parentId && result.has(node.parentId) && !result.has(node.id)) {
        result.add(node.id);
        grown = true;
      }
    }
  }
  return result;
}

export function FlowCanvas() {
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const catalog = useGraphStore((s) => s.catalog);
  const onNodesChange = useGraphStore((s) => s.onNodesChange);
  const onEdgesChange = useGraphStore((s) => s.onEdgesChange);
  const connect = useGraphStore((s) => s.connect);
  const syncSelection = useGraphStore((s) => s.syncSelection);
  const removeNode = useGraphStore((s) => s.removeNode);
  const removeEdge = useGraphStore((s) => s.removeEdge);
  const createNode = useGraphStore((s) => s.createNode);

  const { screenToFlowPosition, getViewport } = useReactFlow();
  const [guides, setGuides] = useState<AlignmentGuide[]>([]);

  /** Node-Drag: an Kanten/Zentren anderer Nodes ausrichten (Hilfslinien). */
  const handleNodesChange = useCallback(
    (changes: NodeChange<FlowNode>[]) => {
      const dragChanges = changes.filter(
        (c) => c.type === 'position' && c.dragging && c.position
      );
      const dragEnded = changes.some((c) => c.type === 'position' && c.dragging === false);

      if (dragChanges.length === 1) {
        const change = dragChanges[0] as Extract<NodeChange<FlowNode>, { type: 'position' }>;
        const node = nodes.find((n) => n.id === change.id);
        if (node && change.position) {
          const parentOffset = node.parentId
            ? absolutePosition(nodes, node.parentId)
            : { x: 0, y: 0 };
          const { width, height } = nodeSize(node);
          const rect = {
            x: parentOffset.x + change.position.x,
            y: parentOffset.y + change.position.y,
            width,
            height,
          };
          const moving = withDescendants(nodes, node.id);
          const others = nodes
            .filter((n) => !moving.has(n.id))
            .map((n) => {
              const abs = absolutePosition(nodes, n.id);
              const size = nodeSize(n);
              return { x: abs.x, y: abs.y, width: size.width, height: size.height };
            });
          const zoom = Math.max(0.05, getViewport().zoom);
          const threshold = Math.min(20, Math.max(2, 7 / zoom));
          const alignment = computeAlignment(rect, others, threshold);
          change.position = {
            x: change.position.x + alignment.dx,
            y: change.position.y + alignment.dy,
          };
          setGuides(alignment.guides);
        }
      } else if (dragEnded || dragChanges.length > 1) {
        setGuides([]);
      }

      onNodesChange(changes);
    },
    [getViewport, nodes, onNodesChange]
  );

  const handleSelectionChange = useCallback(
    ({ nodes: selectedNodes, edges: selectedEdges }: OnSelectionChangeParams) => {
      if (selectedNodes.length) {
        syncSelection({ kind: 'node', id: selectedNodes[selectedNodes.length - 1].id });
      } else if (selectedEdges.length) {
        syncSelection({ kind: 'edge', id: selectedEdges[0].id });
      } else {
        syncSelection(null);
      }
    },
    [syncSelection]
  );

  const handleBeforeDelete = useCallback(
    async ({ nodes: toDeleteNodes, edges: toDeleteEdges }: { nodes: FlowNode[]; edges: FlowEdge[] }) => {
      if (toDeleteNodes.length) {
        return window.confirm(
          `${toDeleteNodes.length} Node(s) inkl. aller verbundenen Kanten löschen?`
        );
      }
      if (toDeleteEdges.length) {
        return window.confirm(`${toDeleteEdges.length} Verbindung(en) löschen?`);
      }
      return true;
    },
    []
  );

  const handleNodesDelete = useCallback(
    (deleted: FlowNode[]) => {
      for (const node of deleted) void removeNode(node.id);
    },
    [removeNode]
  );

  const handleEdgesDelete = useCallback(
    (deleted: FlowEdge[]) => {
      for (const edge of deleted) void removeEdge(edge.id);
    },
    [removeEdge]
  );

  const handleDragOver = useCallback((event: React.DragEvent) => {
    if (event.dataTransfer.types.includes('application/labviz-category')) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      const categoryId = event.dataTransfer.getData('application/labviz-category');
      if (!categoryId) return;
      event.preventDefault();
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const category = categoryOf(catalog, categoryId);
      void createNode({
        name: `Neu: ${category.label}`,
        category: categoryId,
        position,
        ...(categoryId === 'group' ? { width: 420, height: 260 } : {}),
      });
    },
    [screenToFlowPosition, catalog, createNode]
  );

  const miniMapNodeColor = useMemo(
    () => (node: FlowNode) =>
      node.type === 'zone' ? '#1e293b' : categoryOf(catalog, node.data.entity.category).color,
    [catalog]
  );

  return (
    <ReactFlow<FlowNode, FlowEdge>
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={handleNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={connect}
      onSelectionChange={handleSelectionChange}
      onBeforeDelete={handleBeforeDelete}
      onNodesDelete={handleNodesDelete}
      onEdgesDelete={handleEdgesDelete}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      defaultEdgeOptions={{ type: 'infra' }}
      connectionMode={ConnectionMode.Loose}
      connectionLineType={ConnectionLineType.SmoothStep}
      connectionLineStyle={{ stroke: '#38bdf8', strokeWidth: 1.5 }}
      connectionRadius={36}
      deleteKeyCode={['Delete']}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      minZoom={0.08}
      maxZoom={2.5}
      snapToGrid
      snapGrid={[10, 10]}
      colorMode="dark"
      className="bg-slate-950"
    >
      <Background variant={BackgroundVariant.Dots} gap={26} size={1.4} color="#1e293b" />
      <Controls position="bottom-left" />
      <MiniMap
        position="bottom-right"
        pannable
        zoomable
        nodeColor={miniMapNodeColor}
        maskColor="rgba(2, 6, 23, 0.75)"
        bgColor="#0f172a"
      />
      <AlignmentGuides guides={guides} />
    </ReactFlow>
  );
}
