import type {
  ApiEdge,
  ApiNode,
  Catalog,
  EdgePatch,
  GraphPayload,
  NodePatch,
  Project,
  ProjectPatch,
  User,
  View,
  ViewPatch,
} from './types';

const BASE = '/api';

// Wird bei 401 auf geschützten Endpunkten aufgerufen (z. B. abgelaufene Session),
// damit die App zurück auf den Login-Screen wechseln kann.
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    // Session-Cookie mitsenden (Same-Origin über nginx-/Vite-Proxy).
    credentials: 'same-origin',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });
  if (res.status === 401 && !path.startsWith('/auth/')) onUnauthorized?.();
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
  // ── Auth ──────────────────────────────────────────────────────
  me: () => request<{ user: User }>('/auth/me'),
  register: (email: string, password: string) =>
    request<{ user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  login: (email: string, password: string) =>
    request<{ user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),

  catalog: () => request<Catalog>('/meta/catalog'),
  graph: (viewId?: string) =>
    request<Required<Pick<GraphPayload, 'viewId' | 'nodes' | 'edges'>>>(
      viewId ? `/graph?viewId=${encodeURIComponent(viewId)}` : '/graph'
    ),
  exportGraph: () =>
    request<GraphPayload & { version: number; exportedAt: string }>('/graph/export'),
  importGraph: (payload: GraphPayload) =>
    request<{ views: number; nodes: number; edges: number }>('/graph/import', {
      method: 'POST',
      body: JSON.stringify({ mode: 'replace', ...payload }),
    }),
  autoLayout: (options?: { viewId?: string; maxCols?: number; profile?: 'default' | 'wide' }) =>
    request<{ updated: number }>('/graph/layout', {
      method: 'POST',
      body: JSON.stringify(options ?? {}),
    }),

  listProjects: () => request<Project[]>('/projects'),
  createProject: (data: ProjectPatch & { name: string }) =>
    request<Project>('/projects', { method: 'POST', body: JSON.stringify(data) }),
  updateProject: (id: string, patch: ProjectPatch) =>
    request<Project>(`/projects/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteProject: (id: string) =>
    request<{ views: number; nodes: number }>(`/projects/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  listViews: (projectId?: string) =>
    request<View[]>(projectId ? `/views?projectId=${encodeURIComponent(projectId)}` : '/views'),
  createView: (data: ViewPatch & { name: string }) =>
    request<View>('/views', { method: 'POST', body: JSON.stringify(data) }),
  updateView: (id: string, patch: ViewPatch) =>
    request<View>(`/views/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteView: (id: string) =>
    request<{ views: number; nodes: number }>(`/views/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  /** Globale Suche über alle Ebenen eines Projekts. */
  searchNodes: (projectId: string, q: string) =>
    request<ApiNode[]>(
      `/nodes?projectId=${encodeURIComponent(projectId)}&q=${encodeURIComponent(q)}`
    ),

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
