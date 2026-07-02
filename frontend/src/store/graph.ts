import { create } from 'zustand';
import {
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react';
import { api } from '../api/client';
import type {
  ApiEdge,
  ApiNode,
  Catalog,
  EdgePatch,
  FlowEdge,
  FlowNode,
  NodePatch,
  Position,
} from '../api/types';
export type Selection = { kind: 'node' | 'edge'; id: string } | null;

function toFlowNode(n: ApiNode): FlowNode {
  const isZone = n.category === 'group';
  return {
    id: n.id,
    type: isZone ? 'zone' : 'infra',
    position: { ...n.position },
    parentId: n.parentId ?? undefined,
    width: isZone ? (n.width ?? 420) : undefined,
    height: isZone ? (n.height ?? 260) : undefined,
    data: { entity: n },
  };
}

function toFlowEdge(e: ApiEdge): FlowEdge {
  return {
    id: e.id,
    source: e.sourceId,
    target: e.targetId,
    type: 'infra',
    data: { entity: e },
  };
}

/**
 * Zonen (Gruppen) müssen vor allen anderen Nodes gerendert werden, damit sie
 * optisch hinter ihren Kindern liegen. Die API liefert Parents bereits vor
 * ihren Kindern; diese relative Ordnung bleibt hier erhalten.
 */
function orderForFlow(nodes: FlowNode[]): FlowNode[] {
  return [...nodes.filter((n) => n.type === 'zone'), ...nodes.filter((n) => n.type !== 'zone')];
}

/** Absolute Canvas-Position eines Nodes (Positionen von Kindern sind relativ zum Parent). */
export function absolutePosition(nodes: FlowNode[], id: string): Position {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let x = 0;
  let y = 0;
  let current = byId.get(id);
  let guard = 0;
  while (current && guard++ < 100) {
    x += current.position.x;
    y += current.position.y;
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return { x, y };
}

type GraphStore = {
  nodes: FlowNode[];
  edges: FlowEdge[];
  catalog: Catalog | null;
  selection: Selection;
  search: string;
  loading: boolean;
  error: string | null;

  load: () => Promise<void>;
  reload: () => Promise<void>;
  setSearch: (term: string) => void;
  setError: (message: string | null) => void;
  select: (selection: Selection) => void;
  syncSelection: (selection: Selection) => void;

  onNodesChange: (changes: NodeChange<FlowNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<FlowEdge>[]) => void;
  persistPositions: (ids: string[]) => Promise<void>;
  applyZoneGeometry: (
    id: string,
    geometry: { x: number; y: number; width: number; height: number }
  ) => Promise<void>;

  createNode: (data: NodePatch & { name: string }) => Promise<ApiNode | null>;
  saveNode: (id: string, patch: NodePatch) => Promise<boolean>;
  removeNode: (id: string) => Promise<void>;

  connect: (connection: Connection) => Promise<void>;
  saveEdge: (id: string, patch: EdgePatch) => Promise<boolean>;
  removeEdge: (id: string) => Promise<void>;

  importGraph: (payload: { nodes: ApiNode[]; edges: ApiEdge[] }) => Promise<boolean>;
  clearGraph: () => Promise<boolean>;
  autoLayout: () => Promise<boolean>;
};

const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message : 'Unbekannter Fehler';

export const useGraphStore = create<GraphStore>((set, get) => ({
  nodes: [],
  edges: [],
  catalog: null,
  selection: null,
  search: '',
  loading: true,
  error: null,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const [catalog, graph] = await Promise.all([api.catalog(), api.graph()]);
      const flowNodes = orderForFlow(graph.nodes.map(toFlowNode));
      set({
        catalog,
        nodes: flowNodes,
        edges: graph.edges.map(toFlowEdge),
        loading: false,
      });
    } catch (err) {
      set({ loading: false, error: errorMessage(err) });
    }
  },

  reload: async () => {
    try {
      const graph = await api.graph();
      const { selection } = get();
      const stillExists =
        selection &&
        (selection.kind === 'node'
          ? graph.nodes.some((n) => n.id === selection.id)
          : graph.edges.some((e) => e.id === selection.id));
      const flowNodes = orderForFlow(
        graph.nodes.map((n) => {
          const flow = toFlowNode(n);
          flow.selected = selection?.kind === 'node' && selection.id === n.id;
          return flow;
        })
      );
      set({
        nodes: flowNodes,
        edges: graph.edges.map((e) => {
          const flow = toFlowEdge(e);
          flow.selected = selection?.kind === 'edge' && selection.id === e.id;
          return flow;
        }),
        selection: stillExists ? selection : null,
      });
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },

  setSearch: (term) => set({ search: term }),
  setError: (message) => set({ error: message }),

  select: (selection) =>
    set((state) => ({
      selection,
      nodes: state.nodes.map((n) => ({
        ...n,
        selected: selection?.kind === 'node' && n.id === selection.id,
      })),
      edges: state.edges.map((e) => ({
        ...e,
        selected: selection?.kind === 'edge' && e.id === selection.id,
      })),
    })),

  // Von React Flow getriebene Selektion (Klick, Rubber-Band) – ohne Echo zurück in RF.
  syncSelection: (selection) => set({ selection }),

  onNodesChange: (changes) => {
    const nextNodes = applyNodeChanges(changes, get().nodes);
    const movedIds = changes
      .filter((c) => c.type === 'position' && c.dragging === false)
      .map((c) => (c as { id: string }).id);
    set({ nodes: nextNodes });
    if (movedIds.length) void get().persistPositions(movedIds);
  },

  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) });
  },

  persistPositions: async (ids) => {
    const idSet = new Set(ids);
    const moved = get().nodes.filter((n) => idSet.has(n.id));
    if (!moved.length) return;
    set((state) => ({
      nodes: state.nodes.map((n) =>
        idSet.has(n.id)
          ? { ...n, data: { entity: { ...n.data.entity, position: { ...n.position } } } }
          : n
      ),
    }));
    try {
      await api.updatePositions(
        moved.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y }))
      );
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },

  applyZoneGeometry: async (id, { x, y, width, height }) => {
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === id
          ? {
              ...n,
              position: { x, y },
              width,
              height,
              data: {
                entity: { ...n.data.entity, position: { x, y }, width, height },
              },
            }
          : n
      ),
    }));
    try {
      await api.updatePositions([{ id, x, y, width, height }]);
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },

  createNode: async (data) => {
    try {
      const created = await api.createNode(data);
      const flow = toFlowNode(created);
      flow.selected = true;
      set((state) => ({
        nodes: orderForFlow([
          ...state.nodes.map((n) => ({ ...n, selected: false })),
          flow,
        ]),
        edges: state.edges.map((e) => ({ ...e, selected: false })),
        selection: { kind: 'node', id: created.id },
      }));
      return created;
    } catch (err) {
      set({ error: errorMessage(err) });
      return null;
    }
  },

  saveNode: async (id, patch) => {
    const before = get().nodes.find((n) => n.id === id);
    try {
      const updated = await api.updateNode(id, patch);
      const structuralChange =
        patch.parentId !== undefined ||
        (patch.category !== undefined &&
          (patch.category === 'group') !== (before?.data.entity.category === 'group'));
      if (structuralChange) {
        await get().reload();
      } else {
        set((state) => ({
          nodes: state.nodes.map((n) =>
            n.id === id ? { ...toFlowNode(updated), selected: n.selected } : n
          ),
        }));
      }
      return true;
    } catch (err) {
      set({ error: errorMessage(err) });
      return false;
    }
  },

  removeNode: async (id) => {
    try {
      await api.deleteNode(id);
      set((state) => ({
        selection: state.selection?.kind === 'node' && state.selection.id === id ? null : state.selection,
      }));
      // Kinder wurden serverseitig umgehängt → Graph neu laden
      await get().reload();
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },

  connect: async (connection) => {
    if (!connection.source || !connection.target) return;
    try {
      const created = await api.createEdge({
        sourceId: connection.source,
        targetId: connection.target,
      });
      const flow = toFlowEdge(created);
      flow.selected = true;
      set((state) => ({
        nodes: state.nodes.map((n) => ({ ...n, selected: false })),
        edges: [...state.edges.map((e) => ({ ...e, selected: false })), flow],
        selection: { kind: 'edge', id: created.id },
      }));
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },

  saveEdge: async (id, patch) => {
    try {
      const updated = await api.updateEdge(id, patch);
      set((state) => ({
        edges: state.edges.map((e) =>
          e.id === id ? { ...toFlowEdge(updated), selected: e.selected } : e
        ),
      }));
      return true;
    } catch (err) {
      set({ error: errorMessage(err) });
      return false;
    }
  },

  removeEdge: async (id) => {
    try {
      await api.deleteEdge(id);
    } catch (err) {
      // 404 = bereits durch Node-Kaskade entfernt → ignorieren
      if (!(err instanceof Error && 'status' in err && err.status === 404)) {
        set({ error: errorMessage(err) });
        return;
      }
    }
    set((state) => ({
      edges: state.edges.filter((e) => e.id !== id),
      selection:
        state.selection?.kind === 'edge' && state.selection.id === id ? null : state.selection,
    }));
  },

  importGraph: async (payload) => {
    try {
      await api.importGraph(payload);
      set({ selection: null });
      await get().reload();
      return true;
    } catch (err) {
      set({ error: errorMessage(err) });
      return false;
    }
  },

  clearGraph: async () => {
    try {
      await api.importGraph({ nodes: [], edges: [] });
      set({ selection: null });
      await get().reload();
      console.log('[Debug graph-store]: Graph geleert');
      return true;
    } catch (err) {
      set({ error: errorMessage(err) });
      return false;
    }
  },

  autoLayout: async () => {
    try {
      const result = await api.autoLayout();
      console.log('[Debug graph-store]: Auto-Layout angewendet', result);
      await get().reload();
      return true;
    } catch (err) {
      set({ error: errorMessage(err) });
      return false;
    }
  },
}));
