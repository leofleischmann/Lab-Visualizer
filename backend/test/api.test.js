import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createApp } from '../src/app.js';
import { createSession } from '../src/auth.js';
import * as store from '../src/store.js';

let server;
let base;
let db;
let authCookie;

/**
 * Legt einen Nutzer mit genau EINEM leeren Projekt (+ Root-Ebene) an — ohne den
 * Beispiel-Seed — und öffnet dafür eine Session. So starten die Tests vom selben
 * „leeren" Zustand wie vor der Account-Umstellung. Liefert das Cookie.
 */
function bootstrapUser(database) {
  const userId = crypto.randomUUID();
  const ts = new Date().toISOString();
  database
    .prepare('INSERT INTO users (id, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(userId, `u-${userId.slice(0, 8)}@test.local`, 'scrypt$1$00$00', ts, ts);
  store.createProject(database, userId, { name: 'Test' });
  const { token } = createSession(database, userId);
  return { userId, cookie: `sid=${token}` };
}

before(async () => {
  const created = createApp({ dbFile: ':memory:' });
  db = created.db;
  authCookie = bootstrapUser(db).cookie;
  server = created.app.listen(0);
  await new Promise((resolve) => server.on('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  db.close();
});

const api = async (method, path, body) => {
  const headers = { Cookie: authCookie };
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
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
  const a = await freshApp();
  const b = await freshApp();
  try {
    const post = async (path, body) => {
      const res = await a.call('POST', path, body);
      assert.equal(res.status, 201);
      return res.body;
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

    const graph = (await a.call('GET', '/api/graph')).body;
    assert.equal(graph.nodes.length, 3);
    assert.equal(graph.edges.length, 1);

    const seen = new Set();
    for (const n of graph.nodes) {
      if (n.parentId) assert.ok(seen.has(n.parentId), `Parent ${n.parentId} muss vor ${n.id} kommen`);
      seen.add(n.id);
    }

    const exported = (await a.call('GET', '/api/graph/export')).body;
    const importRes = await b.call('POST', '/api/graph/import', {
      mode: 'replace',
      nodes: exported.nodes,
      edges: exported.edges,
    });
    assert.equal(importRes.status, 200);
    assert.equal(importRes.body.nodes, graph.nodes.length);
    assert.equal(importRes.body.edges, graph.edges.length);
  } finally {
    a.close();
    b.close();
  }
});

// ── Ebenen (Views) ──────────────────────────────────────────────

/**
 * Startet eine frische, isolierte App mit einem angemeldeten Nutzer (ein leeres
 * Projekt + Root-Ebene) und liefert einen authentifizierten api-Helper + Cleanup.
 */
async function freshApp() {
  const created = createApp({ dbFile: ':memory:' });
  const { cookie, userId } = bootstrapUser(created.db);
  const server = created.app.listen(0);
  await new Promise((resolve) => server.on('listening', resolve));
  const b = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body, cookieOverride = cookie) => {
    const headers = {};
    if (cookieOverride) headers.Cookie = cookieOverride;
    if (body) headers['Content-Type'] = 'application/json';
    const res = await fetch(`${b}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  return { call, base: b, db: created.db, cookie, userId, close: () => { server.close(); created.db.close(); } };
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

test('Suche: findet nach VLAN und behandelt Wildcards literal', async () => {
  const { call, close } = await freshApp();
  try {
    const projectId = (await call('GET', '/api/projects')).body[0].id;
    await call('POST', '/api/nodes', { id: 's-vlan', name: 'Switch', vlan: 'VLAN20' });
    await call('POST', '/api/nodes', { id: 's-pct', name: '100% Uptime Box' });
    await call('POST', '/api/nodes', { id: 's-other', name: 'Anderer Host', vlan: 'VLAN99' });

    // VLAN ist durchsuchbar
    const byVlan = (await call('GET', '/api/nodes?q=VLAN20')).body;
    assert.deepEqual(byVlan.map((n) => n.id), ['s-vlan']);

    // '%' wird literal gesucht, nicht als Wildcard (sonst würde es alles matchen)
    const byPercent = (await call('GET', `/api/nodes?q=${encodeURIComponent('100%')}`)).body;
    assert.deepEqual(byPercent.map((n) => n.id), ['s-pct']);

    // projektweite Suche liefert dieselben Treffer
    const global = (await call('GET', `/api/nodes?projectId=${projectId}&q=VLAN`)).body;
    assert.equal(global.length, 2);
  } finally {
    close();
  }
});

test('Suche: wiederholter Query-Parameter (Array) crasht nicht', async () => {
  const { call, close } = await freshApp();
  try {
    await call('POST', '/api/nodes', { id: 'arr1', name: 'Alpha' });
    const res = await call('GET', '/api/nodes?q=Alpha&q=Beta');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
  } finally {
    close();
  }
});

test('views: Parent aus anderem Projekt wird abgelehnt', async () => {
  const { call, close } = await freshApp();
  try {
    const rootA = (await call('GET', '/api/views')).body[0].id;
    await call('POST', '/api/projects', { id: 'proj-b', name: 'Projekt B' });
    const rootB = (await call('GET', '/api/views?projectId=proj-b')).body[0].id;

    const res = await call('PATCH', `/api/views/${rootB}`, { parentId: rootA });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /selben Projekt/);
  } finally {
    close();
  }
});

test('updateNode: Ebenenwechsel nimmt Nachfahren mit und migriert Kanten', async () => {
  const { call, close } = await freshApp();
  try {
    const rootId = (await call('GET', '/api/views')).body[0].id;
    await call('POST', '/api/views', { id: 'v-b', name: 'Ebene B', parentId: rootId });

    // Zone mit Kind + Kante innerhalb; plus externer Node in Root mit Kante zur Zone.
    await call('POST', '/api/nodes', { id: 'zone', name: 'Zone', category: 'group', viewId: rootId });
    await call('POST', '/api/nodes', { id: 'child', name: 'Kind', parentId: 'zone', viewId: rootId });
    await call('POST', '/api/nodes', { id: 'ext', name: 'Extern', viewId: rootId });
    await call('POST', '/api/edges', { id: 'e-in', sourceId: 'zone', targetId: 'child' });
    await call('POST', '/api/edges', { id: 'e-out', sourceId: 'zone', targetId: 'ext' });

    // Zone in Ebene B verschieben.
    const res = await call('PATCH', '/api/nodes/zone', { viewId: 'v-b' });
    assert.equal(res.status, 200);
    assert.equal(res.body.viewId, 'v-b');

    // Kind wandert mit.
    assert.equal((await call('GET', '/api/nodes/child')).body.viewId, 'v-b');
    // Externer Node bleibt in Root.
    assert.equal((await call('GET', '/api/nodes/ext')).body.viewId, rootId);

    // Interne Kante wandert nach B, kreuzende Kante wird entfernt.
    const graphB = (await call('GET', '/api/graph?viewId=v-b')).body;
    assert.deepEqual(graphB.edges.map((e) => e.id), ['e-in']);
    assert.equal((await call('GET', '/api/edges/e-out')).status, 404);
    // Root enthält danach keine Kante mehr.
    assert.equal((await call('GET', `/api/graph?viewId=${rootId}`)).body.edges.length, 0);
  } finally {
    close();
  }
});

test('deleteNode: direkte Kinder werden an den Großelternknoten umgehängt', async () => {
  const { call, close } = await freshApp();
  try {
    await call('POST', '/api/nodes', { id: 'outer', name: 'Outer', category: 'group', position: { x: 100, y: 50 } });
    await call('POST', '/api/nodes', { id: 'inner', name: 'Inner', category: 'group', parentId: 'outer', position: { x: 30, y: 20 } });
    await call('POST', '/api/nodes', { id: 'leaf', name: 'Leaf', parentId: 'inner', position: { x: 5, y: 5 } });

    // Mittlere Zone löschen → leaf hängt an outer, Position um inner-Offset verschoben.
    assert.equal((await call('DELETE', '/api/nodes/inner')).status, 204);
    const leaf = (await call('GET', '/api/nodes/leaf')).body;
    assert.equal(leaf.parentId, 'outer');
    assert.deepEqual(leaf.position, { x: 35, y: 25 });
  } finally {
    close();
  }
});

// ── Accounts / Auth / Isolation ─────────────────────────────────

test('auth: geschützte Endpunkte erfordern Anmeldung', async () => {
  const { base: b, close } = await freshApp();
  try {
    const status = async (method, path, body) => {
      const res = await fetch(`${b}${path}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
      return res.status;
    };
    // Öffentlich:
    assert.equal(await status('GET', '/api/health'), 200);
    assert.equal(await status('GET', '/api/meta/catalog'), 200);
    // Geschützt → 401 ohne Session:
    assert.equal(await status('GET', '/api/projects'), 401);
    assert.equal(await status('GET', '/api/graph'), 401);
    assert.equal(await status('GET', '/api/views'), 401);
    assert.equal(await status('POST', '/api/nodes', { name: 'X' }), 401);
    assert.equal(await status('GET', '/api/auth/me'), 401);
  } finally {
    close();
  }
});

test('auth: Registrierung, Login, me und Logout (inkl. Validierung)', async () => {
  const { base: b, close } = await freshApp();
  try {
    const raw = async (method, path, body, cookie) => {
      const headers = {};
      if (body) headers['Content-Type'] = 'application/json';
      if (cookie) headers.Cookie = cookie;
      const res = await fetch(`${b}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      return {
        status: res.status,
        body: text ? JSON.parse(text) : null,
        setCookie: res.headers.get('set-cookie'),
      };
    };

    // Registrierung legt Konto an, normalisiert die E-Mail und setzt ein Session-Cookie.
    const reg = await raw('POST', '/api/auth/register', {
      email: 'Alice@Example.com',
      password: 'supersecret',
    });
    assert.equal(reg.status, 201);
    assert.equal(reg.body.user.email, 'alice@example.com');
    assert.ok(reg.setCookie && /(^|[;\s])sid=/.test(reg.setCookie), 'Session-Cookie gesetzt');
    assert.match(reg.setCookie, /HttpOnly/i);
    const regCookie = reg.setCookie.split(';')[0];

    // Neuer Nutzer bekommt ein Beispielprojekt.
    const projects = await raw('GET', '/api/projects', null, regCookie);
    assert.equal(projects.status, 200);
    assert.ok(projects.body.length >= 1);

    // Doppelte Registrierung → 409.
    assert.equal(
      (await raw('POST', '/api/auth/register', { email: 'alice@example.com', password: 'supersecret' }))
        .status,
      409
    );
    // Zu kurzes Passwort / ungültige E-Mail → 400.
    assert.equal(
      (await raw('POST', '/api/auth/register', { email: 'x@y.de', password: 'kurz' })).status,
      400
    );
    assert.equal(
      (await raw('POST', '/api/auth/register', { email: 'keine-mail', password: 'supersecret' })).status,
      400
    );

    // Falsches Passwort → 401 (generisch).
    const bad = await raw('POST', '/api/auth/login', { email: 'alice@example.com', password: 'falsch1234' });
    assert.equal(bad.status, 401);
    assert.match(bad.body.error, /Zugangsdaten/);

    // Korrekter Login → 200 + Cookie.
    const login = await raw('POST', '/api/auth/login', { email: 'alice@example.com', password: 'supersecret' });
    assert.equal(login.status, 200);
    const loginCookie = login.setCookie.split(';')[0];

    // me liefert den Nutzer.
    const me = await raw('GET', '/api/auth/me', null, loginCookie);
    assert.equal(me.status, 200);
    assert.equal(me.body.user.email, 'alice@example.com');

    // Logout invalidiert die Session serverseitig.
    assert.equal((await raw('POST', '/api/auth/logout', null, loginCookie)).status, 204);
    assert.equal((await raw('GET', '/api/auth/me', null, loginCookie)).status, 401);
  } finally {
    close();
  }
});

test('isolation: Nutzer sehen und ändern nur ihre eigenen Daten', async () => {
  const app = await freshApp();          // Nutzer A (app.cookie)
  const bUser = bootstrapUser(app.db);   // Nutzer B im selben Prozess/DB
  try {
    const proj = await app.call('POST', '/api/projects', { name: 'A-Privat' });
    assert.equal(proj.status, 201);
    const aProjectId = proj.body.id;
    const aView = (await app.call('GET', `/api/views?projectId=${aProjectId}`)).body[0];
    const node = await app.call('POST', '/api/nodes', { id: 'a-secret', name: 'Geheim', viewId: aView.id });
    assert.equal(node.status, 201);

    // B sieht A's Projekt nicht.
    const bProjects = (await app.call('GET', '/api/projects', null, bUser.cookie)).body;
    assert.ok(!bProjects.some((p) => p.id === aProjectId));

    // Direkter Zugriff auf A's IDs als B → 404 (keine Existenz-Preisgabe, kein Schreibzugriff).
    assert.equal((await app.call('GET', `/api/projects/${aProjectId}`, null, bUser.cookie)).status, 404);
    assert.equal((await app.call('GET', '/api/nodes/a-secret', null, bUser.cookie)).status, 404);
    assert.equal((await app.call('PATCH', '/api/nodes/a-secret', { name: 'Hack' }, bUser.cookie)).status, 404);
    assert.equal((await app.call('DELETE', '/api/nodes/a-secret', null, bUser.cookie)).status, 404);
    assert.equal((await app.call('GET', `/api/views/${aView.id}`, null, bUser.cookie)).status, 404);
    assert.equal((await app.call('GET', `/api/graph?viewId=${aView.id}`, null, bUser.cookie)).status, 404);
    assert.equal(
      (await app.call('POST', '/api/nodes/positions', { positions: [{ id: 'a-secret', x: 9, y: 9 }] }, bUser.cookie))
        .body.updated,
      0
    );

    // A's Node blieb unverändert.
    const still = (await app.call('GET', '/api/nodes/a-secret')).body;
    assert.equal(still.name, 'Geheim');
    assert.deepEqual(still.position, { x: 0, y: 0 });

    // Globale Suche von B über A's Projekt liefert nichts.
    const search = (await app.call('GET', `/api/nodes?projectId=${aProjectId}&q=Geheim`, null, bUser.cookie)).body;
    assert.equal(search.length, 0);
  } finally {
    app.close();
  }
});

test('isolation: Import ersetzt nur die eigenen Daten', async () => {
  const app = await freshApp();          // A
  const bUser = bootstrapUser(app.db);   // B
  try {
    const bView = (await app.call('GET', '/api/views', null, bUser.cookie)).body[0];
    await app.call('POST', '/api/nodes', { id: 'b-keep', name: 'B-Node', viewId: bView.id }, bUser.cookie);

    const imp = await app.call('POST', '/api/graph/import', {
      mode: 'replace',
      nodes: [{ id: 'a-new', name: 'A-Node', position: { x: 0, y: 0 } }],
      edges: [],
    });
    assert.equal(imp.status, 200);

    // B's Node bleibt erhalten; A hat nur den importierten Node.
    assert.equal((await app.call('GET', '/api/nodes/b-keep', null, bUser.cookie)).status, 200);
    assert.equal((await app.call('GET', '/api/nodes/a-new')).status, 200);
    assert.equal((await app.call('GET', '/api/nodes/b-keep')).status, 404);
  } finally {
    app.close();
  }
});
