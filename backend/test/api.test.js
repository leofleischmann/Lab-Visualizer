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

test('routing: labelT wird gespeichert, Auto-Layout setzt Routing zurück', async () => {
  await api('POST', '/api/nodes', { id: 'rt-a', name: 'RT A' });
  await api('POST', '/api/nodes', { id: 'rt-b', name: 'RT B' });
  await api('POST', '/api/edges', { id: 'e-rt', sourceId: 'rt-a', targetId: 'rt-b' });

  const routed = await api('PATCH', '/api/edges/e-rt', {
    routing: { mode: 'manual', waypoints: [{ x: 10, y: 20 }], labelT: 0.25 },
  });
  assert.equal(routed.status, 200);
  assert.equal(routed.body.routing.labelT, 0.25);

  const invalid = await api('PATCH', '/api/edges/e-rt', {
    routing: { mode: 'manual', waypoints: [], labelT: 1.5 },
  });
  assert.equal(invalid.status, 400);

  const layout = await api('POST', '/api/graph/layout', {});
  assert.equal(layout.status, 200);
  const after = await api('GET', '/api/edges/e-rt');
  assert.equal(after.body.routing.mode, 'auto');
  assert.deepEqual(after.body.routing.waypoints, []);
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

// ── Ebenen (Views) ──────────────────────────────────────────────

/** Startet eine frische, isolierte App und liefert einen api-Helper + Cleanup. */
async function freshApp() {
  const created = createApp({ dbFile: ':memory:' });
  const server = created.app.listen(0);
  await new Promise((resolve) => server.on('listening', resolve));
  const b = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body) => {
    const res = await fetch(`${b}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  return { call, close: () => { server.close(); created.db.close(); } };
}

test('views: Root existiert, CRUD, Hierarchie, Cascade-Delete, letzte Ebene geschützt', async () => {
  const { call, close } = await freshApp();
  try {
    const roots = await call('GET', '/api/views');
    assert.equal(roots.status, 200);
    assert.equal(roots.body.length, 1, 'Root-Ebene wird automatisch angelegt');
    const rootId = roots.body[0].id;
    assert.equal(roots.body[0].parentId, null);

    const child = await call('POST', '/api/views', { id: 'v-child', name: 'Server-Intern', parentId: rootId });
    assert.equal(child.status, 201);
    const grand = await call('POST', '/api/views', { id: 'v-grand', name: 'Tiefer', parentId: 'v-child' });
    assert.equal(grand.status, 201);
    assert.equal((await call('GET', '/api/views')).body.length, 3);

    // Zyklus: Root unter Enkel hängen → 400
    const cycle = await call('PATCH', `/api/views/${rootId}`, { parentId: 'v-grand' });
    assert.equal(cycle.status, 400);

    // Node in der Kind-Ebene → wird beim Löschen mitkaskadiert
    await call('POST', '/api/nodes', { id: 'n-in-child', name: 'X', viewId: 'v-child' });
    const del = await call('DELETE', '/api/views/v-child');
    assert.equal(del.status, 200);
    assert.equal(del.body.views, 2, 'Kind + Enkel entfernt');
    assert.equal(del.body.nodes, 1);
    assert.equal((await call('GET', '/api/views')).body.length, 1);
    assert.equal((await call('GET', '/api/nodes/n-in-child')).status, 404);

    // Letzte Ebene kann nicht gelöscht werden
    const delLast = await call('DELETE', `/api/views/${rootId}`);
    assert.equal(delLast.status, 400);
  } finally {
    close();
  }
});

test('views: Graph pro Ebene, Drill-Link, Kanten nur innerhalb einer Ebene', async () => {
  const { call, close } = await freshApp();
  try {
    const rootId = (await call('GET', '/api/views')).body[0].id;
    await call('POST', '/api/views', { id: 'v-detail', name: 'Detail', parentId: rootId });

    await call('POST', '/api/nodes', { id: 'top-1', name: 'Server', viewId: rootId, linkedViewId: 'v-detail' });
    await call('POST', '/api/nodes', { id: 'top-2', name: 'Router', viewId: rootId });
    await call('POST', '/api/nodes', { id: 'det-1', name: 'nginx', viewId: 'v-detail' });
    await call('POST', '/api/nodes', { id: 'det-2', name: 'app', viewId: 'v-detail' });

    const rootGraph = (await call('GET', `/api/graph?viewId=${rootId}`)).body;
    assert.equal(rootGraph.nodes.length, 2);
    assert.ok(rootGraph.nodes.every((n) => n.viewId === rootId));
    const detailGraph = (await call('GET', '/api/graph?viewId=v-detail')).body;
    assert.equal(detailGraph.nodes.length, 2);

    // Drill-Link wird gespeichert
    const server = (await call('GET', '/api/nodes/top-1')).body;
    assert.equal(server.linkedViewId, 'v-detail');

    // Kante zwischen zwei Ebenen → 400
    const cross = await call('POST', '/api/edges', { sourceId: 'top-1', targetId: 'det-1' });
    assert.equal(cross.status, 400);
    // Kante innerhalb einer Ebene → 201, erbt die Ebene
    const within = await call('POST', '/api/edges', { id: 'e-det', sourceId: 'det-1', targetId: 'det-2' });
    assert.equal(within.status, 201);
    assert.equal(within.body.viewId, 'v-detail');
    assert.equal((await call('GET', '/api/graph?viewId=v-detail')).body.edges.length, 1);
    assert.equal((await call('GET', `/api/graph?viewId=${rootId}`)).body.edges.length, 0);
  } finally {
    close();
  }
});

test('projects: Default existiert, getrennte Projekte, Cascade-Delete, letztes geschützt', async () => {
  const { call, close } = await freshApp();
  try {
    const projects = await call('GET', '/api/projects');
    assert.equal(projects.status, 200);
    assert.equal(projects.body.length, 1, 'Default-Projekt wird automatisch angelegt');
    const p1 = projects.body[0].id;

    // Neues Projekt hat eine eigene Root-Ebene und ist von p1 getrennt
    const p2 = await call('POST', '/api/projects', { id: 'work', name: 'Arbeit' });
    assert.equal(p2.status, 201);
    const viewsP2 = (await call('GET', '/api/views?projectId=work')).body;
    assert.equal(viewsP2.length, 1, 'neues Projekt startet mit einer Root-Ebene');
    assert.equal(viewsP2[0].projectId, 'work');
    const viewsP1 = (await call('GET', `/api/views?projectId=${p1}`)).body;
    assert.ok(viewsP1.every((v) => v.projectId === p1));

    // Node in Projekt Arbeit → taucht nicht in Projekt-1-Ebenen auf
    await call('POST', '/api/nodes', { id: 'work-node', name: 'W', viewId: viewsP2[0].id });
    const p1Nodes = (await call('GET', `/api/nodes?projectId=${p1}`)).body;
    assert.ok(!p1Nodes.some((n) => n.id === 'work-node'), 'Projekte sind getrennt');
    const p2Nodes = (await call('GET', '/api/nodes?projectId=work')).body;
    assert.ok(p2Nodes.some((n) => n.id === 'work-node'));

    // Projekt löschen kaskadiert Ebenen + Nodes
    const del = await call('DELETE', '/api/projects/work');
    assert.equal(del.status, 200);
    assert.equal(del.body.nodes, 1);
    assert.equal((await call('GET', '/api/nodes/work-node')).status, 404);
    assert.equal((await call('GET', '/api/projects')).body.length, 1);

    // Letztes Projekt kann nicht gelöscht werden
    assert.equal((await call('DELETE', `/api/projects/${p1}`)).status, 400);
  } finally {
    close();
  }
});

test('projects: Export/Import erhält Projekte + Ebenen', async () => {
  const a = await freshApp();
  const b = await freshApp();
  try {
    await a.call('POST', '/api/projects', { id: 'work', name: 'Arbeit' });
    const workView = (await a.call('GET', '/api/views?projectId=work')).body[0].id;
    await a.call('POST', '/api/nodes', { id: 'w1', name: 'W1', viewId: workView });

    const exported = (await a.call('GET', '/api/graph/export')).body;
    assert.ok(exported.projects.length >= 2);

    const imp = await b.call('POST', '/api/graph/import', { mode: 'replace', ...exported });
    assert.equal(imp.status, 200);
    assert.equal(imp.body.projects, exported.projects.length);
    const bProjects = (await b.call('GET', '/api/projects')).body;
    assert.ok(bProjects.some((p) => p.id === 'work'));
    const bWorkNode = (await b.call('GET', '/api/nodes/w1')).body;
    assert.equal((await b.call('GET', `/api/views/${bWorkNode.viewId}`)).body.projectId, 'work');
  } finally {
    a.close();
    b.close();
  }
});

test('views: Export/Import erhält Ebenen-Hierarchie', async () => {
  const a = await freshApp();
  const b = await freshApp();
  try {
    const rootId = (await a.call('GET', '/api/views')).body[0].id;
    await a.call('POST', '/api/views', { id: 'v-sys', name: 'Systeme', parentId: rootId });
    await a.call('POST', '/api/nodes', { id: 'host', name: 'Host', viewId: 'v-sys', linkedViewId: 'v-sys' });

    const exported = (await a.call('GET', '/api/graph/export')).body;
    assert.ok(exported.views.length >= 2);

    const imp = await b.call('POST', '/api/graph/import', { mode: 'replace', ...exported });
    assert.equal(imp.status, 200);
    assert.equal(imp.body.views, exported.views.length);

    const views = (await b.call('GET', '/api/views')).body;
    assert.ok(views.some((v) => v.id === 'v-sys' && v.parentId === rootId));
    const host = (await b.call('GET', '/api/nodes/host')).body;
    assert.equal(host.viewId, 'v-sys');
    assert.equal(host.linkedViewId, 'v-sys');
  } finally {
    a.close();
    b.close();
  }
});
