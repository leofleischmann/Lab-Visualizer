import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshApp, bootstrapUser } from './helpers.js';
import { TOOLS } from '../src/mcp/tools.js';
import { LATEST_PROTOCOL_VERSION } from '../src/mcp/server.js';

/**
 * MCP-Server (/api/mcp): Transport, Lifecycle, Scopes und Tools.
 *
 * Die Interoperabilität mit echten Clients hängt an genau diesen Details
 * (Statuscodes, JSON-RPC-Fehlercodes, isError statt Protokollfehler).
 *
 * Beeinflusst: backend/src/mcp/, backend/src/routes/mcp.js.
 */

async function setup() {
  const app = await freshApp();
  const key = async (scope) =>
    (await app.call('POST', '/api/api-keys', { name: `mcp-${scope}`, scope })).body.token;
  const writeKey = await key('write');
  const readKey = await key('read');
  let nextId = 1;
  /** Eine JSON-RPC-Nachricht senden; `token` = API-Key (null = keiner). */
  const rpc = (message, { token = writeKey, headers = {} } = {}) =>
    app.request('POST', '/api/mcp', {
      headers: {
        Accept: 'application/json, text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: message,
    });
  const call = async (method, params, options) =>
    rpc({ jsonrpc: '2.0', id: nextId++, method, params }, options);
  const tool = async (name, args, options) => {
    const res = await call('tools/call', { name, arguments: args }, options);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return res.body.result;
  };
  return { app, writeKey, readKey, rpc, call, tool };
}

test('mcp: nur mit API-Key - weder anonym noch per Session-Cookie', async () => {
  const { app, rpc } = await setup();
  try {
    const anon = await rpc({ jsonrpc: '2.0', id: 1, method: 'ping' }, { token: null });
    assert.equal(anon.status, 401);
    assert.match(anon.headers.get('www-authenticate'), /^Bearer /);

    const cookie = await rpc({ jsonrpc: '2.0', id: 1, method: 'ping' }, { token: null, headers: { Cookie: app.cookie } });
    assert.equal(cookie.status, 401);

    const invalid = await rpc({ jsonrpc: '2.0', id: 1, method: 'ping' }, { token: 'lvk_falsch' });
    assert.equal(invalid.status, 401);
  } finally {
    app.close();
  }
});

test('mcp: initialize handelt die Version aus und liefert Fähigkeiten und Hinweise', async () => {
  const { app, call } = await setup();
  try {
    const res = await call('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'test', version: '1' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.jsonrpc, '2.0');
    const { result } = res.body;
    assert.equal(result.protocolVersion, '2025-06-18');
    assert.deepEqual(result.capabilities, { tools: { listChanged: false } });
    assert.equal(result.serverInfo.name, 'lab-visualizer');
    assert.match(result.instructions, /get_catalog/);
    assert.equal(res.headers.get('mcp-session-id'), null, 'zustandslos: keine Session-ID');

    // Unbekannte Version -> der Server nennt seine neueste.
    const future = await call('initialize', { protocolVersion: '2099-01-01', capabilities: {} });
    assert.equal(future.body.result.protocolVersion, LATEST_PROTOCOL_VERSION);
  } finally {
    app.close();
  }
});

test('mcp: Transportdetails - 202, 405, Batch, Parse-Fehler, Versions-Header, Origin', async () => {
  const { app, rpc, writeKey } = await setup();
  try {
    const note = await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' });
    assert.equal(note.status, 202);
    assert.equal(note.body, null);

    for (const method of ['GET', 'DELETE']) {
      const res = await app.request(method, '/api/mcp', { headers: { Authorization: `Bearer ${writeKey}` } });
      assert.equal(res.status, 405, method);
      assert.equal(res.headers.get('allow'), 'POST');
    }

    const batch = await rpc([
      { jsonrpc: '2.0', id: 'a', method: 'ping' },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 'b', method: 'unknown/method' },
    ]);
    assert.equal(batch.status, 200);
    assert.equal(batch.body.length, 2);
    assert.deepEqual(batch.body[0], { jsonrpc: '2.0', id: 'a', result: {} });
    assert.equal(batch.body[1].error.code, -32601);

    const parse = await app.request('POST', '/api/mcp', {
      headers: { Authorization: `Bearer ${writeKey}`, 'Content-Type': 'application/json' },
      body: '{"jsonrpc": "2.0", kaputt',
    });
    assert.equal(parse.status, 400);
    assert.equal(parse.body.error.code, -32700);

    const invalid = await rpc({ id: 1, method: 'ping' });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.error.code, -32600);

    const version = await rpc(
      { jsonrpc: '2.0', id: 1, method: 'ping' },
      { headers: { 'MCP-Protocol-Version': '1999-01-01' } }
    );
    assert.equal(version.status, 400);
    const knownVersion = await rpc(
      { jsonrpc: '2.0', id: 1, method: 'ping' },
      { headers: { 'MCP-Protocol-Version': '2025-06-18' } }
    );
    assert.equal(knownVersion.status, 200);

    // DNS-Rebinding: ein fremder Browser-Origin wird abgewiesen.
    const evil = await rpc({ jsonrpc: '2.0', id: 1, method: 'ping' }, { headers: { Origin: 'https://evil.example' } });
    assert.equal(evil.status, 403);
  } finally {
    app.close();
  }
});

test('mcp: read-Key sieht nur lesende Tools und kann keine schreibenden aufrufen', async () => {
  const { app, call, tool, readKey } = await setup();
  try {
    const all = (await call('tools/list', {})).body.result.tools;
    assert.equal(all.length, TOOLS.length);
    for (const t of all) {
      assert.equal(t.inputSchema.type, 'object', t.name);
      assert.equal(typeof t.description, 'string');
      assert.equal(typeof t.annotations.readOnlyHint, 'boolean');
    }

    const readable = (await call('tools/list', {}, { token: readKey })).body.result.tools;
    const readNames = TOOLS.filter((t) => t.scope === 'read').map((t) => t.name);
    assert.deepEqual(readable.map((t) => t.name), readNames);
    assert.ok(readable.every((t) => t.annotations.readOnlyHint === true));

    const init = await call('initialize', { protocolVersion: '2025-06-18', capabilities: {} }, { token: readKey });
    assert.match(init.body.result.instructions, /read-only/);

    const denied = await tool('create_node', { name: 'X' }, { token: readKey });
    assert.equal(denied.isError, true);
    assert.equal(denied.structuredContent.code, 'insufficient_scope');
    assert.equal(app.db.prepare("SELECT count(*) AS c FROM nodes WHERE name = 'X'").get().c, 0);

    assert.equal((await tool('list_projects', {}, { token: readKey })).isError, undefined);
  } finally {
    app.close();
  }
});

test('mcp: Tools bauen und lesen einen Graphen wie die REST-API', async () => {
  const { app, tool, call } = await setup();
  try {
    const { project } = (await tool('create_project', { name: 'Agent', template: 'empty' })).structuredContent;
    const { views } = (await tool('get_project', { projectId: project.id })).structuredContent;
    assert.equal(views.length, 1);
    const root = views[0];

    const catalog = (await tool('get_catalog', { projectId: project.id })).structuredContent;
    assert.ok(catalog.categories.some((c) => c.id === 'hypervisor'));
    assert.equal(catalog.inactive, undefined, 'die inaktiven Definitionen braucht nur die UI');

    const zone = await tool('create_node', {
      id: 'zone',
      name: 'Rack',
      category: 'group',
      viewId: root.id,
      width: 600,
      height: 400,
    });
    assert.equal(zone.isError, undefined, JSON.stringify(zone));
    await tool('create_node', { id: 'pve', name: 'Proxmox', category: 'hypervisor', parentId: 'zone', fields: { ip: '10.0.0.2', platform: 'Proxmox VE' } });
    await tool('create_node', { id: 'db', name: 'Postgres', category: 'database', viewId: root.id });
    const edge = await tool('create_edge', { id: 'e1', sourceId: 'db', targetId: 'pve', kind: 'tcp', label: ':5432' });
    assert.equal(edge.structuredContent.edge.viewId, root.id);

    // Ergebnis auch als Text (Rückwärtskompatibilität mit älteren Clients).
    const graph = await tool('get_graph', { viewId: root.id });
    assert.deepEqual(JSON.parse(graph.content[0].text), graph.structuredContent);
    assert.equal(graph.structuredContent.view.id, root.id);
    assert.deepEqual(graph.structuredContent.nodes.map((n) => n.id).sort(), ['db', 'pve', 'zone']);
    assert.equal(graph.structuredContent.nodes.find((n) => n.id === 'pve').viewId, root.id, 'Kind erbt die Ebene');

    const found = (await tool('search_nodes', { query: '10.0.0.2' })).structuredContent;
    assert.deepEqual(found.nodes.map((n) => n.id), ['pve']);
    assert.equal(found.truncated, false);
    const limited = (await tool('search_nodes', { projectId: project.id, limit: 2 })).structuredContent;
    assert.deepEqual([limited.nodes.length, limited.total, limited.truncated], [2, 3, true]);

    const node = (await tool('get_node', { nodeId: 'pve' })).structuredContent;
    assert.equal(node.edges.length, 1);

    // fields wird als Ganzes ersetzt - wie bei PATCH /nodes/:id.
    const updated = (await tool('update_node', { nodeId: 'pve', status: 'error', fields: { ip: '10.0.0.3' } }))
      .structuredContent.node;
    assert.equal(updated.status, 'error');
    assert.deepEqual(updated.fields, { ip: '10.0.0.3' });

    const content = (await tool('get_project', { projectId: project.id, includeContent: true })).structuredContent;
    assert.equal(content.nodes.length, 3);
    assert.equal(content.edges.length, 1);
    assert.equal(content.views[0].nodeCount, 3);

    assert.deepEqual((await tool('auto_layout', { viewId: root.id })).structuredContent, { updated: 3 });

    const level = (await tool('create_view', { name: 'Detail', parentId: root.id })).structuredContent.view;
    await tool('update_node', { nodeId: 'db', linkedViewId: level.id });
    assert.deepEqual((await tool('delete_view', { viewId: level.id })).structuredContent.deleted, { views: 1, nodes: 0 });

    assert.deepEqual((await tool('delete_edge', { edgeId: 'e1' })).structuredContent, { deleted: { edge: 'e1' } });
    await tool('delete_node', { nodeId: 'zone' });
    // Kinder wandern zum Großelternknoten, statt mitgelöscht zu werden.
    assert.equal((await tool('get_node', { nodeId: 'pve' })).structuredContent.node.parentId, null);

    // Unbekanntes Tool ist ein Protokollfehler (-32602), kein Tool-Fehler.
    const unknown = await call('tools/call', { name: 'gibts_nicht', arguments: {} });
    assert.equal(unknown.body.error.code, -32602);
  } finally {
    app.close();
  }
});

test('mcp: Fehler kommen als isError mit Status, Code und Details zum Agenten', async () => {
  const { app, tool } = await setup();
  const other = bootstrapUser(app.db);
  const previous = process.env.MAX_PROJECTS_PER_USER;
  try {
    const invalid = await tool('create_node', { name: '', status: 'kaputt' });
    assert.equal(invalid.isError, true);
    assert.equal(invalid.structuredContent.status, 400);
    assert.deepEqual(invalid.structuredContent.details.map((d) => d.path).sort(), ['name', 'status']);
    assert.match(invalid.content[0].text, /Validation failed/);

    // Fremde Daten verhalten sich wie nicht vorhanden.
    const otherView = (await app.call('GET', '/api/views', null, other.cookie)).body[0];
    await app.call('POST', '/api/nodes', { id: 'fremd', name: 'Fremd', viewId: otherView.id }, other.cookie);
    const foreign = await tool('get_node', { nodeId: 'fremd' });
    assert.equal(foreign.isError, true);
    assert.equal(foreign.structuredContent.status, 404);
    assert.equal((await tool('delete_node', { nodeId: 'fremd' })).structuredContent.status, 404);

    // Instanz-Limits greifen genauso wie über REST.
    process.env.MAX_PROJECTS_PER_USER = '1';
    const limited = await tool('create_project', { name: 'Zu viel' });
    assert.equal(limited.isError, true);
    assert.equal(limited.structuredContent.code, 'limit_reached');
  } finally {
    if (previous === undefined) delete process.env.MAX_PROJECTS_PER_USER;
    else process.env.MAX_PROJECTS_PER_USER = previous;
    app.close();
  }
});
