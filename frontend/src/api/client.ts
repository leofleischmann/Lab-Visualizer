import type {
  ApiEdge,
  ApiNode,
  Catalog,
  EdgePatch,
  GraphPayload,
  NodePatch,
} from './types';

const BASE = '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
      if (Array.isArray(body?.details) && body.details.length) {
        message += `: ${body.details.map((d: { path: string; message: string }) => `${d.path} – ${d.message}`).join(', ')}`;
      }
    } catch {
      /* Body war kein JSON */
    }
    throw new ApiRequestError(message, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export class ApiRequestError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export const api = {
  catalog: () => request<Catalog>('/meta/catalog'),
  graph: () => request<GraphPayload>('/graph'),
  exportGraph: () =>
    request<GraphPayload & { version: number; exportedAt: string }>('/graph/export'),
  importGraph: (payload: GraphPayload) =>
    request<{ nodes: number; edges: number }>('/graph/import', {
      method: 'POST',
      body: JSON.stringify({ mode: 'replace', ...payload }),
    }),
  autoLayout: (options?: { maxCols?: number; profile?: 'default' | 'wide' }) =>
    request<{ updated: number }>('/graph/layout', {
      method: 'POST',
      body: JSON.stringify(options ?? {}),
    }),

  createNode: (data: NodePatch & { name: string }) =>
    request<ApiNode>('/nodes', { method: 'POST', body: JSON.stringify(data) }),
  updateNode: (id: string, patch: NodePatch) =>
    request<ApiNode>(`/nodes/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteNode: (id: string) =>
    request<void>(`/nodes/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  updatePositions: (
    positions: { id: string; x: number; y: number; width?: number; height?: number }[]
  ) =>
    request<{ updated: number }>('/nodes/positions', {
      method: 'POST',
      body: JSON.stringify({ positions }),
    }),

  createEdge: (data: EdgePatch & { sourceId: string; targetId: string }) =>
    request<ApiEdge>('/edges', { method: 'POST', body: JSON.stringify(data) }),
  updateEdge: (id: string, patch: EdgePatch) =>
    request<ApiEdge>(`/edges/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteEdge: (id: string) =>
    request<void>(`/edges/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
