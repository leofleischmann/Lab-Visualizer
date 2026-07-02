import type { Node, Edge } from '@xyflow/react';

export type Position = { x: number; y: number };

export type ApiNode = {
  id: string;
  name: string;
  category: string;
  status: string;
  parentId: string | null;
  position: Position;
  width: number | null;
  height: number | null;
  ip: string | null;
  vlan: string | null;
  os: string | null;
  hostname: string | null;
  url: string | null;
  notes: string;
  customFields: Record<string, string>;
  createdAt: string;
  updatedAt: string;
};

export type LineStyle = 'solid' | 'dashed' | 'dotted';

export type FlowPoint = { x: number; y: number };

/** Manuelles Kanten-Routing (BPMN-ähnlich). Beeinflusst: InfraEdge, edgeRoutingState.ts */
export type EdgeRouting = {
  mode: 'auto' | 'manual';
  waypoints: FlowPoint[];
  label?: FlowPoint | null;
};

export type ApiEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  label: string;
  kind: string;
  lineStyle: LineStyle;
  animated: boolean;
  notes: string;
  routing: EdgeRouting;
  customFields: Record<string, string>;
  createdAt: string;
  updatedAt: string;
};

export type NodePatch = Partial<
  Omit<ApiNode, 'id' | 'createdAt' | 'updatedAt'>
>;

export type EdgePatch = Partial<
  Omit<ApiEdge, 'id' | 'createdAt' | 'updatedAt'>
>;

export type Category = {
  id: string;
  label: string;
  group: string;
  color: string;
  icon: string;
};

export type Status = { id: string; label: string; color: string };
export type EdgeKind = { id: string; label: string; color: string };

export type Catalog = {
  categories: Category[];
  statuses: Status[];
  edgeKinds: EdgeKind[];
  lineStyles: LineStyle[];
};

export type GraphPayload = { nodes: ApiNode[]; edges: ApiEdge[] };

export type FlowNode = Node<{ entity: ApiNode }>;
export type FlowEdge = Edge<{ entity: ApiEdge }>;
