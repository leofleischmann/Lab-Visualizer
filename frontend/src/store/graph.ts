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
  EdgeRouting,
  FlowEdge,
  FlowNode,
  GraphPayload,
  NodePatch,
  Position,
  View,
  ViewPatch,
} from '../api/types';
export type Selection = { kind: 'node' | 'edge'; id: string } | null;

/** Standard-aktive Ebene: erste Root-Ebene, sonst irgendeine, sonst null. */
function pickRootView(views: View[]): string | null {
  return (views.find((v) => v.parentId === null) ?? views[0])?.id ?? null;
}

/** Pfad Root → … → aktive Ebene über die parentId-Kette (für Breadcrumb). */
export function viewPath(views: View[], id: string | null): View[] {
  const byId = new Map(views.map((v) => [v.id, v]));
  const path: View[] = [];
  let current = id ? byId.get(id) : undefined;
  let guard = 0;
  while (current && guard++ < 100) {
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}

/** Aktive Fokus-Hervorhebung: Nodes/Edges, die betont bleiben (Rest wird gedimmt). */
export type FocusSet = { nodeIds: Set<string>; edgeIds: Set<string> } | null;

/**
 * Fokus rund um einen Node: der Node selbst, seine direkten Nachbarn und die
 * verbindenden Kanten. `null`, wenn kein Node im Fokus ist (nichts wird gedimmt).
 */
function computeFocus(edges: FlowEdge[], focusNodeId: string | null): FocusSet {
  if (!focusNodeId) return null;
  const nodeIds = new Set<string>([focusNodeId]);
  const edgeIds = new Set<string>();
  for (const e of edges) {
    if (e.source === focusNodeId || e.target === focusNodeId) {
      edgeIds.add(e.id);
      nodeIds.add(e.source);
      nodeIds.add(e.target);
    }
  }
  return { nodeIds, edgeIds };
}

function toFlowNode(n: ApiNode): FlowNode {
  const isZone = n.category === 'group';
  return {
    id: n.id,
    type: isZone ? 'zone' : 'infra',
    position: { ...n.position },
    parentId: n.parentId ?? undefined,
    width: isZone ? (n.width ?? 420) : undefined,
    height: isZone ? (n.height ?? 260) : undefined,
    // Zonen unter die Kanten-Ebene legen, damit Linien über Zonen greifbar bleiben
    zIndex: isZone ? -1 : undefined,
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
  views: View[];
  activeViewId: string | null;
  catalog: Catalog | null;
  selection: Selection;
  hoverNodeId: string | null;
  focus: FocusSet;
  /**
   * Zählt hoch, wenn sich die Node-Geometrie strukturell ändert (Drop, Zonen-
   * Resize, Layout). Kanten routen daraufhin einmalig komplett neu — auch die,
   * deren eigene Endknoten sich nicht bewegt haben (Hindernis-Umgehung).
   */
  geometryVersion: number;
  search: string;
  loading: boolean;
  error: string | null;

  load: () => Promise<void>;
  reload: () => Promise<void>;
  setSearch: (term: string) => void;
  setError: (message: string | null) => void;
  select: (selection: Selection) => void;
  syncSelection: (selection: Selection) => void;
  setHoverNode: (id: string | null) => void;

  setActiveView: (id: string) => Promise<void>;
  createView: (data: ViewPatch & { name: string }) => Promise<View | null>;
  saveView: (id: string, patch: ViewPatch) => Promise<boolean>;
  removeView: (id: string) => Promise<boolean>;
  /** Doppelklick auf ein Portal-Node → in dessen verlinkte Ebene wechseln. */
  drillInto: (nodeId: string) => Promise<void>;
  /** Detailebene aus einem Node erzeugen (Kind der aktiven Ebene) und hineinwechseln. */
  createDetailView: (nodeId: string, name: string) => Promise<void>;

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
  updateEdgeRouting: (id: string, routing: EdgeRouting, persist?: boolean) => Promise<void>;
  resetEdgeRouting: (id: string) => Promise<void>;

  importGraph: (payload: GraphPayload) => Promise<boolean>;
  clearGraph: () => Promise<boolean>;
  autoLayout: () => Promise<boolean>;
};

const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message : 'Unbekannter Fehler';

export const useGraphStore = create<GraphStore>((set, get) => ({
  nodes: [],
  edges: [],
  views: [],
  activeViewId: null,
  catalog: null,
  selection: null,
  hoverNodeId: null,
  focus: null,
  geometryVersion: 0,
  search: '',
  loading: true,
  error: null,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const [catalog, views] = await Promise.all([api.catalog(), api.listViews()]);
      const wanted = get().activeViewId ?? pickRootView(views);
      const graph = await api.graph(wanted ?? undefined);
      const flowNodes = orderForFlow(graph.nodes.map(toFlowNode));
      set({
        catalog,
        views,
        activeViewId: graph.viewId ?? wanted,
        nodes: flowNodes,
        edges: graph.edges.map(toFlowEdge),
        selection: null,
        hoverNodeId: null,
        focus: null,
        loading: false,
      });
    } catch (err) {
      set({ loading: false, error: errorMessage(err) });
    }
  },

  reload: async () => {
    try {
      const [views, graph] = await Promise.all([api.listViews(), api.graph(get().activeViewId ?? undefined)]);
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
      const nextEdges = graph.edges.map((e) => {
        const flow = toFlowEdge(e);
        flow.selected = selection?.kind === 'edge' && selection.id === e.id;
        return flow;
      });
      const nextSelection = stillExists ? selection : null;
      set({
        views,
        nodes: flowNodes,
        edges: nextEdges,
        selection: nextSelection,
        hoverNodeId: null,
        focus: computeFocus(
          nextEdges,
          nextSelection?.kind === 'node' ? nextSelection.id : null
        ),
      });
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },

  setActiveView: async (id) => {
    if (id === get().activeViewId) return;
    try {
      const graph = await api.graph(id);
      set({
        activeViewId: graph.viewId ?? id,
        nodes: orderForFlow(graph.nodes.map(toFlowNode)),
        edges: graph.edges.map(toFlowEdge),
        selection: null,
        hoverNodeId: null,
        focus: null,
      });
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },

  createView: async (data) => {
    try {
      const created = await api.createView(data);
      set((state) => ({ views: [...state.views, created] }));
      return created;
    } catch (err) {
      set({ error: errorMessage(err) });
      return null;
    }
  },

  saveView: async (id, patch) => {
    try {
      const updated = await api.updateView(id, patch);
      set((state) => ({ views: state.views.map((v) => (v.id === id ? updated : v)) }));
      return true;
    } catch (err) {
      set({ error: errorMessage(err) });
      return false;
    }
  },

  removeView: async (id) => {
    try {
      await api.deleteView(id);
      const remaining = await api.listViews();
      // Falls die aktive Ebene gelöscht wurde (oder Vorfahr), auf Root wechseln.
      const active = get().activeViewId;
      const stillActive = active && remaining.some((v) => v.id === active);
      set({ views: remaining });
      if (!stillActive) {
        const root = pickRootView(remaining);
        if (root) await get().setActiveView(root);
      }
      return true;
    } catch (err) {
      set({ error: errorMessage(err) });
      return false;
    }
  },

  drillInto: async (nodeId) => {
    const target = get().nodes.find((n) => n.id === nodeId)?.data.entity.linkedViewId;
    if (target) await get().setActiveView(target);
  },

  createDetailView: async (nodeId, name) => {
    const parentId = get().activeViewId ?? undefined;
    const created = await get().createView({ name, parentId });
    if (!created) return;
    await get().saveNode(nodeId, { linkedViewId: created.id });
    await get().setActiveView(created.id);
  },

  setSearch: (term) => set({ search: term }),
  setError: (message) => set({ error: message }),

  select: (selection) =>
    set((state) => {
      const focusNodeId = state.hoverNodeId ?? (selection?.kind === 'node' ? selection.id : null);
      return {
        selection,
        focus: computeFocus(state.edges, focusNodeId),
        nodes: state.nodes.map((n) => ({
          ...n,
          selected: selection?.kind === 'node' && n.id === selection.id,
        })),
        edges: state.edges.map((e) => ({
          ...e,
          selected: selection?.kind === 'edge' && e.id === selection.id,
        })),
      };
    }),

  // Von React Flow getriebene Selektion (Klick, Rubber-Band) – ohne Echo zurück in RF.
  syncSelection: (selection) =>
    set((state) => ({
      selection,
      focus: computeFocus(
        state.edges,
        state.hoverNodeId ?? (selection?.kind === 'node' ? selection.id : null)
      ),
    })),

  setHoverNode: (id) =>
    set((state) => {
      if (id === state.hoverNodeId) return {};
      const focusNodeId = id ?? (state.selection?.kind === 'node' ? state.selection.id : null);
      return { hoverNodeId: id, focus: computeFocus(state.edges, focusNodeId) };
    }),

  onNodesChange: (changes) => {
    const nextNodes = applyNodeChanges(changes, get().nodes);
    const movedIds = changes
      .filter((c) => c.type === 'position' && c.dragging === false)
      .map((c) => (c as { id: string }).id);
    // Beim Loslassen (nicht während des Drags) einmalig alle Kanten neu routen
    set((state) => ({
      nodes: nextNodes,
      geometryVersion: movedIds.length ? state.geometryVersion + 1 : state.geometryVersion,
    }));
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
      geometryVersion: state.geometryVersion + 1,
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
      // Neue Nodes gehören zur aktuell geöffneten Ebene.
      const created = await api.createNode({ viewId: get().activeViewId ?? undefined, ...data });
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

  updateEdgeRouting: async (id, routing, persist = true) => {
    set((state) => ({
      edges: state.edges.map((e) =>
        e.id === id && e.data?.entity
          ? { ...e, data: { entity: { ...e.data.entity, routing } } }
          : e
      ),
    }));
    if (!persist) return;
    try {
      await api.updateEdge(id, { routing });
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },

  resetEdgeRouting: async (id) => {
    await get().updateEdgeRouting(id, { mode: 'auto', waypoints: [], labelT: null }, true);
  },

  importGraph: async (payload) => {
    try {
      await api.importGraph(payload);
      // Ebenen wurden ersetzt → aktive Ebene neu bestimmen (Root).
      set({ selection: null, activeViewId: null });
      await get().reload();
      return true;
    } catch (err) {
      set({ error: errorMessage(err) });
      return false;
    }
  },

  clearGraph: async () => {
    try {
      await api.importGraph({ views: [], nodes: [], edges: [] });
      set({ selection: null, activeViewId: null });
      await get().reload();
      return true;
    } catch (err) {
      set({ error: errorMessage(err) });
      return false;
    }
  },

  autoLayout: async () => {
    try {
      await api.autoLayout({ viewId: get().activeViewId ?? undefined });
      await get().reload();
      return true;
    } catch (err) {
      set({ error: errorMessage(err) });
      return false;
    }
  },
}));
