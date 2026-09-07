import { describe, expect, test, vi, beforeEach } from 'vitest';
import { useGraphStore } from './graph';
import type { ApiEdge, EdgeRouting } from '../api/types';

/**
 * Die API konnte eine Verbindung schon immer umhängen (PATCH /edges/:id mit
 * sourceId/targetId), nur die Canvas reichte es nicht durch — umhängen hiess
 * löschen und neu ziehen.
 */
vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return { ...actual, api: { updateEdge: vi.fn() } };
});

const { api } = await import('../api/client');
const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const MANUAL: EdgeRouting = { mode: 'manual', waypoints: [{ x: 5, y: 5 }], labelT: 0.4 };
const AUTO: EdgeRouting = { mode: 'auto', waypoints: [], labelT: null };

const edge = (overrides: Partial<ApiEdge> = {}): ApiEdge =>
  ({
    id: 'e1', sourceId: 'a', targetId: 'b', viewId: 'v', label: '', kind: 'generic',
    lineStyle: 'solid', animated: false, notes: '', routing: MANUAL, customFields: {},
    createdAt: '', updatedAt: '', ...overrides,
  }) as ApiEdge;

beforeEach(() => {
  mocked.updateEdge.mockImplementation((id: string, patch: Partial<ApiEdge>) =>
    Promise.resolve(edge({ id, ...patch }))
  );
  useGraphStore.setState({
    activeViewId: 'v',
    past: [],
    future: [],
    error: null,
    edges: [{ id: 'e1', source: 'a', target: 'b', data: { entity: edge() } }] as never,
  });
});

describe('Verbindung umhängen', () => {
  test('schreibt den neuen Endpunkt und setzt den Verlauf zurück', async () => {
    await useGraphStore.getState().reconnectEdge('e1', { source: 'a', target: 'c' } as never);

    // Der manuell verlegte Verlauf passt nicht mehr zum neuen Endpunkt.
    expect(mocked.updateEdge).toHaveBeenCalledWith('e1', {
      sourceId: 'a',
      targetId: 'c',
      routing: AUTO,
    });
  });

  test('lässt sich rückgängig machen — inklusive des alten Verlaufs', async () => {
    await useGraphStore.getState().reconnectEdge('e1', { source: 'a', target: 'c' } as never);
    const past = useGraphStore.getState().past;
    expect(past).toHaveLength(1);
    expect(past[0]).toMatchObject({ label: 'Verbindung umhängen', viewId: 'v' });

    mocked.updateEdge.mockClear();
    await past[0].undo();
    expect(mocked.updateEdge).toHaveBeenCalledWith('e1', {
      sourceId: 'a',
      targetId: 'b',
      routing: MANUAL,
    });
  });

  test('ein Ziehen auf denselben Endpunkt schreibt nichts', async () => {
    await useGraphStore.getState().reconnectEdge('e1', { source: 'a', target: 'b' } as never);
    expect(mocked.updateEdge).not.toHaveBeenCalled();
    expect(useGraphStore.getState().past).toHaveLength(0);
  });

  test('eine unvollständige Verbindung wird ignoriert', async () => {
    await useGraphStore.getState().reconnectEdge('e1', { source: 'a', target: null } as never);
    expect(mocked.updateEdge).not.toHaveBeenCalled();
  });
});
