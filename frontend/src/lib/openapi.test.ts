import { describe, expect, test } from 'vitest';
import {
  constraintsOf,
  curlExample,
  exampleBody,
  isOpenApiDoc,
  operationsByTag,
  schemaRows,
  typeLabel,
  type OpenApiDoc,
} from './openapi';
import { mcpSnippets, mcpUrl } from './mcpConfig';

/**
 * Doku-Seite /docs: die Spezifikation kommt vom Backend (backend/src/openapi.js).
 * Hier eine kleine, handgeschriebene Spezifikation in derselben Form - das
 * Backend-Modul selbst braucht zod und ist im Frontend-CI nicht installiert.
 */
const doc: OpenApiDoc = {
  openapi: '3.1.0',
  info: { title: 'Test', version: '1.0.0' },
  servers: [{ url: '/api' }],
  tags: [{ name: 'Nodes' }, { name: 'Leer' }],
  paths: {
    '/nodes/{id}': {
      get: { tags: ['Nodes'], summary: 'Get', operationId: 'getNode', 'x-auth': 'read', responses: {} },
      patch: {
        tags: ['Nodes'],
        summary: 'Update',
        operationId: 'updateNode',
        'x-auth': 'write',
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/NodeUpdate' } } } },
        responses: {},
      },
      put: {
        tags: ['Nodes'],
        summary: 'Update (PUT alias)',
        operationId: 'updateNodePut',
        'x-auth': 'write',
        'x-alias-of': 'patch',
        responses: {},
      },
    },
    '/nodes': {
      post: {
        tags: ['Nodes'],
        summary: 'Create',
        operationId: 'createNode',
        'x-auth': 'write',
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/NodeCreate' } } } },
        responses: {},
      },
    },
  },
  components: {
    responses: {},
    schemas: {
      NodeUpdate: {
        type: 'object',
        properties: { status: { type: 'string', enum: ['active', 'error'] } },
        examples: [{ status: 'error' }],
      },
      NodeCreate: {
        type: 'object',
        required: ['name', 'status'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 200, description: 'Display name.' },
          status: { type: 'string', enum: ['active', 'error'], default: 'active' },
          parentId: { type: ['string', 'null'] },
          position: {
            type: 'object',
            required: ['x', 'y'],
            properties: { x: { type: 'number' }, y: { type: 'number' } },
          },
          fields: { type: 'object', additionalProperties: { type: 'string' } },
          tags: { type: 'array', items: { $ref: '#/components/schemas/Tag' } },
          waypoints: {
            type: 'array',
            items: { type: 'object', required: ['x'], properties: { x: { type: 'number' } } },
          },
        },
      },
    },
  },
};

describe('openapi helpers', () => {
  test('erkennt eine Spezifikation', () => {
    expect(isOpenApiDoc(doc)).toBe(true);
    expect(isOpenApiDoc({ error: 'nope' })).toBe(false);
    expect(isOpenApiDoc(null)).toBe(false);
  });

  test('gruppiert nach Tag, PUT erscheint als Alias von PATCH statt doppelt', () => {
    const groups = operationsByTag(doc);
    expect(groups.map((g) => g.name)).toEqual(['Nodes']);
    const ops = groups[0].operations.map((o) => `${o.method} ${o.path}`);
    expect(ops).toEqual(['get /nodes/{id}', 'patch /nodes/{id}', 'post /nodes']);
    expect(groups[0].operations[1].aliases).toEqual(['put']);
  });

  test('Typangaben', () => {
    expect(typeLabel({ type: ['string', 'null'] })).toBe('string | null');
    expect(typeLabel({ type: 'array', items: { $ref: '#/components/schemas/Node' } })).toBe('Node[]');
    expect(typeLabel({ type: 'object', additionalProperties: { type: 'string' } })).toBe('map<string, string>');
    expect(typeLabel({ type: 'string', format: 'date-time' })).toBe('string (date-time)');
    expect(typeLabel({ oneOf: [{ $ref: '#/x/A' }, { type: 'array', items: { $ref: '#/x/A' } }] })).toBe('A | A[]');
  });

  test('Einschränkungen', () => {
    expect(constraintsOf({ type: 'string', enum: ['a', 'b'], default: 'a', maxLength: 5 })).toEqual([
      'one of: "a", "b"',
      'default: "a"',
      'max. 5 chars',
    ]);
  });

  test('Tabellenzeilen klappen Inline-Objekte auf, Referenzen nicht', () => {
    const rows = schemaRows(doc, { $ref: '#/components/schemas/NodeCreate' });
    expect(rows.map((r) => r.name)).toEqual([
      'name',
      'status',
      'parentId',
      'position',
      'position.x',
      'position.y',
      'fields',
      'tags',
      'waypoints',
      'waypoints[].x',
    ]);
    expect(rows[0]).toMatchObject({ required: true, description: 'Display name.' });
    expect(rows.find((r) => r.name === 'position.x')).toMatchObject({ depth: 1, required: true });
    expect(rows.find((r) => r.name === 'tags')?.type).toBe('Tag[]');
    expect(rows.find((r) => r.name === 'waypoints[].x')).toMatchObject({ depth: 1, required: true });
  });

  test('Beispiel-Body: hinterlegtes Beispiel, sonst Gerüst aus Pflichtfeldern', () => {
    expect(exampleBody(doc, { $ref: '#/components/schemas/NodeUpdate' })).toEqual({ status: 'error' });
    expect(exampleBody(doc, { $ref: '#/components/schemas/NodeCreate' })).toEqual({
      name: '<name>',
      status: 'active',
    });
  });

  test('curl-Beispiel mit Key aus der Umgebung und shell-sicherem Body', () => {
    const entry = operationsByTag(doc)[0].operations[1];
    expect(curlExample(doc, entry, 'https://lab.example/')).toBe(
      [
        "curl -X PATCH 'https://lab.example/api/nodes/<id>'",
        '-H "Authorization: Bearer $LABVIZ_API_KEY"',
        "-H 'Content-Type: application/json'",
        `-d '{"status":"error"}'`,
      ].join(' \\\n  ')
    );
  });
});

describe('MCP-Schnipsel', () => {
  test('alle Clients zeigen auf /api/mcp und tragen den Key als Bearer', () => {
    const snippets = mcpSnippets('https://lab.example', 'lvk_secret');
    expect(snippets.map((s) => s.id)).toEqual(['claude-code', 'claude-desktop', 'cursor', 'vscode']);
    for (const s of snippets) {
      expect(s.code).toContain('https://lab.example/api/mcp');
      expect(s.code).toContain('Bearer lvk_secret');
    }
    // Die JSON-Konfigurationen müssen gültiges JSON sein (sie werden kopiert).
    for (const s of snippets.filter((x) => x.id !== 'claude-code')) expect(() => JSON.parse(s.code)).not.toThrow();
  });

  test('mcp-remote braucht --allow-http nur für HTTP zu fremden Hosts', () => {
    const desktop = (origin: string) => mcpSnippets(origin).find((s) => s.id === 'claude-desktop')!.code;
    expect(desktop('http://localhost:8080')).not.toContain('--allow-http');
    expect(desktop('http://192.168.1.20:8080')).toContain('--allow-http');
    expect(desktop('https://lab.example')).not.toContain('--allow-http');
    expect(mcpUrl('http://localhost:8080/')).toBe('http://localhost:8080/api/mcp');
  });
});
