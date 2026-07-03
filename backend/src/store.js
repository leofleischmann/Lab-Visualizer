import crypto from 'node:crypto';
import { ApiError } from './validation.js';
import { ensureRootView } from './db.js';
import { computeLayout } from './layout.js';

const now = () => new Date().toISOString();

// ── Serialisierung ──────────────────────────────────────────────

function rowToView(row) {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
    description: row.description,
    color: row.color,
    icon: row.icon,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToNode(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    status: row.status,
    parentId: row.parent_id,
    viewId: row.view_id,
    linkedViewId: row.linked_view_id,
    position: { x: row.pos_x, y: row.pos_y },
    width: row.width,
    height: row.height,
    ip: row.ip,
    vlan: row.vlan,
    os: row.os,
    hostname: row.hostname,
    url: row.url,
    notes: row.notes,
    customFields: JSON.parse(row.custom_fields || '{}'),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToEdge(row) {
  return {
    id: row.id,
    sourceId: row.source_id,
    targetId: row.target_id,
    viewId: row.view_id,
    label: row.label,
    kind: row.kind,
    lineStyle: row.line_style,
    animated: !!row.animated,
    notes: row.notes,
    routing: JSON.parse(row.routing || '{"mode":"auto","waypoints":[]}'),
    customFields: JSON.parse(row.custom_fields || '{}'),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Hilfsfunktionen ─────────────────────────────────────────────

function nodeExists(db, id) {
  return !!db.prepare('SELECT 1 FROM nodes WHERE id = ?').get(id);
}

/** Prüft, ob `newParentId` als Parent von `nodeId` einen Zyklus erzeugen würde. */
function wouldCreateCycle(db, nodeId, newParentId) {
  const stmt = db.prepare('SELECT parent_id FROM nodes WHERE id = ?');
  let current = newParentId;
  let guard = 0;
  while (current && guard++ < 10000) {
    if (current === nodeId) return true;
    const row = stmt.get(current);
    current = row ? row.parent_id : null;
  }
  return false;
}

/** Sortiert Nodes so, dass Parents vor ihren Kindern stehen (für React Flow). */
export function sortParentsFirst(nodes) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const visited = new Set();
  const result = [];
  const visit = (node) => {
    if (visited.has(node.id)) return;
    visited.add(node.id);
    if (node.parentId && byId.has(node.parentId)) visit(byId.get(node.parentId));
    result.push(node);
  };
  for (const node of nodes) visit(node);
  return result;
}

// ── Views (Ebenen) ──────────────────────────────────────────────

function viewExists(db, id) {
  return !!db.prepare('SELECT 1 FROM views WHERE id = ?').get(id);
}

/** Erste Root-Ebene (parentId = null); Fallback: irgendeine Ebene. Immer vorhanden. */
export function defaultViewId(db) {
  const root = db
    .prepare('SELECT id FROM views WHERE parent_id IS NULL ORDER BY sort_order, created_at LIMIT 1')
    .get();
  if (root) return root.id;
  return ensureRootView(db);
}

/** Prüft, ob `newParentId` als Parent von `viewId` einen Zyklus erzeugen würde. */
function wouldViewCreateCycle(db, viewId, newParentId) {
  const stmt = db.prepare('SELECT parent_id FROM views WHERE id = ?');
  let current = newParentId;
  let guard = 0;
  while (current && guard++ < 10000) {
    if (current === viewId) return true;
    const row = stmt.get(current);
    current = row ? row.parent_id : null;
  }
  return false;
}

export function listViews(db) {
  return db
    .prepare('SELECT * FROM views ORDER BY sort_order, created_at')
    .all()
    .map(rowToView);
}

export function getView(db, id) {
  const row = db.prepare('SELECT * FROM views WHERE id = ?').get(id);
  if (!row) throw new ApiError(404, `Ebene "${id}" nicht gefunden`);
  return rowToView(row);
}

export function createView(db, data) {
  const id = data.id || crypto.randomUUID();
  if (viewExists(db, id)) throw new ApiError(409, `Ebene "${id}" existiert bereits`);
  if (data.parentId && !viewExists(db, data.parentId)) {
    throw new ApiError(400, `Parent-Ebene "${data.parentId}" existiert nicht`);
  }
  const maxOrder =
    db.prepare('SELECT max(sort_order) AS m FROM views').get()?.m ?? -1;
  const ts = now();
  db.prepare(
    `INSERT INTO views (id, name, parent_id, description, color, icon, sort_order, created_at, updated_at)
     VALUES (@id, @name, @parent_id, @description, @color, @icon, @sort_order, @created_at, @updated_at)`
  ).run({
    id,
    name: data.name,
    parent_id: data.parentId ?? null,
    description: data.description ?? '',
    color: data.color ?? null,
    icon: data.icon ?? null,
    sort_order: data.sortOrder ?? maxOrder + 1,
    created_at: ts,
    updated_at: ts,
  });
  return getView(db, id);
}

export function updateView(db, id, patch) {
  const existing = getView(db, id);
  if (patch.parentId !== undefined && patch.parentId !== null) {
    if (patch.parentId === id) throw new ApiError(400, 'Eine Ebene kann nicht ihr eigener Parent sein');
    if (!viewExists(db, patch.parentId)) {
      throw new ApiError(400, `Parent-Ebene "${patch.parentId}" existiert nicht`);
    }
    if (wouldViewCreateCycle(db, id, patch.parentId)) {
      throw new ApiError(400, 'Parent-Zuordnung würde einen Zyklus erzeugen');
    }
  }
  const merged = { ...existing, ...patch };
  db.prepare(
    `UPDATE views SET name = @name, parent_id = @parent_id, description = @description,
       color = @color, icon = @icon, sort_order = @sort_order, updated_at = @updated_at
     WHERE id = @id`
  ).run({
    id,
    name: merged.name,
    parent_id: merged.parentId ?? null,
    description: merged.description ?? '',
    color: merged.color ?? null,
    icon: merged.icon ?? null,
    sort_order: merged.sortOrder ?? existing.sortOrder,
    updated_at: now(),
  });
  return getView(db, id);
}

/**
 * Löscht eine Ebene inkl. Kind-Ebenen und deren Nodes/Edges (ON DELETE CASCADE).
 * Die letzte verbleibende Ebene kann nicht gelöscht werden.
 */
export function deleteView(db, id) {
  getView(db, id);
  const total = db.prepare('SELECT count(*) AS c FROM views').get().c;
  if (total <= 1) throw new ApiError(400, 'Die letzte Ebene kann nicht gelöscht werden');

  // Betroffene Ebenen (inkl. Nachfahren) für die Rückgabe-Statistik sammeln.
  const affected = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const v of db.prepare('SELECT id, parent_id FROM views').all()) {
      if (v.parent_id && affected.has(v.parent_id) && !affected.has(v.id)) {
        affected.add(v.id);
        grew = true;
      }
    }
  }
  const placeholders = [...affected].map(() => '?').join(',');
  const nodeCount = db
    .prepare(`SELECT count(*) AS c FROM nodes WHERE view_id IN (${placeholders})`)
    .get(...affected).c;

  db.prepare('DELETE FROM views WHERE id = ?').run(id);
  return { views: affected.size, nodes: nodeCount };
}

// ── Nodes ───────────────────────────────────────────────────────

export function listNodes(db, { q, category, status, viewId } = {}) {
  const where = [];
  const params = {};
  if (q) {
    where.push(
      "(name LIKE :q OR ip LIKE :q OR hostname LIKE :q OR url LIKE :q OR ifnull(os,'') LIKE :q)"
    );
    params.q = `%${q}%`;
  }
  if (category) {
    where.push('category = :category');
    params.category = category;
  }
  if (status) {
    where.push('status = :status');
    params.status = status;
  }
  if (viewId) {
    where.push('view_id = :viewId');
    params.viewId = viewId;
  }
  const sql = `SELECT * FROM nodes ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at`;
  return sortParentsFirst(db.prepare(sql).all(params).map(rowToNode));
}

export function getNode(db, id) {
  const row = db.prepare('SELECT * FROM nodes WHERE id = ?').get(id);
  if (!row) throw new ApiError(404, `Node "${id}" nicht gefunden`);
  return rowToNode(row);
}

const INSERT_NODE = `
  INSERT INTO nodes (id, name, category, status, parent_id, view_id, linked_view_id,
                     pos_x, pos_y, width, height,
                     ip, vlan, os, hostname, url, notes, custom_fields, created_at, updated_at)
  VALUES (@id, @name, @category, @status, @parent_id, @view_id, @linked_view_id,
          @pos_x, @pos_y, @width, @height,
          @ip, @vlan, @os, @hostname, @url, @notes, @custom_fields, @created_at, @updated_at)`;

function nodeToRow(data, timestamps) {
  return {
    id: data.id,
    name: data.name,
    category: data.category,
    status: data.status,
    parent_id: data.parentId ?? null,
    view_id: data.viewId ?? null,
    linked_view_id: data.linkedViewId ?? null,
    pos_x: data.position.x,
    pos_y: data.position.y,
    width: data.width ?? null,
    height: data.height ?? null,
    ip: data.ip ?? null,
    vlan: data.vlan ?? null,
    os: data.os ?? null,
    hostname: data.hostname ?? null,
    url: data.url ?? null,
    notes: data.notes ?? '',
    custom_fields: JSON.stringify(data.customFields ?? {}),
    ...timestamps,
  };
}

export function createNode(db, data) {
  const id = data.id || crypto.randomUUID();
  if (nodeExists(db, id)) throw new ApiError(409, `Node "${id}" existiert bereits`);
  if (data.parentId && !nodeExists(db, data.parentId)) {
    throw new ApiError(400, `Parent-Node "${data.parentId}" existiert nicht`);
  }
  const viewId = data.viewId ?? defaultViewId(db);
  if (!viewExists(db, viewId)) throw new ApiError(400, `Ebene "${viewId}" existiert nicht`);
  if (data.linkedViewId && !viewExists(db, data.linkedViewId)) {
    throw new ApiError(400, `Verlinkte Ebene "${data.linkedViewId}" existiert nicht`);
  }
  const ts = now();
  db.prepare(INSERT_NODE).run(
    nodeToRow({ ...data, id, viewId }, { created_at: ts, updated_at: ts })
  );
  return getNode(db, id);
}

export function updateNode(db, id, patch) {
  const existing = getNode(db, id);
  if (patch.parentId !== undefined && patch.parentId !== null) {
    if (patch.parentId === id) throw new ApiError(400, 'Ein Node kann nicht sein eigener Parent sein');
    if (!nodeExists(db, patch.parentId)) {
      throw new ApiError(400, `Parent-Node "${patch.parentId}" existiert nicht`);
    }
    if (wouldCreateCycle(db, id, patch.parentId)) {
      throw new ApiError(400, 'Parent-Zuordnung würde einen Zyklus erzeugen');
    }
  }
  if (patch.viewId !== undefined && patch.viewId !== null && !viewExists(db, patch.viewId)) {
    throw new ApiError(400, `Ebene "${patch.viewId}" existiert nicht`);
  }
  if (patch.linkedViewId !== undefined && patch.linkedViewId !== null && !viewExists(db, patch.linkedViewId)) {
    throw new ApiError(400, `Verlinkte Ebene "${patch.linkedViewId}" existiert nicht`);
  }
  const merged = {
    ...existing,
    ...patch,
    position: patch.position ?? existing.position,
    customFields: patch.customFields ?? existing.customFields,
    id,
  };
  db.prepare(`
    UPDATE nodes SET name = @name, category = @category, status = @status, parent_id = @parent_id,
      view_id = @view_id, linked_view_id = @linked_view_id,
      pos_x = @pos_x, pos_y = @pos_y, width = @width, height = @height, ip = @ip, vlan = @vlan,
      os = @os, hostname = @hostname, url = @url, notes = @notes, custom_fields = @custom_fields,
      updated_at = @updated_at
    WHERE id = @id
  `).run(nodeToRow(merged, { created_at: existing.createdAt, updated_at: now() }));
  return getNode(db, id);
}

export function deleteNode(db, id) {
  const node = getNode(db, id);
  const tx = db.transaction(() => {
    // Kinder an den Großelternknoten übergeben und Positionen so verschieben,
    // dass ihre absolute Lage auf der Canvas erhalten bleibt.
    db.prepare(`
      UPDATE nodes SET parent_id = @newParent, pos_x = pos_x + @dx, pos_y = pos_y + @dy
      WHERE parent_id = @id
    `).run({ id, newParent: node.parentId ?? null, dx: node.position.x, dy: node.position.y });
    db.prepare('DELETE FROM edges WHERE source_id = ? OR target_id = ?').run(id, id);
    db.prepare('DELETE FROM nodes WHERE id = ?').run(id);
  });
  tx();
}

export function updatePositions(db, positions) {
  const stmt = db.prepare(`
    UPDATE nodes SET pos_x = @x, pos_y = @y,
      width = coalesce(@width, width), height = coalesce(@height, height),
      updated_at = @updated_at
    WHERE id = @id
  `);
  let updated = 0;
  const tx = db.transaction(() => {
    for (const p of positions) {
      const result = stmt.run({
        id: p.id,
        x: p.x,
        y: p.y,
        width: p.width ?? null,
        height: p.height ?? null,
        updated_at: now(),
      });
      updated += result.changes;
    }
  });
  tx();
  return updated;
}

// ── Edges ───────────────────────────────────────────────────────

export function listEdges(db, { nodeId, viewId } = {}) {
  if (nodeId) {
    return db
      .prepare('SELECT * FROM edges WHERE source_id = ? OR target_id = ? ORDER BY created_at')
      .all(nodeId, nodeId)
      .map(rowToEdge);
  }
  if (viewId) {
    return db
      .prepare('SELECT * FROM edges WHERE view_id = ? ORDER BY created_at')
      .all(viewId)
      .map(rowToEdge);
  }
  return db.prepare('SELECT * FROM edges ORDER BY created_at').all().map(rowToEdge);
}

export function getEdge(db, id) {
  const row = db.prepare('SELECT * FROM edges WHERE id = ?').get(id);
  if (!row) throw new ApiError(404, `Edge "${id}" nicht gefunden`);
  return rowToEdge(row);
}

const INSERT_EDGE = `
  INSERT INTO edges (id, source_id, target_id, view_id, label, kind, line_style, animated, notes,
                     routing, custom_fields, created_at, updated_at)
  VALUES (@id, @source_id, @target_id, @view_id, @label, @kind, @line_style, @animated, @notes,
          @routing, @custom_fields, @created_at, @updated_at)`;

function edgeToRow(data, timestamps) {
  return {
    id: data.id,
    source_id: data.sourceId,
    target_id: data.targetId,
    view_id: data.viewId ?? null,
    label: data.label ?? '',
    kind: data.kind ?? 'generic',
    line_style: data.lineStyle ?? 'solid',
    animated: data.animated ? 1 : 0,
    notes: data.notes ?? '',
    routing: JSON.stringify(data.routing ?? { mode: 'auto', waypoints: [] }),
    custom_fields: JSON.stringify(data.customFields ?? {}),
    ...timestamps,
  };
}

/** Ebene eines Nodes lesen (für Edge-Zuordnung). */
function nodeViewId(db, id) {
  return db.prepare('SELECT view_id FROM nodes WHERE id = ?').get(id)?.view_id ?? null;
}

export function createEdge(db, data) {
  const id = data.id || crypto.randomUUID();
  if (db.prepare('SELECT 1 FROM edges WHERE id = ?').get(id)) {
    throw new ApiError(409, `Edge "${id}" existiert bereits`);
  }
  for (const [field, ref] of [['sourceId', data.sourceId], ['targetId', data.targetId]]) {
    if (!nodeExists(db, ref)) throw new ApiError(400, `${field}: Node "${ref}" existiert nicht`);
  }
  // Kanten sind intra-view: Quelle und Ziel müssen in derselben Ebene liegen.
  const sourceView = nodeViewId(db, data.sourceId);
  const targetView = nodeViewId(db, data.targetId);
  if (sourceView !== targetView) {
    throw new ApiError(400, 'Quelle und Ziel einer Verbindung müssen in derselben Ebene liegen');
  }
  const viewId = data.viewId ?? sourceView ?? defaultViewId(db);
  const ts = now();
  db.prepare(INSERT_EDGE).run(
    edgeToRow({ ...data, id, viewId }, { created_at: ts, updated_at: ts })
  );
  return getEdge(db, id);
}

export function updateEdge(db, id, patch) {
  const existing = getEdge(db, id);
  for (const field of ['sourceId', 'targetId']) {
    if (patch[field] !== undefined && !nodeExists(db, patch[field])) {
      throw new ApiError(400, `${field}: Node "${patch[field]}" existiert nicht`);
    }
  }
  const merged = {
    ...existing,
    ...patch,
    customFields: patch.customFields ?? existing.customFields,
    routing: patch.routing ?? existing.routing,
    id,
  };
  db.prepare(`
    UPDATE edges SET source_id = @source_id, target_id = @target_id, view_id = @view_id,
      label = @label, kind = @kind,
      line_style = @line_style, animated = @animated, notes = @notes, routing = @routing,
      custom_fields = @custom_fields, updated_at = @updated_at
    WHERE id = @id
  `).run(edgeToRow(merged, { created_at: existing.createdAt, updated_at: now() }));
  return getEdge(db, id);
}

export function deleteEdge(db, id) {
  const result = db.prepare('DELETE FROM edges WHERE id = ?').run(id);
  if (result.changes === 0) throw new ApiError(404, `Edge "${id}" nicht gefunden`);
}

// ── Graph (gesamt) ──────────────────────────────────────────────

/** Graph einer Ebene (Default: erste Root-Ebene). */
export function getGraph(db, viewId) {
  const view = viewId ?? defaultViewId(db);
  return {
    viewId: view,
    nodes: listNodes(db, { viewId: view }),
    edges: listEdges(db, { viewId: view }),
  };
}

export function exportGraph(db) {
  return {
    version: 2,
    exportedAt: now(),
    views: listViews(db),
    nodes: listNodes(db),
    edges: listEdges(db),
  };
}

export function countNodes(db) {
  return db.prepare('SELECT count(*) AS c FROM nodes').get().c;
}

/**
 * Importiert einen kompletten Graphen (mode=replace: ersetzt alle Daten).
 * Referenzen (parentId, Edge-Endpunkte) werden vorab geprüft.
 */
export function importGraph(db, { views = [], nodes, edges }) {
  const ids = new Set(nodes.map((n) => n.id));
  if (ids.size !== nodes.length) throw new ApiError(400, 'Doppelte Node-IDs im Import');
  for (const n of nodes) {
    if (n.parentId && !ids.has(n.parentId)) {
      throw new ApiError(400, `Node "${n.id}": Parent "${n.parentId}" ist nicht im Import enthalten`);
    }
  }
  for (const e of edges) {
    if (!ids.has(e.sourceId) || !ids.has(e.targetId)) {
      throw new ApiError(400, `Edge "${e.id ?? '(neu)'}": Quelle oder Ziel nicht im Import enthalten`);
    }
  }
  const ts = now();
  const tx = db.transaction(() => {
    db.pragma('defer_foreign_keys = ON');
    db.prepare('DELETE FROM edges').run();
    db.prepare('DELETE FROM nodes').run();
    db.prepare('DELETE FROM views').run();

    // Ebenen zuerst (Parents vor Kindern), damit FKs auflösen.
    const insertView = db.prepare(
      `INSERT INTO views (id, name, parent_id, description, color, icon, sort_order, created_at, updated_at)
       VALUES (@id, @name, @parent_id, @description, @color, @icon, @sort_order, @created_at, @updated_at)`
    );
    sortParentsFirst(views).forEach((v, i) => {
      insertView.run({
        id: v.id,
        name: v.name,
        parent_id: v.parentId ?? null,
        description: v.description ?? '',
        color: v.color ?? null,
        icon: v.icon ?? null,
        sort_order: v.sortOrder ?? i,
        created_at: v.createdAt ?? ts,
        updated_at: ts,
      });
    });

    // Immer mindestens eine Ebene; alles ohne gültige Ebene → Root.
    const rootId = ensureRootView(db);
    const viewIds = new Set(db.prepare('SELECT id FROM views').all().map((r) => r.id));
    const resolveView = (id) => (id && viewIds.has(id) ? id : rootId);

    const insertNode = db.prepare(INSERT_NODE);
    for (const n of nodes) {
      insertNode.run(
        nodeToRow(
          {
            ...n,
            viewId: resolveView(n.viewId),
            linkedViewId: n.linkedViewId && viewIds.has(n.linkedViewId) ? n.linkedViewId : null,
          },
          { created_at: n.createdAt ?? ts, updated_at: ts }
        )
      );
    }
    const insertEdge = db.prepare(INSERT_EDGE);
    for (const e of edges) {
      insertEdge.run(
        edgeToRow(
          { ...e, id: e.id || crypto.randomUUID(), viewId: resolveView(e.viewId) },
          { created_at: e.createdAt ?? ts, updated_at: ts }
        )
      );
    }
  });
  tx();
  return {
    views: db.prepare('SELECT count(*) AS c FROM views').get().c,
    nodes: countNodes(db),
    edges: db.prepare('SELECT count(*) AS c FROM edges').get().c,
  };
}

/**
 * Wendet das deterministische Auto-Layout auf alle Nodes an (Positionen + Zonengrößen).
 */
export function applyLayout(db, options = {}) {
  const viewId = options.viewId ?? defaultViewId(db);
  const nodes = listNodes(db, { viewId });
  const edges = listEdges(db, { viewId });
  const laid = computeLayout(nodes, edges, options);
  const ts = now();
  const stmt = db.prepare(`
    UPDATE nodes SET pos_x = @x, pos_y = @y, width = @width, height = @height, updated_at = @updated_at
    WHERE id = @id
  `);
  // Manuelles Kanten-Routing dieser Ebene zurücksetzen: Waypoints beziehen sich
  // auf die alten Positionen und wären nach dem Auto-Align wertlos.
  const resetRouting = db.prepare(`
    UPDATE edges SET routing = '{"mode":"auto","waypoints":[]}', updated_at = @updated_at
    WHERE view_id = @viewId AND routing != '{"mode":"auto","waypoints":[]}'
  `);
  const tx = db.transaction(() => {
    for (const n of laid) {
      stmt.run({
        id: n.id,
        x: n.position.x,
        y: n.position.y,
        width: n.width ?? null,
        height: n.height ?? null,
        updated_at: ts,
      });
    }
    resetRouting.run({ updated_at: ts, viewId });
  });
  tx();
  return { updated: laid.length };
}
