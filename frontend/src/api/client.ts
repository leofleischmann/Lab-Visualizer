import type {
  ApiEdge,
  ApiNode,
  Catalog,
  EdgePatch,
  GraphPayload,
  NodePatch,
  InstanceLimits,
  Asset,
  LegalDocument,
  Pack,
  Project,
  ProjectPatch,
  SharedProject,
  ShareLink,
  Template,
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
    let code: string | undefined;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
      if (typeof body?.code === 'string') code = body.code;
      if (Array.isArray(body?.details) && body.details.length) {
        message += `: ${body.details.map((d: { path: string; message: string }) => `${d.path} – ${d.message}`).join(', ')}`;
      }
    } catch {
      /* Body war kein JSON */
    }
    throw new ApiRequestError(message, res.status, code);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export class ApiRequestError extends Error {
  status: number;
  /** Maschinenlesbarer Fehlercode (z. B. "limit_reached" → Limit-Hinweis anzeigen). */
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type AuthResponse = { user: User; limits: InstanceLimits };

export const api = {
  // ── Auth ──────────────────────────────────────────────────────
  me: () => request<AuthResponse>('/auth/me'),
  register: (email: string, password: string) =>
    request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  login: (email: string, password: string) =>
    request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<void>('/auth/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  deleteAccount: (password: string) =>
    request<void>('/auth/account', {
      method: 'DELETE',
      body: JSON.stringify({ password }),
    }),

  /**
   * Katalog eines Projekts — auf dessen Domain-Packs eingeschränkt. Die UI nutzt
   * IMMER diese Variante; /meta/catalog (alle Packs) ist die Referenz für
   * Skripte und Agenten.
   */
  projectCatalog: (projectId: string) =>
    request<Catalog>(`/projects/${encodeURIComponent(projectId)}/catalog`),
  /** Verfügbare Domain-Packs für die Projekt-Einstellungen. */
  packs: () => request<{ packs: Pack[] }>('/meta/packs'),
  /** Startvorlagen für neue Projekte. */
  templates: () => request<{ templates: Template[] }>('/meta/templates'),
  /** Rechtstexte dieser Instanz — ohne Anmeldung abrufbar. */
  legal: () => request<{ documents: LegalDocument[] }>('/meta/legal'),
  graph: (viewId?: string) =>
    request<Required<Pick<GraphPayload, 'viewId' | 'nodes' | 'edges'>>>(
      viewId ? `/graph?viewId=${encodeURIComponent(viewId)}` : '/graph'
    ),
  /** Export aller Daten — oder nur eines Projekts (zum Teilen/Verschieben). */
  exportGraph: (projectId?: string) =>
    request<GraphPayload & { version: number; exportedAt: string }>(
      projectId ? `/graph/export?projectId=${encodeURIComponent(projectId)}` : '/graph/export'
    ),
  /** mode=replace ersetzt alle eigenen Daten, mode=merge fügt sie additiv hinzu. */
  importGraph: (payload: GraphPayload, mode: 'replace' | 'merge' = 'replace') =>
    request<{ views: number; nodes: number; edges: number }>('/graph/import', {
      method: 'POST',
      body: JSON.stringify({ mode, ...payload }),
    }),
  autoLayout: (options?: { viewId?: string; maxCols?: number; profile?: 'default' | 'wide' }) =>
    request<{ updated: number }>('/graph/layout', {
      method: 'POST',
      body: JSON.stringify(options ?? {}),
    }),

  // ── Freigabelinks (read-only) ─────────────────────────────────
  listShares: (projectId: string) =>
    request<ShareLink[]>(`/projects/${encodeURIComponent(projectId)}/shares`),
  /** Die Antwort enthält das Klartext-Token — es ist danach nicht mehr abrufbar. */
  createShare: (projectId: string, data: { label?: string; expiresAt?: string | null }) =>
    request<ShareLink>(`/projects/${encodeURIComponent(projectId)}/shares`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  revokeShare: (projectId: string, shareId: string) =>
    request<{ revoked: number }>(
      `/projects/${encodeURIComponent(projectId)}/shares/${encodeURIComponent(shareId)}`,
      { method: 'DELETE' }
    ),
  /** Öffentlich, ohne Anmeldung: der Lesestand eines freigegebenen Projekts. */
  sharedProject: (token: string) =>
    request<SharedProject>(`/share/${encodeURIComponent(token)}`),

  // ── Bilder (eigene Icons, Bilder in Notizen) ──────────────────
  listAssets: () => request<Asset[]>('/assets'),
  /** `dataUrl` = base64-Data-URL. Der Typ wird serverseitig an den Magic Bytes
   *  erkannt, nicht am hier genannten. */
  createAsset: (name: string, dataUrl: string) =>
    request<Asset>('/assets', { method: 'POST', body: JSON.stringify({ name, dataUrl }) }),
  deleteAsset: (id: string) =>
    request<{ clearedNodes: number }>(`/assets/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  listProjects: () => request<Project[]>('/projects'),
  /** `template` baut zusätzlich den Startinhalt auf (siehe /meta/templates). */
  createProject: (data: ProjectPatch & { name: string; template?: string }) =>
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
