/**
 * OpenAPI-3.1-Spezifikation der REST-API - ausgeliefert unter GET /api/openapi.json.
 *
 * Grundlage für die Doku-Seite /docs (frontend/src/components/docs/) und für
 * fremde Werkzeuge: Import in Postman/Insomnia/Bruno, Client-Generatoren
 * (openapi-generator, orval …), API-Gateways.
 *
 * Woher die Formen kommen:
 *   Request-Bodies   automatisch aus den Zod-Schemas in validation.js
 *                    (backend/src/jsonSchema.js) - keine Drift möglich.
 *   Antworten        hier von Hand beschrieben. test/openapi.test.js vergleicht
 *                    sie mit echten Antworten der API und prüft, dass JEDE Route
 *                    aus der Mount-Tabelle in app.js hier dokumentiert ist.
 *
 * Wer eine Route anlegt, ändert oder entfernt, muss sie hier nachziehen - der
 * Test schlägt sonst fehl. Die Tool-Liste des MCP-Servers wird aus
 * backend/src/mcp/tools.js übernommen (x-mcp an POST /mcp).
 *
 * Beeinflusst: backend/src/routes/system.js, frontend/src/lib/openapi.ts,
 * frontend/src/components/docs/ApiDocs.tsx, AGENTS.md (verweist hierauf).
 */
import { toJsonSchema } from './jsonSchema.js';
import * as v from './validation.js';
import { getAppVersion } from './version.js';
import { STATUS_IDS, LINE_STYLES } from './catalog/index.js';
import { TOOLS } from './mcp/tools.js';
import { SUPPORTED_PROTOCOL_VERSIONS } from './mcp/server.js';
import { API_KEY_PREFIX } from './apiKeys.js';

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const arrayOf = (schema) => ({ type: 'array', items: schema });
const nullable = (type) => ({ type: [type, 'null'] });
const TIMESTAMP = { type: 'string', format: 'date-time' };
const ID = { type: 'string', pattern: '^[A-Za-z0-9_.:-]{1,64}$' };
const STRING_MAP = { type: 'object', additionalProperties: { type: 'string' } };

/** Objekt, bei dem jede Eigenschaft Pflicht ist (so liefert die API ihre Entitäten). */
const entity = (description, properties) => ({
  type: 'object',
  description,
  required: Object.keys(properties),
  properties,
});

/** Variante mit Klartext-Token - nur in der Antwort auf das Anlegen. */
const withToken = (schema, description) => ({
  ...schema,
  required: [...schema.required, 'token'],
  properties: { ...schema.properties, token: { type: 'string', description } },
});

// ── Request-Bodies ──────────────────────────────────────────────

/** Zod-Schema je Request-Body - daraus entstehen die JSON-Schemas der Doku. */
export const REQUEST_SCHEMAS = {
  RegisterRequest: v.registerSchema,
  LoginRequest: v.loginSchema,
  PasswordChangeRequest: v.passwordChangeSchema,
  AccountDeleteRequest: v.accountDeleteSchema,
  ProjectCreate: v.projectCreateSchema,
  ProjectUpdate: v.projectUpdateSchema,
  ViewCreate: v.viewCreateSchema,
  ViewUpdate: v.viewUpdateSchema,
  NodeCreate: v.nodeCreateSchema,
  NodeUpdate: v.nodeUpdateSchema,
  EdgeCreate: v.edgeCreateSchema,
  EdgeUpdate: v.edgeUpdateSchema,
  PositionsUpdate: v.positionsSchema,
  ImportRequest: v.importSchema,
  LayoutRequest: v.layoutSchema,
  AssetCreate: v.assetCreateSchema,
  ShareCreate: v.shareCreateSchema,
  ApiKeyCreate: v.apiKeyCreateSchema,
};

/**
 * Beispiel-Bodies für die Doku (curl-Beispiele auf /docs, Postman & Co.).
 * test/openapi.test.js prüft jedes gegen sein Zod-Schema - ein Beispiel, das
 * die API ablehnen würde, fällt dort auf.
 */
export const EXAMPLES = {
  RegisterRequest: { email: 'you@example.com', password: 'your-password' },
  LoginRequest: { email: 'you@example.com', password: 'your-password' },
  PasswordChangeRequest: { currentPassword: 'old-password', newPassword: 'new-password' },
  AccountDeleteRequest: { password: 'your-password' },
  ProjectCreate: { name: 'Homelab', template: 'homelab' },
  ProjectUpdate: { name: 'Homelab (prod)', packs: ['infrastructure', 'network', 'operations'] },
  ViewCreate: { id: 'server-internal', name: 'Server internals', parentId: 'overview' },
  ViewUpdate: { description: 'Services on the virtualization host.' },
  NodeCreate: {
    id: 'postgres',
    name: 'PostgreSQL',
    category: 'database',
    status: 'active',
    fields: { ip: '192.168.2.50', hostname: 'postgres.lan', version: '16' },
    customFields: { Port: '5432' },
  },
  NodeUpdate: { status: 'error' },
  EdgeCreate: {
    id: 'e-app-db',
    sourceId: 'web-app',
    targetId: 'postgres',
    kind: 'tcp',
    label: 'PostgreSQL :5432',
    lineStyle: 'dashed',
  },
  EdgeUpdate: { label: 'PostgreSQL :5433' },
  PositionsUpdate: { positions: [{ id: 'postgres', x: 100, y: 200 }] },
  ImportRequest: { mode: 'merge', projects: [], views: [], nodes: [{ id: 'a', name: 'Imported node' }], edges: [] },
  LayoutRequest: { viewId: 'server-internal', maxCols: 5 },
  AssetCreate: {
    name: 'logo.svg',
    dataUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=',
  },
  ShareCreate: { label: 'For the team', expiresAt: '2027-01-01T00:00:00Z' },
  ApiKeyCreate: { name: 'Claude Code', scope: 'write' },
};

// ── Antwortschemas ──────────────────────────────────────────────

const projectSchema = entity('A separate workspace. Belongs to exactly one account.', {
  id: ID,
  name: { type: 'string' },
  color: nullable('string'),
  icon: nullable('string'),
  packs: { ...arrayOf({ type: 'string' }), description: 'Active domain packs.' },
  sortOrder: { type: 'integer' },
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP,
});

const viewSchema = entity('A level: one canvas in the drill-down hierarchy of a project.', {
  id: ID,
  projectId: ID,
  name: { type: 'string' },
  parentId: { ...nullable('string'), description: 'Parent level; null = root level.' },
  description: { type: 'string', description: 'Markdown.' },
  color: nullable('string'),
  icon: nullable('string'),
  sortOrder: { type: 'integer' },
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP,
});

const positionSchema = entity('Canvas position in px.', { x: { type: 'number' }, y: { type: 'number' } });

const nodeSchema = entity('A building block on a level: server, service, device, zone …', {
  id: ID,
  name: { type: 'string' },
  category: { type: 'string', description: 'Category id from the catalog (any string is allowed).' },
  status: { type: 'string', enum: STATUS_IDS },
  parentId: { ...nullable('string'), description: 'Containing zone; position is relative to it.' },
  viewId: { ...ID, description: 'Level the node belongs to.' },
  linkedViewId: { ...nullable('string'), description: 'Detail level opened by double-click.' },
  position: ref('Position'),
  width: nullable('number'),
  height: nullable('number'),
  icon: { ...nullable('string'), description: 'Own icon name or "asset:<imageId>"; null = category icon.' },
  color: { ...nullable('string'), description: 'Own color; null = category color.' },
  fields: { ...STRING_MAP, description: 'Typed fields by catalog key. Values are strings.' },
  notes: { type: 'string', description: 'Markdown (GFM).' },
  customFields: { ...STRING_MAP, description: 'Free-form key/value pairs.' },
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP,
});

const routingSchema = {
  type: 'object',
  required: ['mode', 'waypoints'],
  properties: {
    mode: { type: 'string', enum: ['auto', 'manual'] },
    waypoints: arrayOf(ref('Position')),
    labelT: { ...nullable('number'), description: 'Label position along the line (0..1).' },
  },
};

const edgeSchema = entity('A connection between two nodes on the same level.', {
  id: ID,
  sourceId: ID,
  targetId: ID,
  viewId: ID,
  label: { type: 'string' },
  kind: { type: 'string', description: 'Edge kind id from the catalog (any string is allowed).' },
  lineStyle: { type: 'string', enum: LINE_STYLES },
  animated: { type: 'boolean' },
  notes: { type: 'string', description: 'Markdown (GFM).' },
  routing: ref('Routing'),
  customFields: STRING_MAP,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP,
});

const assetSchema = entity('Metadata of an uploaded image. The bytes come from GET /assets/{id}.', {
  id: ID,
  name: { type: 'string' },
  mime: { type: 'string', enum: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'] },
  byteSize: { type: 'integer' },
  createdAt: TIMESTAMP,
});

const shareLinkSchema = entity('Read-only share link of one project. Only the token hash is stored.', {
  id: { type: 'string', description: 'sha256 hash of the token - used to revoke the link.' },
  projectId: ID,
  label: { type: 'string' },
  createdAt: TIMESTAMP,
  expiresAt: { ...nullable('string'), format: 'date-time' },
  lastSeenAt: { ...nullable('string'), format: 'date-time' },
});

const apiKeySchema = entity('An API key. The secret itself is only returned once, on creation.', {
  id: { type: 'string', format: 'uuid' },
  name: { type: 'string' },
  prefix: { type: 'string', description: `First characters of the key (e.g. "${API_KEY_PREFIX}AbCd1234") to recognize it.` },
  scope: { type: 'string', enum: v.API_KEY_SCOPES },
  createdAt: TIMESTAMP,
  expiresAt: { ...nullable('string'), format: 'date-time' },
  lastUsedAt: { ...nullable('string'), format: 'date-time', description: 'Updated at most once per minute.' },
});

const categorySchema = entity('Node category.', {
  id: { type: 'string' },
  label: { type: 'string' },
  group: { type: 'string' },
  color: { type: 'string' },
  icon: { type: 'string' },
});
const edgeKindSchema = entity('Edge kind.', {
  id: { type: 'string' },
  label: { type: 'string' },
  group: { type: 'string' },
  color: { type: 'string' },
});
const fieldDefSchema = {
  type: 'object',
  description: 'Definition of a typed node field.',
  required: ['key', 'label', 'type', 'group'],
  properties: {
    key: { type: 'string' },
    label: { type: 'string' },
    type: { type: 'string', enum: ['text', 'url', 'number', 'select', 'date'] },
    group: { type: 'string' },
    mono: { type: 'boolean' },
    showOnNode: { type: 'boolean', description: 'Value is shown on the canvas.' },
    wide: { type: 'boolean' },
    placeholder: { type: 'string' },
    options: { ...arrayOf({ type: 'string' }), description: 'Allowed values (type "select").' },
    unit: { type: 'string', description: 'Unit (type "number").' },
  },
};

const limitsSchema = entity('Instance limits; null = unlimited.', {
  maxProjectsPerUser: nullable('integer'),
  maxViewsPerProject: nullable('integer'),
  maxNodesPerProject: nullable('integer'),
  maxAssetsPerUser: nullable('integer'),
});

const authInfoSchema = {
  type: 'object',
  description: 'How this request was authenticated and what it may do.',
  required: ['method', 'scope'],
  properties: {
    method: { type: 'string', enum: ['session', 'apiKey'] },
    scope: { type: 'string', enum: v.API_KEY_SCOPES, description: 'A session always has "write".' },
    keyId: { type: 'string', description: 'ID of the API key (method "apiKey" only).' },
  },
};

const counts = (description, keys) =>
  entity(description, Object.fromEntries(keys.map((k) => [k, { type: 'integer' }])));

const SCHEMAS = {
  // Entitäten
  Project: projectSchema,
  View: viewSchema,
  Position: positionSchema,
  Node: nodeSchema,
  Routing: routingSchema,
  Edge: edgeSchema,
  Asset: assetSchema,
  ShareLink: shareLinkSchema,
  ShareLinkCreated: withToken(shareLinkSchema, 'Plaintext token for the link /s/{token} - returned only once.'),
  ApiKey: apiKeySchema,
  ApiKeyCreated: withToken(apiKeySchema, 'The API key. Returned only once - store it now.'),
  Graph: entity('One level with its nodes and edges.', {
    viewId: nullable('string'),
    nodes: arrayOf(ref('Node')),
    edges: arrayOf(ref('Edge')),
  }),
  Category: categorySchema,
  Status: entity('Node status.', { id: { type: 'string', enum: STATUS_IDS }, label: { type: 'string' }, color: { type: 'string' } }),
  EdgeKind: edgeKindSchema,
  FieldDef: fieldDefSchema,
  Catalog: entity('Building blocks: what a project can contain.', {
    categories: arrayOf(ref('Category')),
    statuses: arrayOf(ref('Status')),
    edgeKinds: arrayOf(ref('EdgeKind')),
    lineStyles: arrayOf({ type: 'string', enum: LINE_STYLES }),
    fields: arrayOf(ref('FieldDef')),
    packs: { ...arrayOf({ type: 'string' }), description: 'Packs this catalog was built from.' },
    inactive: {
      type: 'object',
      description: 'Definitions of packs that are off - needed to draw existing data, not offered for new data.',
      properties: {
        categories: arrayOf(ref('Category')),
        edgeKinds: arrayOf(ref('EdgeKind')),
        fields: arrayOf(ref('FieldDef')),
      },
    },
  }),
  Pack: entity('Domain pack.', {
    id: { type: 'string' },
    label: { type: 'string' },
    description: { type: 'string' },
    icon: { type: 'string' },
    categories: { type: 'integer', description: 'Number of categories.' },
    fields: { type: 'integer', description: 'Number of fields.' },
  }),
  Template: entity('Starter template for new projects.', {
    id: { type: 'string' },
    label: { type: 'string' },
    description: { type: 'string' },
    icon: { type: 'string' },
    color: { type: 'string' },
    packs: arrayOf({ type: 'string' }),
    footprint: entity('What the template creates.', { views: { type: 'integer' }, nodes: { type: 'integer' } }),
  }),
  User: entity('Account.', { id: { type: 'string' }, email: { type: 'string', format: 'email' } }),
  Limits: limitsSchema,
  AuthInfo: authInfoSchema,
  AuthResponse: entity('Signed-in account plus instance limits.', { user: ref('User'), limits: ref('Limits') }),
  Me: entity('Current account, instance limits and how the request was authenticated.', {
    user: ref('User'),
    limits: ref('Limits'),
    auth: ref('AuthInfo'),
  }),
  Export: entity('Backup or single-project export. Send it back to POST /graph/import (add "mode").', {
    version: { type: 'integer' },
    exportedAt: TIMESTAMP,
    projects: arrayOf(ref('Project')),
    views: arrayOf(ref('View')),
    nodes: arrayOf(ref('Node')),
    edges: arrayOf(ref('Edge')),
    assets: arrayOf(
      entity('Image with its bytes.', {
        id: ID,
        name: { type: 'string' },
        createdAt: TIMESTAMP,
        dataUrl: { type: 'string', description: 'data:<mime>;base64,…' },
      })
    ),
  }),
  ImportResult: {
    type: 'object',
    description: 'Counts after the import ("replace": totals of the account; "merge": what was added).',
    required: ['projects', 'views', 'nodes', 'edges'],
    properties: {
      mode: { type: 'string', enum: ['merge'] },
      projects: { type: 'integer' },
      views: { type: 'integer' },
      nodes: { type: 'integer' },
      edges: { type: 'integer' },
      assets: { type: 'integer' },
    },
  },
  DeleteResult: counts('What a cascading delete removed.', ['views', 'nodes']),
  Health: entity('Health check.', {
    status: { type: 'string', enum: ['ok'] },
    version: { type: 'string', description: 'Backend version (backend/VERSION).' },
    time: TIMESTAMP,
  }),
  LegalDocument: entity('Legal text of this instance.', {
    id: { type: 'string', enum: ['impressum', 'privacy'] },
    title: { type: 'string' },
    markdown: { type: 'string' },
  }),
  Error: {
    type: 'object',
    description: 'Every error has this shape.',
    required: ['error'],
    properties: {
      error: { type: 'string', description: 'Human-readable message.' },
      details: arrayOf(entity('Validation problem.', { path: { type: 'string' }, message: { type: 'string' } })),
      code: {
        type: 'string',
        description:
          'Machine-readable reason: "limit_reached" (instance limit - do not retry), "insufficient_scope" (read-only API key), "session_required" (only possible from the web app).',
      },
    },
  },
  JsonRpcMessage: {
    type: 'object',
    description: 'JSON-RPC 2.0 request or notification (MCP).',
    examples: [{ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_projects', arguments: {} } }],
    required: ['jsonrpc', 'method'],
    properties: {
      jsonrpc: { const: '2.0' },
      id: { type: ['string', 'integer'], description: 'Omit for notifications.' },
      method: { type: 'string', examples: ['initialize', 'tools/list', 'tools/call'] },
      params: { type: 'object' },
    },
  },
  JsonRpcResponse: {
    type: 'object',
    required: ['jsonrpc', 'id'],
    properties: {
      jsonrpc: { const: '2.0' },
      id: { type: ['string', 'integer', 'null'] },
      result: { type: 'object' },
      error: entity('JSON-RPC error.', { code: { type: 'integer' }, message: { type: 'string' } }),
    },
  },

  // Request-Bodies - erzeugt aus validation.js
  ...Object.fromEntries(
    Object.entries(REQUEST_SCHEMAS).map(([name, schema]) => [
      name,
      { ...toJsonSchema(schema), ...(EXAMPLES[name] ? { examples: [EXAMPLES[name]] } : {}) },
    ])
  ),
};

// ── Fehlerantworten ─────────────────────────────────────────────

const errorResponse = (description) => ({
  description,
  content: { 'application/json': { schema: ref('Error') } },
});

const RESPONSES = {
  BadRequest: errorResponse('Validation failed or invalid reference.'),
  Unauthorized: errorResponse('Not signed in, or missing/invalid/expired API key.'),
  Forbidden: errorResponse(
    'Read-only API key (code "insufficient_scope"), instance limit (code "limit_reached") or foreign Origin (CSRF).'
  ),
  NotFound: errorResponse('Not found - or owned by another account.'),
  Conflict: errorResponse('ID already exists.'),
  TooLarge: errorResponse('Request body or file too large.'),
  TooManyRequests: {
    ...errorResponse('Rate limit exceeded. Wait for the Retry-After header.'),
    headers: { 'Retry-After': { schema: { type: 'integer' }, description: 'Seconds to wait.' } },
  },
};
const errorRef = (name) => ({ $ref: `#/components/responses/${name}` });

// ── Operationen ─────────────────────────────────────────────────

/**
 * Zugriffsstufen (x-auth), aus denen `security` und die Fehlerantworten folgen:
 *   public   ohne Anmeldung
 *   read     Session oder API-Key (jeder Scope)
 *   write    Session oder API-Key mit Scope "write"
 *   session  nur Session-Cookie (Web-App), nie mit API-Key
 *   apiKey   nur API-Key (MCP)
 */
const SECURITY = {
  public: [],
  read: [{ apiKey: [] }, { session: [] }],
  write: [{ apiKey: [] }, { session: [] }],
  session: [{ session: [] }],
  apiKey: [{ apiKey: [] }],
};

const pathParam = (name, description) => ({
  name,
  in: 'path',
  required: true,
  description,
  schema: name === 'token' ? { type: 'string' } : ID,
});
const queryParam = (name, description, schema = { type: 'string' }) => ({
  name,
  in: 'query',
  required: false,
  description,
  schema,
});

const json = (schema) => ({ 'application/json': { schema } });

/**
 * Baut eine Operation. `ok` = Schema der Erfolgsantwort (null = kein Body).
 * Fehlerantworten ergeben sich aus Zugriffsstufe, Methode, Pfadparametern
 * und Body; `errors` ergänzt weitere (z. B. Conflict).
 */
function op(method, spec) {
  const {
    tag,
    summary,
    description,
    auth = method === 'get' ? 'read' : 'write',
    params = [],
    body,
    ok,
    okStatus = ok === null ? 204 : 200,
    okDescription = 'OK',
    okContent,
    errors = [],
    extra = {},
  } = spec;
  const responses = {
    [okStatus]: {
      description: okDescription,
      ...(ok ? { content: json(ok) } : {}),
      ...(okContent ? { content: okContent } : {}),
    },
  };
  const add = (status, name) => {
    responses[status] ??= errorRef(name);
  };
  if (body) add(400, 'BadRequest');
  if (auth !== 'public') add(401, 'Unauthorized');
  if (auth === 'write' || auth === 'session') add(403, 'Forbidden');
  if (params.some((p) => p.in === 'path')) add(404, 'NotFound');
  for (const [status, name] of errors) add(status, name);
  if (method !== 'get') add(429, 'TooManyRequests');
  return {
    tags: [tag],
    summary,
    ...(description ? { description } : {}),
    operationId: spec.operationId,
    'x-auth': auth,
    security: SECURITY[auth],
    ...(params.length ? { parameters: params } : {}),
    ...(body ? { requestBody: { required: true, content: json(body) } } : {}),
    responses,
    ...extra,
  };
}

/** Pfade relativ zu /api (siehe `servers`). */
function buildPaths() {
  const id = (what) => pathParam('id', `${what} ID.`);
  const CONFLICT = [[409, 'Conflict']];
  const updateDescription =
    'Partial update: only the given properties change. `fields` and `customFields` are replaced as a whole.';

  /** PATCH und PUT sind identisch (beide partiell). */
  const patchAndPut = (spec) => ({
    patch: op('patch', spec),
    put: op('put', {
      ...spec,
      operationId: `${spec.operationId}Put`,
      summary: `${spec.summary} (PUT alias)`,
      extra: { 'x-alias-of': 'patch' },
    }),
  });

  return {
    // ── System ──
    '/health': {
      get: op('get', { tag: 'System', operationId: 'health', summary: 'Health check', auth: 'public', ok: ref('Health') }),
    },
    '/openapi.json': {
      get: op('get', {
        tag: 'System',
        operationId: 'openapi',
        summary: 'This OpenAPI document',
        auth: 'public',
        ok: { type: 'object' },
      }),
    },

    // ── Auth ──
    '/auth/register': {
      post: op('post', {
        tag: 'Auth',
        operationId: 'register',
        summary: 'Create an account',
        description:
          'Creates the account, seeds an example project and sets the session cookie. 403 when registration is disabled (ALLOW_REGISTRATION=false). Rate-limited per IP.',
        auth: 'public',
        body: ref('RegisterRequest'),
        ok: ref('AuthResponse'),
        okStatus: 201,
        okDescription: 'Created; `Set-Cookie: sid=…`',
        errors: [[403, 'Forbidden'], [409, 'Conflict']],
      }),
    },
    '/auth/login': {
      post: op('post', {
        tag: 'Auth',
        operationId: 'login',
        summary: 'Sign in',
        description: 'Sets the HttpOnly session cookie `sid`. Rate-limited per IP.',
        auth: 'public',
        body: ref('LoginRequest'),
        ok: ref('AuthResponse'),
        okDescription: 'Signed in; `Set-Cookie: sid=…`',
        errors: [[401, 'Unauthorized']],
      }),
    },
    '/auth/logout': {
      post: op('post', { tag: 'Auth', operationId: 'logout', summary: 'Sign out', auth: 'public', ok: null }),
    },
    '/auth/me': {
      get: op('get', {
        tag: 'Auth',
        operationId: 'me',
        summary: 'Current account',
        description: 'Works with a session and with an API key. `auth` tells a script what its key may do.',
        ok: ref('Me'),
      }),
    },
    '/auth/password': {
      post: op('post', {
        tag: 'Auth',
        operationId: 'changePassword',
        summary: 'Change password',
        description: 'Ends all other sessions. API keys stay valid.',
        auth: 'session',
        body: ref('PasswordChangeRequest'),
        ok: null,
      }),
    },
    '/auth/account': {
      delete: op('delete', {
        tag: 'Auth',
        operationId: 'deleteAccount',
        summary: 'Delete account and all data',
        auth: 'session',
        body: ref('AccountDeleteRequest'),
        ok: null,
      }),
    },

    // ── API-Keys ──
    '/api-keys': {
      get: op('get', {
        tag: 'API keys',
        operationId: 'listApiKeys',
        summary: 'List API keys',
        auth: 'session',
        ok: arrayOf(ref('ApiKey')),
      }),
      post: op('post', {
        tag: 'API keys',
        operationId: 'createApiKey',
        summary: 'Create an API key',
        description:
          'The response contains the key (`token`) exactly once - only its hash is stored. At most 50 keys per account.',
        auth: 'session',
        body: ref('ApiKeyCreate'),
        ok: ref('ApiKeyCreated'),
        okStatus: 201,
      }),
    },
    '/api-keys/{id}': {
      delete: op('delete', {
        tag: 'API keys',
        operationId: 'revokeApiKey',
        summary: 'Revoke an API key',
        description: 'Takes effect immediately.',
        auth: 'session',
        params: [id('API key')],
        ok: entity('Result.', { revoked: { type: 'integer' } }),
      }),
    },

    // ── Projekte ──
    '/projects': {
      get: op('get', { tag: 'Projects', operationId: 'listProjects', summary: 'List projects', ok: arrayOf(ref('Project')) }),
      post: op('post', {
        tag: 'Projects',
        operationId: 'createProject',
        summary: 'Create a project',
        description:
          'Creates the project with an empty root level. With `template` the starter content is built in the same transaction and its packs are adopted.',
        body: ref('ProjectCreate'),
        ok: ref('Project'),
        okStatus: 201,
        errors: CONFLICT,
      }),
    },
    '/projects/{id}': {
      get: op('get', { tag: 'Projects', operationId: 'getProject', summary: 'Get a project', params: [id('Project')], ok: ref('Project') }),
      ...patchAndPut({
        tag: 'Projects',
        operationId: 'updateProject',
        summary: 'Update a project',
        description: 'Partial update. `template` is ignored here. Turning a pack off deletes no data.',
        params: [id('Project')],
        body: ref('ProjectUpdate'),
        ok: ref('Project'),
      }),
      delete: op('delete', {
        tag: 'Projects',
        operationId: 'deleteProject',
        summary: 'Delete a project',
        description: 'Cascades to its levels, nodes, edges and share links. The last project cannot be deleted (400).',
        params: [id('Project')],
        ok: ref('DeleteResult'),
      }),
    },
    '/projects/{id}/catalog': {
      get: op('get', {
        tag: 'Catalog',
        operationId: 'projectCatalog',
        summary: 'Catalog of one project',
        description: 'Only the categories, fields and edge kinds of the project’s packs - what the UI offers.',
        params: [id('Project')],
        ok: ref('Catalog'),
      }),
    },

    // ── Freigabelinks ──
    '/projects/{id}/shares': {
      get: op('get', {
        tag: 'Sharing',
        operationId: 'listShares',
        summary: 'List share links',
        description: 'Without tokens - only their hashes are stored.',
        params: [id('Project')],
        ok: arrayOf(ref('ShareLink')),
      }),
      post: op('post', {
        tag: 'Sharing',
        operationId: 'createShare',
        summary: 'Create a share link',
        description: 'Makes the project readable without an account at `/s/{token}`. The token is returned only once.',
        params: [id('Project')],
        body: ref('ShareCreate'),
        ok: ref('ShareLinkCreated'),
        okStatus: 201,
      }),
    },
    '/projects/{id}/shares/{shareId}': {
      delete: op('delete', {
        tag: 'Sharing',
        operationId: 'revokeShare',
        summary: 'Revoke a share link',
        params: [id('Project'), pathParam('shareId', 'Share link ID (the token hash).')],
        ok: entity('Result.', { revoked: { type: 'integer' } }),
      }),
    },
    '/share/{token}': {
      get: op('get', {
        tag: 'Sharing',
        operationId: 'getSharedProject',
        summary: 'Read a shared project',
        description:
          'No authentication. All levels at once, plus the project catalog. Unknown, expired and revoked tokens all return 404.',
        auth: 'public',
        params: [pathParam('token', 'Share token.')],
        ok: entity('Read-only state of one project.', {
          project: ref('Project'),
          views: arrayOf(ref('View')),
          nodes: arrayOf(ref('Node')),
          edges: arrayOf(ref('Edge')),
          catalog: ref('Catalog'),
        }),
      }),
    },
    '/share/{token}/assets/{id}': {
      get: op('get', {
        tag: 'Sharing',
        operationId: 'getSharedAsset',
        summary: 'Image of a shared project',
        description: 'No authentication. Only images that this project actually uses.',
        auth: 'public',
        params: [pathParam('token', 'Share token.'), id('Image')],
        okDescription: 'The image bytes.',
        okContent: imageContent(),
      }),
    },

    // ── Ebenen ──
    '/views': {
      get: op('get', {
        tag: 'Levels',
        operationId: 'listViews',
        summary: 'List levels',
        description: 'Flat list; the hierarchy follows from `parentId`.',
        params: [queryParam('projectId', 'Only levels of this project.')],
        ok: arrayOf(ref('View')),
      }),
      post: op('post', {
        tag: 'Levels',
        operationId: 'createView',
        summary: 'Create a level',
        body: ref('ViewCreate'),
        ok: ref('View'),
        okStatus: 201,
        errors: CONFLICT,
      }),
    },
    '/views/{id}': {
      get: op('get', { tag: 'Levels', operationId: 'getView', summary: 'Get a level', params: [id('Level')], ok: ref('View') }),
      ...patchAndPut({
        tag: 'Levels',
        operationId: 'updateView',
        summary: 'Update a level',
        description: 'Partial update. A new parent must be in the same project and must not create a cycle.',
        params: [id('Level')],
        body: ref('ViewUpdate'),
        ok: ref('View'),
      }),
      delete: op('delete', {
        tag: 'Levels',
        operationId: 'deleteView',
        summary: 'Delete a level',
        description:
          'Cascades to its sub-levels and their nodes and edges. The last level - or one whose subtree covers every level - cannot be deleted (400).',
        params: [id('Level')],
        ok: ref('DeleteResult'),
      }),
    },

    // ── Nodes ──
    '/nodes': {
      get: op('get', {
        tag: 'Nodes',
        operationId: 'listNodes',
        summary: 'List or search nodes',
        description:
          '`q` matches the name and all field and custom field VALUES (not keys). With `projectId` the search covers every level of the project.',
        params: [
          queryParam('q', 'Search text (case-insensitive substring).'),
          queryParam('category', 'Category id.'),
          queryParam('status', 'Status.', { type: 'string', enum: STATUS_IDS }),
          queryParam('viewId', 'Only this level.'),
          queryParam('projectId', 'Only this project (all levels).'),
        ],
        ok: arrayOf(ref('Node')),
      }),
      post: op('post', {
        tag: 'Nodes',
        operationId: 'createNode',
        summary: 'Create a node',
        description:
          'Without `viewId` the node lands on its parent’s level, else on the root level of the first project. A zone (`category: "group"`) must exist before its children.',
        body: ref('NodeCreate'),
        ok: ref('Node'),
        okStatus: 201,
        errors: CONFLICT,
      }),
    },
    '/nodes/positions': {
      post: op('post', {
        tag: 'Nodes',
        operationId: 'updatePositions',
        summary: 'Bulk-update positions',
        description: 'Unknown or foreign IDs are ignored; `updated` counts the changed nodes.',
        body: ref('PositionsUpdate'),
        ok: entity('Result.', { updated: { type: 'integer' } }),
      }),
    },
    '/nodes/{id}': {
      get: op('get', { tag: 'Nodes', operationId: 'getNode', summary: 'Get a node', params: [id('Node')], ok: ref('Node') }),
      ...patchAndPut({
        tag: 'Nodes',
        operationId: 'updateNode',
        summary: 'Update a node',
        description: `${updateDescription} A new \`viewId\` moves the node with its children; edges that would cross levels are removed.`,
        params: [id('Node')],
        body: ref('NodeUpdate'),
        ok: ref('Node'),
      }),
      delete: op('delete', {
        tag: 'Nodes',
        operationId: 'deleteNode',
        summary: 'Delete a node',
        description: 'Removes its edges; its children move to the grandparent without jumping on the canvas.',
        params: [id('Node')],
        ok: null,
      }),
    },

    // ── Kanten ──
    '/edges': {
      get: op('get', {
        tag: 'Edges',
        operationId: 'listEdges',
        summary: 'List edges',
        params: [
          queryParam('nodeId', 'Edges from or to this node.'),
          queryParam('viewId', 'Only this level.'),
          queryParam('projectId', 'Only this project.'),
        ],
        ok: arrayOf(ref('Edge')),
      }),
      post: op('post', {
        tag: 'Edges',
        operationId: 'createEdge',
        summary: 'Create an edge',
        description: 'Source and target must be on the same level; the edge’s level follows them.',
        body: ref('EdgeCreate'),
        ok: ref('Edge'),
        okStatus: 201,
        errors: CONFLICT,
      }),
    },
    '/edges/{id}': {
      get: op('get', { tag: 'Edges', operationId: 'getEdge', summary: 'Get an edge', params: [id('Edge')], ok: ref('Edge') }),
      ...patchAndPut({
        tag: 'Edges',
        operationId: 'updateEdge',
        summary: 'Update an edge',
        description: `${updateDescription} The level always follows the endpoints.`,
        params: [id('Edge')],
        body: ref('EdgeUpdate'),
        ok: ref('Edge'),
      }),
      delete: op('delete', { tag: 'Edges', operationId: 'deleteEdge', summary: 'Delete an edge', params: [id('Edge')], ok: null }),
    },

    // ── Graph ──
    '/graph': {
      get: op('get', {
        tag: 'Graph',
        operationId: 'getGraph',
        summary: 'Graph of one level',
        params: [queryParam('viewId', 'Level. Default: the root level of the first project.')],
        ok: ref('Graph'),
        errors: [[404, 'NotFound']],
      }),
    },
    '/graph/export': {
      get: op('get', {
        tag: 'Graph',
        operationId: 'exportGraph',
        summary: 'Export (backup)',
        description:
          'Everything of the account, or with `projectId` one project including only the images it uses (to share it).',
        params: [queryParam('projectId', 'Export only this project.')],
        ok: ref('Export'),
        errors: [[404, 'NotFound']],
      }),
    },
    '/graph/import': {
      post: op('post', {
        tag: 'Graph',
        operationId: 'importGraph',
        summary: 'Import (replace or merge)',
        description:
          '`replace` deletes ALL data of the account first. `merge` adds the payload as new projects with fresh IDs. Parents must come before their children. Accepts up to MAX_IMPORT_BODY (default 20 MB); limits are checked before anything is written.',
        body: ref('ImportRequest'),
        ok: ref('ImportResult'),
        errors: [[413, 'TooLarge']],
      }),
    },
    '/graph/layout': {
      post: op('post', {
        tag: 'Graph',
        operationId: 'autoLayout',
        summary: 'Auto-arrange a level',
        description: 'Deterministic. Overwrites positions and zone sizes and resets the routing of every edge on the level.',
        body: ref('LayoutRequest'),
        ok: entity('Result.', { updated: { type: 'integer' } }),
        errors: [[404, 'NotFound']],
      }),
    },

    // ── Bilder ──
    '/assets': {
      get: op('get', { tag: 'Images', operationId: 'listAssets', summary: 'List images', ok: arrayOf(ref('Asset')) }),
      post: op('post', {
        tag: 'Images',
        operationId: 'createAsset',
        summary: 'Upload an image',
        description:
          'Reference it as node icon `asset:<id>` or in notes as `![](/api/assets/<id>)`. The type is detected from the bytes.',
        body: ref('AssetCreate'),
        ok: ref('Asset'),
        okStatus: 201,
        errors: [[413, 'TooLarge']],
      }),
    },
    '/assets/{id}': {
      get: op('get', {
        tag: 'Images',
        operationId: 'getAsset',
        summary: 'Image bytes',
        description: 'Immutable: served with ETag and `Cache-Control: immutable`; `If-None-Match` answers 304.',
        params: [id('Image')],
        okDescription: 'The image bytes.',
        okContent: imageContent(),
      }),
      delete: op('delete', {
        tag: 'Images',
        operationId: 'deleteAsset',
        summary: 'Delete an image',
        description: 'Nodes using it as icon fall back to their category icon.',
        params: [id('Image')],
        ok: entity('Result.', { clearedNodes: { type: 'integer' } }),
      }),
    },

    // ── Katalog & Meta ──
    '/meta/catalog': {
      get: op('get', {
        tag: 'Catalog',
        operationId: 'catalog',
        summary: 'Complete catalog',
        description: 'All packs. For one project use GET /projects/{id}/catalog.',
        auth: 'public',
        ok: ref('Catalog'),
      }),
    },
    '/meta/packs': {
      get: op('get', {
        tag: 'Catalog',
        operationId: 'packs',
        summary: 'Domain packs',
        auth: 'public',
        ok: entity('Packs.', { packs: arrayOf(ref('Pack')) }),
      }),
    },
    '/meta/templates': {
      get: op('get', {
        tag: 'Catalog',
        operationId: 'templates',
        summary: 'Project templates',
        auth: 'public',
        ok: entity('Templates.', { templates: arrayOf(ref('Template')) }),
      }),
    },
    '/meta/legal': {
      get: op('get', {
        tag: 'System',
        operationId: 'legal',
        summary: 'Legal texts of this instance',
        description: 'Empty when the instance publishes none.',
        auth: 'public',
        ok: entity('Documents.', { documents: arrayOf(ref('LegalDocument')) }),
      }),
    },

    // ── MCP ──
    '/mcp': {
      post: op('post', {
        tag: 'MCP',
        operationId: 'mcp',
        summary: 'MCP endpoint (Streamable HTTP)',
        description:
          'Model Context Protocol server for AI agents (Claude, Cursor, VS Code …). Stateless JSON-RPC 2.0 over POST with JSON responses; GET and DELETE answer 405. **API key only** - the scope decides which tools are listed. A browser Origin must match the host or CORS_ORIGIN.',
        auth: 'apiKey',
        body: { oneOf: [ref('JsonRpcMessage'), arrayOf(ref('JsonRpcMessage'))] },
        ok: ref('JsonRpcResponse'),
        okDescription: 'JSON-RPC response',
        errors: [[202, 'Accepted'], [403, 'Forbidden']],
        extra: {
          'x-mcp': {
            protocolVersions: SUPPORTED_PROTOCOL_VERSIONS,
            tools: TOOLS.map(({ name, title, description, scope, annotations }) => ({
              name,
              title,
              description,
              scope,
              destructive: !!annotations.destructiveHint,
            })),
          },
        },
      }),
    },
  };
}

function imageContent() {
  const binary = { type: 'string', format: 'binary' };
  return Object.fromEntries(
    ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].map((mime) => [mime, { schema: binary }])
  );
}

const DESCRIPTION = `REST API of Lab Visualizer. The web UI uses exactly this API - every UI action can be scripted.

**Authentication.** Create an API key in the web app (account menu -> *API keys & MCP*) and send it as \`Authorization: Bearer ${API_KEY_PREFIX}…\`. A key with scope \`read\` may only use GET; \`write\` may change data. Account settings and API keys themselves can only be managed from the web app (session cookie).

**Conventions.** JSON in and out; success without a body is \`204\`. IDs match \`^[A-Za-z0-9_.:-]{1,64}$\` - readable IDs such as \`nginx\` make updates scriptable. Other accounts' IDs behave as if they did not exist (\`404\`). PATCH and PUT are both partial updates. Write requests are rate-limited per IP (\`429\` + \`Retry-After\`).

**AI agents.** \`POST /mcp\` is a Model Context Protocol server with the same data and rules.`;

let cached = null;

/** Die Spezifikation ist statisch (Version, Katalog) - einmal bauen genügt. */
export function getOpenApiDocument() {
  cached ??= {
    openapi: '3.1.0',
    info: {
      title: 'Lab Visualizer API',
      version: getAppVersion(),
      description: DESCRIPTION,
      license: { name: 'MIT', identifier: 'MIT' },
    },
    servers: [{ url: '/api', description: 'This instance' }],
    tags: [
      { name: 'System', description: 'Health check, this document and legal texts.' },
      { name: 'Auth', description: 'Accounts and browser sessions.' },
      { name: 'API keys', description: 'Long-lived keys for scripts, integrations and MCP. Managed from the web app only.' },
      { name: 'Projects', description: 'Separate workspaces. Hierarchy: project -> levels -> nodes and edges.' },
      { name: 'Levels', description: 'Drill-down hierarchy of canvases ("views") inside a project.' },
      { name: 'Nodes', description: 'Building blocks on a level: servers, services, devices, zones.' },
      { name: 'Edges', description: 'Connections between nodes on the same level.' },
      { name: 'Graph', description: 'Whole levels, backup/restore and auto-layout.' },
      { name: 'Images', description: 'Uploaded images for node icons and notes.' },
      { name: 'Sharing', description: 'Read-only links that make one project viewable without an account.' },
      { name: 'Catalog', description: 'Categories, statuses, edge kinds, typed fields, packs and templates.' },
      { name: 'MCP', description: 'Model Context Protocol server for AI agents.' },
    ],
    paths: buildPaths(),
    components: {
      securitySchemes: {
        apiKey: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: `${API_KEY_PREFIX}…`,
          description: 'API key from the web app: `Authorization: Bearer lvk_…`.',
        },
        session: {
          type: 'apiKey',
          in: 'cookie',
          name: 'sid',
          description: 'Session cookie set by POST /auth/login (web app).',
        },
      },
      schemas: SCHEMAS,
      responses: { ...RESPONSES, Accepted: { description: 'Only notifications were sent - no body.' } },
    },
  };
  return cached;
}
