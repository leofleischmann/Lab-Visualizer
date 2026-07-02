import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

let server;
let base;
let db;

before(async () => {
  const created = createApp({ dbFile: ':memory:' });
  db = created.db;
  server = created.app.listen(0);
  await new Promise((resolve) => server.on('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  db.close();
});

const api = async (method, path, body) => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};

test('health check', async () => {
  const res = await api('GET', '/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
});

test('catalog liefert Kategorien, Status und Edge-Arten', async () => {
  const res = await api('GET', '/api/meta/catalog');
  assert.equal(res.status, 200);
  for (const id of ['lxc', 'ci-runner', 'ids', 'secrets', 'storage', 'iot-device']) {
    assert.ok(res.body.categories.some((c) => c.id === id), `Kategorie ${id} fehlt`);
  }
  assert.ok(res.body.statuses.some((s) => s.id === 'maintenance'));
  assert.ok(res.body.edgeKinds.some((k) => k.id === 'ci'));
});

test('beliebige (Custom-)Kategorien werden akzeptiert', async () => {
  const res = await api('POST', '/api/nodes', {
    id: 'custom-cat',
    name: 'K8s Control Plane',
    category: 'k8s-cluster',
    status: 'maintenance',
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.category, 'k8s-cluster');
  assert.equal(res.body.status, 'maintenance');
});

test('node CRUD inkl. Custom Fields', async () => {
  const created = await api('POST', '/api/nodes', {
    id: 'test-nginx',
    name: 'nginx',
    category: 'reverse-proxy',
    status: 'running',
    ip: '192.168.2.104',
    position: { x: 10, y: 20 },
    customFields: { LXC: '118' },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.id, 'test-nginx');
  assert.equal(created.body.customFields.LXC, '118');

  const patched = await api('PATCH', '/api/nodes/test-nginx', {
    notes: '# Hallo\nMarkdown-Notiz',
    customFields: { LXC: '118', Stack: 'nginx:alpine' },
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.customFields.Stack, 'nginx:alpine');
  assert.equal(patched.body.ip, '192.168.2.104'); // PATCH lässt andere Felder unangetastet

  const fetched = await api('GET', '/api/nodes/test-nginx');
  assert.equal(fetched.body.notes, '# Hallo\nMarkdown-Notiz');
});

test('validierung: leerer Name wird abgelehnt', async () => {
  const res = await api('POST', '/api/nodes', { name: '' });
  assert.equal(res.status, 400);
  assert.ok(res.body.error);
});

test('edge CRUD und Kaskade beim Node-Löschen', async () => {
  await api('POST', '/api/nodes', { id: 'svc-a', name: 'Service A' });
  await api('POST', '/api/nodes', { id: 'svc-b', name: 'Service B' });

  const created = await api('POST', '/api/edges', {
    id: 'e-ab',
    sourceId: 'svc-a',
    targetId: 'svc-b',
    kind: 'http',
    label: 'a → b',
  });
  assert.equal(created.status, 201);
  assert.deepEqual(created.body.routing, { mode: 'auto', waypoints: [] });

  const routed = await api('PATCH', '/api/edges/e-ab', {
    routing: {
      mode: 'manual',
      waypoints: [{ x: 120, y: 80 }],
      label: { x: 140, y: 90 },
    },
  });
  assert.equal(routed.status, 200);
  assert.equal(routed.body.routing.mode, 'manual');
  assert.equal(routed.body.routing.waypoints.length, 1);

  const missing = await api('POST', '/api/edges', { sourceId: 'svc-a', targetId: 'gibts-nicht' });
  assert.equal(missing.status, 400);

  await api('DELETE', '/api/nodes/svc-b');
  const after = await api('GET', '/api/edges/e-ab');
  assert.equal(after.status, 404);
});

test('parent-Beziehung: Zyklus wird abgelehnt, Kinder werden beim Löschen umgehängt', async () => {
  await api('POST', '/api/nodes', { id: 'grp', name: 'Gruppe', category: 'group', position: { x: 100, y: 100 } });
  await api('POST', '/api/nodes', { id: 'kind', name: 'Kind', parentId: 'grp', position: { x: 30, y: 40 } });

  const cycle = await api('PATCH', '/api/nodes/grp', { parentId: 'kind' });
  assert.equal(cycle.status, 400);

  await api('DELETE', '/api/nodes/grp');
  const child = await api('GET', '/api/nodes/kind');
  assert.equal(child.status, 200);
  assert.equal(child.body.parentId, null);
  // Position bleibt absolut erhalten: 100+30 / 100+40
  assert.deepEqual(child.body.position, { x: 130, y: 140 });
});

test('bulk-Positionsupdate', async () => {
  const res = await api('POST', '/api/nodes/positions', {
    positions: [{ id: 'test-nginx', x: 500, y: 600 }],
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.updated, 1);
  const node = await api('GET', '/api/nodes/test-nginx');
  assert.deepEqual(node.body.position, { x: 500, y: 600 });
});

test('auto-layout verteilt überlappende Nodes deterministisch', async () => {
  await api('POST', '/api/nodes', {
    id: 'client-a',
    name: 'Client',
    category: 'client',
    position: { x: 0, y: 0 },
  });
  await api('POST', '/api/nodes', {
    id: 'zone-net',
    name: 'Netz',
    category: 'group',
    position: { x: 0, y: 0 },
    width: 200,
    height: 200,
  });
  await api('POST', '/api/nodes', {
    id: 'svc-c',
    name: 'Service C',
    category: 'native-service',
    parentId: 'zone-net',
    position: { x: 0, y: 0 },
  });
  await api('POST', '/api/edges', {
    id: 'e-client-c',
    sourceId: 'client-a',
    targetId: 'svc-c',
    kind: 'https',
  });

  const layout1 = await api('POST', '/api/graph/layout', {});
  assert.equal(layout1.status, 200);
  assert.ok(layout1.body.updated >= 4);

  const graph1 = (await api('GET', '/api/graph')).body;
  const layout2 = await api('POST', '/api/graph/layout', {});
  assert.equal(layout2.status, 200);
  const graph2 = (await api('GET', '/api/graph')).body;

  const pos1 = Object.fromEntries(graph1.nodes.map((n) => [n.id, n.position]));
  const pos2 = Object.fromEntries(graph2.nodes.map((n) => [n.id, n.position]));
  assert.deepEqual(pos1, pos2);

  const client = graph2.nodes.find((n) => n.id === 'client-a');
  const zone = graph2.nodes.find((n) => n.id === 'zone-net');
  assert.notDeepEqual(client.position, zone.position);
  assert.ok(zone.width >= 300);
});

test('export/import Roundtrip', async () => {
  const fresh = createApp({ dbFile: ':memory:' });
  const freshServer = fresh.app.listen(0);
  await new Promise((resolve) => freshServer.on('listening', resolve));
  const freshBase = `http://127.0.0.1:${freshServer.address().port}`;

  const post = async (path, body) => {
    const res = await fetch(`${freshBase}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.equal(res.status, 201);
    return res.json();
  };

  await post('/api/nodes', {
    id: 'zone-a',
    name: 'Zone A',
    category: 'group',
    position: { x: 0, y: 0 },
    width: 400,
    height: 300,
  });
  await post('/api/nodes', {
    id: 'svc-a',
    name: 'Service A',
    category: 'native-service',
    parentId: 'zone-a',
    position: { x: 40, y: 50 },
  });
  await post('/api/nodes', { id: 'svc-b', name: 'Service B', category: 'native-service' });
  await post('/api/edges', {
    id: 'e-a-b',
    sourceId: 'svc-a',
    targetId: 'svc-b',
    kind: 'http',
    label: 'a → b',
  });

  const graph = await (await fetch(`${freshBase}/api/graph`)).json();
  assert.equal(graph.nodes.length, 3);
  assert.equal(graph.edges.length, 1);

  const seen = new Set();
  for (const n of graph.nodes) {
    if (n.parentId) assert.ok(seen.has(n.parentId), `Parent ${n.parentId} muss vor ${n.id} kommen`);
    seen.add(n.id);
  }

  const exported = await (await fetch(`${freshBase}/api/graph/export`)).json();
  const importRes = await fetch(`${base}/api/graph/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'replace', nodes: exported.nodes, edges: exported.edges }),
  });
  assert.equal(importRes.status, 200);
  const counts = await importRes.json();
  assert.equal(counts.nodes, graph.nodes.length);
  assert.equal(counts.edges, graph.edges.length);

  freshServer.close();
  fresh.db.close();
});
