import { describe, expect, test, vi, beforeEach } from 'vitest';
import { useGraphStore } from './graph';
import type { ApiEdge, ApiNode, SharedProject, View } from '../api/types';

/**
 * Leseansicht eines Freigabelinks. Der Link liefert den GANZEN Projektstand auf
 * einmal, damit der Betrachter ohne Konto und ohne weitere Anfragen durch die
 * Drill-down-Hierarchie navigieren kann.
 */
vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return { ...actual, api: { sharedProject: vi.fn(), graph: vi.fn(), listViews: vi.fn() } };
});

const { api } = await import('../api/client');
const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const view = (id: string, parentId: string | null): View =>
  ({ id, projectId: 'p', name: id, parentId, description: '', color: null, icon: null, sortOrder: 0, createdAt: '', updatedAt: '' }) as View;

const node = (id: string, viewId: string): ApiNode =>
  ({
    id, name: id, category: 'generic', status: 'active', parentId: null, viewId,
    linkedViewId: null, position: { x: 0, y: 0 }, width: null, height: null,
    icon: null, color: null, fields: {}, customFields: {}, notes: '', createdAt: '', updatedAt: '',
  }) as ApiNode;

const edge = (id: string, viewId: string, s: string, t: string): ApiEdge =>
  ({
    id, sourceId: s, targetId: t, viewId, label: '', kind: 'generic', lineStyle: 'solid',
    animated: false, notes: '', routing: { mode: 'auto', waypoints: [] }, customFields: '' as never,
    createdAt: '', updatedAt: '',
  }) as unknown as ApiEdge;

const payload: SharedProject = {
  project: { id: 'p', name: 'Geteilt', color: null, icon: null, packs: [], sortOrder: 0, createdAt: '', updatedAt: '' },
  views: [view('root', null), view('detail', 'root')],
  nodes: [node('a', 'root'), node('b', 'root'), node('c', 'detail')],
  edges: [edge('e1', 'root', 'a', 'b')],
  catalog: {
    categories: [], statuses: [], edgeKinds: [], lineStyles: [], fields: [], packs: [],
    inactive: { categories: [], edgeKinds: [], fields: [] },
  },
};

beforeEach(() => {
  mocked.sharedProject.mockResolvedValue(payload);
  useGraphStore.setState({ readOnly: false, sharedGraph: null, activeViewId: null, nodes: [], edges: [] });
});

describe('Leseansicht eines Freigabelinks', () => {
  test('lädt das Projekt, schaltet auf Lesen und zeigt die Wurzelebene', async () => {
    await useGraphStore.getState().loadShared('tok');
    const s = useGraphStore.getState();

    expect(s.readOnly).toBe(true);
    expect(s.activeViewId).toBe('root');
    expect(s.views).toHaveLength(2);
    // Nur die Nodes der aktiven Ebene liegen auf der Canvas …
    expect(s.nodes.map((n) => n.id)).toEqual(['a', 'b']);
    // … der volle Stand bleibt aber vorrätig.
    expect(s.sharedGraph?.nodes).toHaveLength(3);
    expect(s.past).toEqual([]);
  });

  test('Ebenenwechsel kommt ohne weitere Anfrage aus', async () => {
    await useGraphStore.getState().loadShared('tok');
    mocked.graph.mockClear();

    await useGraphStore.getState().setActiveView('detail');
    const s = useGraphStore.getState();
    expect(s.nodes.map((n) => n.id)).toEqual(['c']);
    expect(s.edges).toEqual([]);
    // Der Betrachter hat kein Konto — /api/graph wäre 401.
    expect(mocked.graph).not.toHaveBeenCalled();
  });

  test('ein ungültiger Link hinterlässt keinen halben Lesemodus', async () => {
    mocked.sharedProject.mockRejectedValue(new Error('weg'));
    await useGraphStore.getState().loadShared('tok');
    const s = useGraphStore.getState();
    expect(s.readOnly).toBe(false);
    expect(s.loading).toBe(false);
    expect(s.error).toBe('weg');
  });
});
