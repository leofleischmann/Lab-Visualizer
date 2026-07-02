import { useCallback, useMemo } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type OnSelectionChangeParams,
} from '@xyflow/react';
import type { FlowEdge, FlowNode } from '../../api/types';
import { categoryOf } from '../../lib/catalog';
import { useGraphStore } from '../../store/graph';
import { InfraEdge } from './InfraEdge';
import { InfraNode } from './InfraNode';
import { ZoneNode } from './ZoneNode';

const nodeTypes = { infra: InfraNode, zone: ZoneNode };
const edgeTypes = { infra: InfraEdge };

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

  const { screenToFlowPosition } = useReactFlow();

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
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={connect}
      onSelectionChange={handleSelectionChange}
      onBeforeDelete={handleBeforeDelete}
      onNodesDelete={handleNodesDelete}
      onEdgesDelete={handleEdgesDelete}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      defaultEdgeOptions={{ type: 'infra' }}
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
    </ReactFlow>
  );
}
