import { describe, expect, test, vi, beforeEach } from 'vitest';
import { useGraphStore } from './graph';
import type { ApiEdge, ApiNode, EdgeRouting } from '../api/types';

/**
 * Auto-Align war nicht rückgängig zu machen: der Store rief die API auf und lud
 * neu, legte aber keinen Undo-Eintrag an. Dabei verschiebt es nicht nur Nodes,
 * sondern setzt auch Zonengrössen und verwirft manuelles Kanten-Routing
 * (applyLayout in backend/src/store.js) — Handarbeit an den Kanten war damit
 * unwiederbringlich weg.
 */
vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
    api: {
      autoLayout: vi.fn(),
      updatePositions: vi.fn(),
      updateNode: vi.fn(),
      updateEdge: vi.fn(),
      // reload() nach dem Layout
      listViews: vi.fn(),
      graph: vi.fn(),
      projectCatalog: vi.fn(),
    },
  };
});

const { api } = await import('../api/client');
const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const node = (id: string, x: number, y: number, extra: Partial<ApiNode> = {}): ApiNode =>
  ({
    id, name: id, category: 'generic', status: 'active', parentId: null, viewId: 'v',
    linkedViewId: null, position: { x, y }, width: null, height: null,
    fields: {}, customFields: {}, notes: '', createdAt: '', updatedAt: '', ...extra,
  }) as ApiNode;

const edge = (id: string, routing: EdgeRouting): ApiEdge =>
  ({
    id, sourceId: 'a', targetId: 'b', viewId: 'v', label: '', kind: 'generic',
    lineStyle: 'solid', animated: false, notes: '', routing, customFields: {},
    createdAt: '', updatedAt: '',
  }) as ApiEdge;

const AUTO: EdgeRouting = { mode: 'auto', waypoints: [] };
const MANUAL: EdgeRouting = { mode: 'manual', waypoints: [{ x: 10, y: 20 }], labelT: 0.3 };

beforeEach(() => {
  mocked.autoLayout.mockResolvedValue({ updated: 3 });
  mocked.updatePositions.mockResolvedValue({ updated: 2 });
  mocked.updateNode.mockResolvedValue(undefined);
  mocked.updateEdge.mockResolvedValue(undefined);
  mocked.listViews.mockResolvedValue([]);
  mocked.graph.mockResolvedValue({ viewId: 'v', nodes: [], edges: [] });

  useGraphStore.setState({
    activeViewId: 'v',
    activeProjectId: 'p',
    past: [],
    future: [],
    error: null,
    nodes: [
      { id: 'a', type: 'infra', position: { x: 10, y: 20 }, data: { entity: node('a', 10, 20) } },
      { id: 'b', type: 'infra', position: { x: 30, y: 40 }, data: { entity: node('b', 30, 40) } },
      {
        id: 'z', type: 'zone', position: { x: 0, y: 0 },
        data: { entity: node('z', 0, 0, { category: 'group', width: 400, height: 260 }) },
      },
    ] as never,
    edges: [
      { id: 'e1', source: 'a', target: 'b', data: { entity: edge('e1', MANUAL) } },
      { id: 'e2', source: 'a', target: 'b', data: { entity: edge('e2', AUTO) } },
    ] as never,
  });
});

describe('Auto-Align ist rückgängig zu machen', () => {
  test('legt einen Undo-Eintrag für die aktive Ebene an', async () => {
    expect(useGraphStore.getState().past).toHaveLength(0);
    await useGraphStore.getState().autoLayout();

    const past = useGraphStore.getState().past;
    expect(past).toHaveLength(1);
    expect(past[0]).toMatchObject({ label: 'Auto-Align', viewId: 'v' });
  });

  test('Undo stellt Positionen, Zonengrösse und manuelles Routing wieder her', async () => {
    await useGraphStore.getState().autoLayout();
    await useGraphStore.getState().past[0].undo();

    // Normale Nodes über den Bulk-Endpunkt …
    expect(mocked.updatePositions).toHaveBeenCalledWith([
      { id: 'a', x: 10, y: 20 },
      { id: 'b', x: 30, y: 40 },
    ]);
    // … Zonen einzeln, weil der Bulk-Endpunkt width/height bei null unangetastet
    // lässt und eine vorher grössenlose Zone sonst die Layout-Grösse behielte.
    expect(mocked.updateNode).toHaveBeenCalledWith('z', {
      position: { x: 0, y: 0 },
      width: 400,
      height: 260,
    });
    // Nur die von Hand verlegte Kante wird zurückgesetzt.
    expect(mocked.updateEdge).toHaveBeenCalledTimes(1);
    expect(mocked.updateEdge).toHaveBeenCalledWith('e1', { routing: MANUAL });
  });

  test('Redo führt das Layout erneut aus (es ist deterministisch)', async () => {
    await useGraphStore.getState().autoLayout();
    mocked.autoLayout.mockClear();
    await useGraphStore.getState().past[0].redo();
    expect(mocked.autoLayout).toHaveBeenCalledWith({ viewId: 'v' });
  });

  test('ohne aktive Ebene passiert nichts', async () => {
    useGraphStore.setState({ activeViewId: null });
    expect(await useGraphStore.getState().autoLayout()).toBe(false);
    expect(mocked.autoLayout).not.toHaveBeenCalled();
    expect(useGraphStore.getState().past).toHaveLength(0);
  });
});
