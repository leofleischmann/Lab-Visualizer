import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { freshApp } from './helpers.js';
import { getOpenApiDocument, REQUEST_SCHEMAS, EXAMPLES } from '../src/openapi.js';
import { toJsonSchema } from '../src/jsonSchema.js';
import { TOOLS } from '../src/mcp/tools.js';

/**
 * Die OpenAPI-Spezifikation darf nicht von der API wegdriften:
 *   1. jede Route der Mount-Tabelle (app.js) ist dokumentiert - und umgekehrt,
 *   2. jede $ref zeigt auf etwas,
 *   3. die handgeschriebenen Antwortschemas haben genau die Felder, die die API
 *      tatsächlich liefert.
 *
 * Beeinflusst: backend/src/openapi.js, backend/src/jsonSchema.js, backend/src/app.js.
 */

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

/** Alle (Methode, Pfad)-Paare der Router - Pfade im OpenAPI-Format relativ zu /api. */
function routesOf(mounts) {
  const routes = new Set();
  for (const { path, router } of mounts) {
    for (const layer of router.stack) {
      if (!layer.route) continue;
      const full = `${path}${layer.route.path === '/' ? '' : layer.route.path}`
        .replace(/^\/api/, '')
        .replace(/:([A-Za-z]+)/g, '{$1}');
      for (const method of Object.keys(layer.route.methods)) {
        // router.all('/') in routes/mcp.js ist nur die 405-Antwort für GET/DELETE.
        if (method === '_all') continue;
        routes.add(`${method} ${full}`);
      }
    }
  }
  return routes;
}

test('openapi: jede Route ist dokumentiert und jede dokumentierte Route existiert', async () => {
  const app = await freshApp();
  try {
    const actual = routesOf(app.mounts);
    const documented = new Set();
    for (const [path, item] of Object.entries(getOpenApiDocument().paths)) {
      for (const method of METHODS) if (item[method]) documented.add(`${method} ${path}`);
    }
    const undocumented = [...actual].filter((r) => !documented.has(r));
    const phantom = [...documented].filter((r) => !actual.has(r));
    assert.deepEqual(undocumented, [], 'Routen ohne Doku in openapi.js');
    assert.deepEqual(phantom, [], 'Doku ohne Route');
  } finally {
    app.close();
  }
});

test('openapi: Struktur - $refs lösen auf, operationIds eindeutig, Sicherheit gesetzt', () => {
  const doc = getOpenApiDocument();
  assert.equal(doc.openapi, '3.1.0');
  const refs = [...JSON.stringify(doc).matchAll(/"\$ref":"#\/components\/(schemas|responses)\/([^"]+)"/g)];
  assert.ok(refs.length > 50);
  for (const [, kind, name] of refs) {
    assert.ok(doc.components[kind][name], `$ref ins Leere: ${kind}/${name}`);
  }
  const ids = new Set();
  for (const item of Object.values(doc.paths)) {
    for (const method of METHODS) {
      const op = item[method];
      if (!op) continue;
      assert.ok(op.operationId && !ids.has(op.operationId), `operationId doppelt/fehlt: ${op.operationId}`);
      ids.add(op.operationId);
      assert.ok(['public', 'read', 'write', 'session', 'apiKey'].includes(op['x-auth']));
      assert.ok(Array.isArray(op.security));
      assert.ok(doc.tags.some((t) => t.name === op.tags[0]), `unbekannter Tag ${op.tags[0]}`);
    }
  }
  // Die MCP-Tools in der Doku sind genau die des Servers.
  assert.deepEqual(
    doc.paths['/mcp'].post['x-mcp'].tools.map((t) => t.name),
    TOOLS.map((t) => t.name)
  );
});

test('openapi: wird öffentlich unter /api/openapi.json ausgeliefert', async () => {
  const app = await freshApp();
  try {
    const res = await app.request('GET', '/api/openapi.json');
    assert.equal(res.status, 200);
    assert.equal(res.body.info.title, 'Lab Visualizer API');
    assert.equal(res.body.servers[0].url, '/api');
  } finally {
    app.close();
  }
});

test('openapi: Antwortschemas haben genau die Felder der echten Antworten', async () => {
  const app = await freshApp();
  const { schemas } = getOpenApiDocument().components;
  /** Felder einer echten Antwort gegen das dokumentierte Schema prüfen. */
  const matches = (name, value) => {
    const schema = schemas[name];
    const keys = Object.keys(value).sort();
    assert.deepEqual(keys, Object.keys(schema.properties).filter((k) => k in value).sort(), `${name}: undokumentierte Felder`);
    for (const key of schema.required ?? []) assert.ok(key in value, `${name}: Pflichtfeld ${key} fehlt`);
  };
  try {
    const project = (await app.call('POST', '/api/projects', { name: 'Doku', template: 'homelab' })).body;
    matches('Project', project);
    const views = (await app.call('GET', `/api/views?projectId=${project.id}`)).body;
    matches('View', views[0]);
    const nodes = (await app.call('GET', `/api/nodes?projectId=${project.id}`)).body;
    matches('Node', nodes[0]);
    const edges = (await app.call('GET', `/api/edges?projectId=${project.id}`)).body;
    matches('Edge', edges[0]);
    matches('Routing', edges[0].routing);
    matches('Graph', (await app.call('GET', `/api/graph?viewId=${views[0].id}`)).body);
    matches('Catalog', (await app.call('GET', `/api/projects/${project.id}/catalog`)).body);
    matches('Me', (await app.call('GET', '/api/auth/me')).body);
    matches('Limits', (await app.call('GET', '/api/auth/me')).body.limits);
    matches('ShareLinkCreated', (await app.call('POST', `/api/projects/${project.id}/shares`, {})).body);
    matches('ShareLink', (await app.call('GET', `/api/projects/${project.id}/shares`)).body[0]);
    matches('ApiKeyCreated', (await app.call('POST', '/api/api-keys', { name: 'Doku' })).body);
    matches('ApiKey', (await app.call('GET', '/api/api-keys')).body[0]);
    matches('Export', (await app.call('GET', `/api/graph/export?projectId=${project.id}`)).body);
    matches('Health', (await app.call('GET', '/api/health')).body);
    matches('Template', (await app.call('GET', '/api/meta/templates')).body.templates[0]);
    matches('Pack', (await app.call('GET', '/api/meta/packs')).body.packs[0]);
    matches('DeleteResult', (await app.call('DELETE', `/api/projects/${project.id}`)).body);
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    matches('Asset', (await app.call('POST', '/api/assets', { name: 'p.png', dataUrl: png })).body);
    matches('Error', (await app.call('GET', '/api/nodes/gibts-nicht')).body);
  } finally {
    app.close();
  }
});

test('openapi: jedes Beispiel ist ein gültiger Request (Zod)', () => {
  assert.deepEqual(Object.keys(EXAMPLES).sort(), Object.keys(REQUEST_SCHEMAS).sort(), 'Beispiel fehlt');
  for (const [name, example] of Object.entries(EXAMPLES)) {
    const result = REQUEST_SCHEMAS[name].safeParse(example);
    assert.ok(result.success, `${name}: ${JSON.stringify(result.error?.issues)}`);
  }
});

test('jsonSchema: Pflichtfelder, Defaults, null und unbekannte Typen', () => {
  const schema = toJsonSchema(
    z.object({
      name: z.string().min(1).describe('Name'),
      mode: z.enum(['a', 'b']).nullable().optional(),
      count: z.number().int().positive().default(1),
      tags: z.array(z.string()).max(3),
    })
  );
  assert.deepEqual(schema.required, ['name', 'tags']);
  assert.equal(schema.properties.name.description, 'Name');
  assert.deepEqual(schema.properties.mode, { type: ['string', 'null'], enum: ['a', 'b', null] });
  assert.deepEqual(schema.properties.count, { type: 'integer', exclusiveMinimum: 0, default: 1 });
  assert.equal(schema.properties.tags.maxItems, 3);
  assert.equal(schema.additionalProperties, false);
  // Ein neuer Zod-Typ in validation.js soll laut scheitern, nicht still verschwinden.
  assert.throws(() => toJsonSchema(z.object({ when: z.date() })), /unsupported Zod type "ZodDate"/);
});
