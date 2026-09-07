import { describe, expect, test, vi, beforeEach } from 'vitest';
import { ApiRequestError } from '../api/client';
import { useGraphStore } from './graph';

/**
 * Nur der API-Client wird ersetzt; `ApiRequestError` und `setUnauthorizedHandler`
 * bleiben echt, weil der Store `instanceof` darauf prüft.
 */
vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
    api: {
      createProject: vi.fn(),
      // Nach dem Anlegen wechselt der Store ins neue Projekt und lädt dessen
      // Graph — inkl. Katalog, der seit den Domain-Packs am Projekt hängt.
      listViews: vi.fn(),
      graph: vi.fn(),
      projectCatalog: vi.fn(),
    },
  };
});

const { api } = await import('../api/client');
const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;
const createProject = mocked.createProject;

beforeEach(() => {
  // `restoreMocks` leert die Implementierungen nach jedem Test — daher hier setzen.
  mocked.listViews.mockResolvedValue([]);
  mocked.graph.mockResolvedValue({ viewId: null, nodes: [], edges: [] });
  mocked.projectCatalog.mockResolvedValue({
    categories: [],
    statuses: [],
    edgeKinds: [],
    lineStyles: [],
    fields: [],
    packs: [],
    inactive: { categories: [], edgeKinds: [], fields: [] },
  });
  useGraphStore.setState({
    error: null,
    limitNotice: null,
    projects: [],
    activeProjectId: null,
  });
});

/**
 * Regression: Die zentrale Fehlerbehandlung rief sich im else-Zweig selbst auf
 * (Endlosrekursion bei JEDEM Fehler, der kein Limit war). Genau das prüfen die
 * ersten beiden Tests — ohne die Weiche landet hier ein RangeError.
 */
describe('Fehlerbehandlung des Graph-Stores', () => {
  test('ein gewöhnlicher API-Fehler landet im Fehler-Toast', async () => {
    createProject.mockRejectedValue(new ApiRequestError('Name ist ungültig', 400));

    const result = await useGraphStore.getState().createProject({ name: 'x' });

    expect(result).toBeNull();
    expect(useGraphStore.getState().error).toBe('Name ist ungültig');
    // Kein Limit-Fehler → der Limit-Dialog bleibt zu.
    expect(useGraphStore.getState().limitNotice).toBeNull();
  });

  test('auch ein Nicht-API-Fehler bringt den Store nicht zum Absturz', async () => {
    createProject.mockRejectedValue(new TypeError('Failed to fetch'));

    const result = await useGraphStore.getState().createProject({ name: 'x' });

    expect(result).toBeNull();
    expect(useGraphStore.getState().error).toBe('Failed to fetch');
  });

  test('ein erreichtes Instanz-Limit öffnet den Limit-Hinweis statt des Toasts', async () => {
    createProject.mockRejectedValue(
      new ApiRequestError('This instance allows at most 1 project per account.', 403, 'limit_reached')
    );

    await useGraphStore.getState().createProject({ name: 'x' });

    expect(useGraphStore.getState().limitNotice).toBe(
      'This instance allows at most 1 project per account.'
    );
    // Der Toast bleibt leer — sonst stünde dieselbe Meldung doppelt auf dem Schirm.
    expect(useGraphStore.getState().error).toBeNull();
  });

  test('403 ohne Limit-Code ist ein normaler Fehler (z. B. CSRF-Schutz)', async () => {
    createProject.mockRejectedValue(new ApiRequestError('Invalid origin', 403));

    await useGraphStore.getState().createProject({ name: 'x' });

    expect(useGraphStore.getState().error).toBe('Invalid origin');
    expect(useGraphStore.getState().limitNotice).toBeNull();
  });

  test('closeLimitNotice schließt den Dialog wieder', async () => {
    useGraphStore.setState({ limitNotice: 'Grenze erreicht' });

    useGraphStore.getState().closeLimitNotice();

    expect(useGraphStore.getState().limitNotice).toBeNull();
  });

  test('ein erfolgreicher Aufruf hinterlässt keinen Fehlerzustand', async () => {
    createProject.mockResolvedValue({ id: 'p1', name: 'Neu', sortOrder: 0 });

    const result = await useGraphStore.getState().createProject({ name: 'Neu' });

    expect(result).toMatchObject({ id: 'p1' });
    expect(useGraphStore.getState().error).toBeNull();
    expect(useGraphStore.getState().limitNotice).toBeNull();
  });
});
