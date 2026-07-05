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
  Project,
  ProjectPatch,
  View,
  ViewPatch,
} from '../api/types';
export type Selection = { kind: 'node' | 'edge'; id: string } | null;

/** Standard-aktive Ebene: erste Root-Ebene, sonst irgendeine, sonst null. */
function pickRootView(views: View[]): string | null {
  return (views.find((v) => v.parentId === null) ?? views[0])?.id ?? null;
}

/**
 * Ein rückgängig machbarer Schritt. `undo`/`redo` rufen die inversen API-Aktionen
 * auf; danach wird die betroffene Ebene neu geladen. `viewId` sorgt dafür, dass
 * Undo/Redo bei Bedarf in die richtige Ebene navigiert.
 */
export type HistoryEntry = {
  label: string;
  viewId: string;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
};

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

/**
 * Prüft, ob sich zwei Entitäten inhaltlich unterscheiden — Zeitstempel werden
 * ignoriert. Verhindert leere Undo-Schritte bei No-Op-Speichern.
 */
function entityChanged<T extends Record<string, unknown>>(before: T, after: T): boolean {
  const strip = (o: T) => {
    const { updatedAt: _u, createdAt: _c, ...rest } = o as Record<string, unknown>;
    return JSON.stringify(rest);
  };
  return strip(before) !== strip(after);
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
  projects: Project[];
  activeProjectId: string | null;
  views: View[];
  activeViewId: string | null;
  past: HistoryEntry[];
  future: HistoryEntry[];
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

  setActiveProject: (id: string) => Promise<void>;
  createProject: (data: ProjectPatch & { name: string }) => Promise<Project | null>;
  saveProject: (id: string, patch: ProjectPatch) => Promise<boolean>;
  removeProject: (id: string) => Promise<boolean>;

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

  record: (entry: HistoryEntry) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
};

const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message : 'Unbekannter Fehler';

export const useGraphStore = create<GraphStore>((set, get) => ({
  nodes: [],
  edges: [],
  projects: [],
  activeProjectId: null,
  views: [],
  activeViewId: null,
  past: [],
  future: [],
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
      const [catalog, projects] = await Promise.all([api.catalog(), api.listProjects()]);
      const activeProjectId =
        (get().activeProjectId && projects.some((p) => p.id === get().activeProjectId)
          ? get().activeProjectId
          : projects[0]?.id) ?? null;
      const views = activeProjectId ? await api.listViews(activeProjectId) : [];
      const wanted = pickRootView(views);
      const graph = await api.graph(wanted ?? undefined);
      const flowNodes = orderForFlow(graph.nodes.map(toFlowNode));
      set({
        catalog,
        projects,
        activeProjectId,
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
      const [projects, views, graph] = await Promise.all([
        api.listProjects(),
        api.listViews(get().activeProjectId ?? undefined),
        api.graph(get().activeViewId ?? undefined),
      ]);
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
        projects,
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

  setActiveProject: async (id) => {
    if (id === get().activeProjectId) return;
    try {
      const views = await api.listViews(id);
      const rootId = pickRootView(views);
      const graph = await api.graph(rootId ?? undefined);
      set({
        activeProjectId: id,
        views,
        activeViewId: graph.viewId ?? rootId,
        nodes: orderForFlow(graph.nodes.map(toFlowNode)),
        edges: graph.edges.map(toFlowEdge),
        selection: null,
        hoverNodeId: null,
        focus: null,
        // Undo-History gehört zum Projekt → beim Wechsel leeren
        past: [],
        future: [],
      });
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },

  createProject: async (data) => {
    try {
      const created = await api.createProject(data);
      set((state) => ({ projects: [...state.projects, created] }));
      await get().setActiveProject(created.id);
      return created;
    } catch (err) {
      set({ error: errorMessage(err) });
      return null;
    }
  },

  saveProject: async (id, patch) => {
    try {
      const updated = await api.updateProject(id, patch);
      set((state) => ({ projects: state.projects.map((p) => (p.id === id ? updated : p)) }));
      return true;
    } catch (err) {
      set({ error: errorMessage(err) });
      return false;
    }
  },

  removeProject: async (id) => {
    try {
      await api.deleteProject(id);
      const projects = await api.listProjects();
      set({ projects });
      if (id === get().activeProjectId) {
        const next = projects[0]?.id;
        if (next) await get().setActiveProject(next);
      }
      return true;
    } catch (err) {
      set({ error: errorMessage(err) });
      return false;
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
      // Root-Ebenen landen im aktiven Projekt; Unterebenen erben es vom Parent.
      const created = await api.createView({ projectId: get().activeProjectId ?? undefined, ...data });
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
      const remaining = await api.listViews(get().activeProjectId ?? undefined);
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
    // Alte (persistierte) und neue Positionen für Undo erfassen.
    const oldPos = moved.map((n) => ({
      id: n.id,
      x: n.data.entity.position.x,
      y: n.data.entity.position.y,
    }));
    const newPos = moved.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y }));
    set((state) => ({
      nodes: state.nodes.map((n) =>
        idSet.has(n.id)
          ? { ...n, data: { entity: { ...n.data.entity, position: { ...n.position } } } }
          : n
      ),
    }));
    try {
      await api.updatePositions(newPos);
      const viewId = get().activeViewId;
      const changed = newPos.some((p, i) => p.x !== oldPos[i].x || p.y !== oldPos[i].y);
      if (viewId && changed) {
        get().record({
          label: 'Verschieben',
          viewId,
          undo: async () => void (await api.updatePositions(oldPos)),
          redo: async () => void (await api.updatePositions(newPos)),
        });
      }
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },

  applyZoneGeometry: async (id, { x, y, width, height }) => {
    // Vorherige Geometrie (persistiert) für Undo festhalten.
    const prev = get().nodes.find((n) => n.id === id)?.data.entity;
    const before = prev
      ? {
          id,
          x: prev.position.x,
          y: prev.position.y,
          width: prev.width ?? undefined,
          height: prev.height ?? undefined,
        }
      : null;
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
      const after = { id, x, y, width, height };
      await api.updatePositions([after]);
      const viewId = get().activeViewId;
      const changed =
        !before ||
        before.x !== x ||
        before.y !== y ||
        before.width !== width ||
        before.height !== height;
      if (before && viewId && changed) {
        get().record({
          label: 'Zone anpassen',
          viewId,
          undo: async () => void (await api.updatePositions([before])),
          redo: async () => void (await api.updatePositions([after])),
        });
      }
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
      get().record({
        label: 'Node anlegen',
        viewId: created.viewId,
        undo: () => api.deleteNode(created.id),
        redo: async () => void (await api.createNode(created)),
      });
      return created;
    } catch (err) {
      set({ error: errorMessage(err) });
      return null;
    }
  },

  saveNode: async (id, patch) => {
    const before = get().nodes.find((n) => n.id === id)?.data.entity;
    try {
      const updated = await api.updateNode(id, patch);
      const structuralChange =
        patch.parentId !== undefined ||
        (patch.viewId !== undefined && patch.viewId !== before?.viewId) ||
        (patch.category !== undefined &&
          (patch.category === 'group') !== (before?.category === 'group'));
      if (structuralChange) {
        await get().reload();
      } else {
        set((state) => ({
          nodes: state.nodes.map((n) =>
            n.id === id ? { ...toFlowNode(updated), selected: n.selected } : n
          ),
        }));
      }
      if (before && entityChanged(before, updated)) {
        get().record({
          label: 'Node bearbeiten',
          viewId: before.viewId,
          undo: async () => void (await api.updateNode(id, before)),
          redo: async () => void (await api.updateNode(id, updated)),
        });
      }
      return true;
    } catch (err) {
      set({ error: errorMessage(err) });
      return false;
    }
  },

  removeNode: async (id) => {
    const node = get().nodes.find((n) => n.id === id)?.data.entity;
    const connectedEdges = get()
      .edges.filter((e) => e.source === id || e.target === id)
      .map((e) => e.data!.entity);
    // Direkte Kinder werden serverseitig an den Großelternknoten umgehängt und
    // verschoben. Ihre ursprüngliche (relative) Position + Zugehörigkeit hier
    // festhalten, damit das Undo sie verlustfrei wiederherstellen kann.
    const formerChildren = get()
      .nodes.filter((n) => n.data.entity.parentId === id)
      .map((n) => ({ id: n.id, position: { ...n.data.entity.position } }));
    try {
      await api.deleteNode(id);
      set((state) => ({
        selection: state.selection?.kind === 'node' && state.selection.id === id ? null : state.selection,
      }));
      // Kinder wurden serverseitig umgehängt → Graph neu laden
      await get().reload();
      if (node) {
        get().record({
          label: 'Node löschen',
          viewId: node.viewId,
          undo: async () => {
            await api.createNode(node);
            // Kinder wieder unter den Node hängen und Position zurücksetzen.
            for (const child of formerChildren) {
              await api.updateNode(child.id, { parentId: id, position: child.position });
            }
            for (const e of connectedEdges) await api.createEdge(e);
          },
          redo: () => api.deleteNode(id),
        });
      }
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
      get().record({
        label: 'Verbindung anlegen',
        viewId: created.viewId,
        undo: () => api.deleteEdge(created.id),
        redo: async () => void (await api.createEdge(created)),
      });
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },

  saveEdge: async (id, patch) => {
    const before = get().edges.find((e) => e.id === id)?.data?.entity;
    try {
      const updated = await api.updateEdge(id, patch);
      set((state) => ({
        edges: state.edges.map((e) =>
          e.id === id ? { ...toFlowEdge(updated), selected: e.selected } : e
        ),
      }));
      if (before && entityChanged(before, updated)) {
        get().record({
          label: 'Verbindung bearbeiten',
          viewId: before.viewId,
          undo: async () => void (await api.updateEdge(id, before)),
          redo: async () => void (await api.updateEdge(id, updated)),
        });
      }
      return true;
    } catch (err) {
      set({ error: errorMessage(err) });
      return false;
    }
  },

  removeEdge: async (id) => {
    const edge = get().edges.find((e) => e.id === id)?.data?.entity;
    let deleted = false;
    try {
      await api.deleteEdge(id);
      deleted = true;
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
    if (deleted && edge) {
      get().record({
        label: 'Verbindung löschen',
        viewId: edge.viewId,
        undo: async () => void (await api.createEdge(edge)),
        redo: () => api.deleteEdge(id),
      });
    }
  },

  updateEdgeRouting: async (id, routing, persist = true) => {
    const before = persist ? get().edges.find((e) => e.id === id)?.data?.entity : undefined;
    const beforeRouting = before?.routing;
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
      if (before && beforeRouting) {
        get().record({
          label: 'Kantenverlauf',
          viewId: before.viewId,
          undo: async () => void (await api.updateEdge(id, { routing: beforeRouting })),
          redo: async () => void (await api.updateEdge(id, { routing })),
        });
      }
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
      // Projekte/Ebenen wurden komplett ersetzt: aktives Projekt + Ebene können
      // auf gelöschte IDs zeigen. Zurücksetzen und über load() neu bestimmen,
      // sonst zeigt der ProjectSwitcher/die Ebenen-Leiste ins Leere. Undo-History
      // bezieht sich auf alte IDs → ebenfalls verwerfen.
      set({ selection: null, activeProjectId: null, activeViewId: null, past: [], future: [] });
      await get().load();
      return true;
    } catch (err) {
      set({ error: errorMessage(err) });
      return false;
    }
  },

  clearGraph: async () => {
    try {
      await api.importGraph({ views: [], nodes: [], edges: [] });
      // Wie beim Import: alle Daten inkl. Projekten werden ersetzt → neu auflösen.
      set({ selection: null, activeProjectId: null, activeViewId: null, past: [], future: [] });
      await get().load();
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

  // ── Undo / Redo ───────────────────────────────────────────────
  record: (entry) => set((s) => ({ past: [...s.past, entry].slice(-100), future: [] })),

  undo: async () => {
    const entry = get().past[get().past.length - 1];
    if (!entry) return;
    set((s) => ({ past: s.past.slice(0, -1) }));
    try {
      await entry.undo();
      // In die betroffene Ebene navigieren bzw. aktuelle Ebene neu laden.
      if (get().activeViewId !== entry.viewId) await get().setActiveView(entry.viewId);
      else await get().reload();
      set((s) => ({ future: [entry, ...s.future] }));
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },

  redo: async () => {
    const entry = get().future[0];
    if (!entry) return;
    set((s) => ({ future: s.future.slice(1) }));
    try {
      await entry.redo();
      if (get().activeViewId !== entry.viewId) await get().setActiveView(entry.viewId);
      else await get().reload();
      set((s) => ({ past: [...s.past, entry] }));
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },
}));
