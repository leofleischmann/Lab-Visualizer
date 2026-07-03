import crypto from 'node:crypto';
import { ApiError } from './validation.js';
import { computeLayout } from './layout.js';

const now = () => new Date().toISOString();

// ── Serialisierung ──────────────────────────────────────────────

function rowToNode(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    status: row.status,
    parentId: row.parent_id,
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

// ── Nodes ───────────────────────────────────────────────────────

export function listNodes(db, { q, category, status } = {}) {
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
  const sql = `SELECT * FROM nodes ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at`;
  return sortParentsFirst(db.prepare(sql).all(params).map(rowToNode));
}

export function getNode(db, id) {
  const row = db.prepare('SELECT * FROM nodes WHERE id = ?').get(id);
  if (!row) throw new ApiError(404, `Node "${id}" nicht gefunden`);
  return rowToNode(row);
}

const INSERT_NODE = `
  INSERT INTO nodes (id, name, category, status, parent_id, pos_x, pos_y, width, height,
                     ip, vlan, os, hostname, url, notes, custom_fields, created_at, updated_at)
  VALUES (@id, @name, @category, @status, @parent_id, @pos_x, @pos_y, @width, @height,
          @ip, @vlan, @os, @hostname, @url, @notes, @custom_fields, @created_at, @updated_at)`;

function nodeToRow(data, timestamps) {
  return {
    id: data.id,
    name: data.name,
    category: data.category,
    status: data.status,
    parent_id: data.parentId ?? null,
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
  const ts = now();
  db.prepare(INSERT_NODE).run(nodeToRow({ ...data, id }, { created_at: ts, updated_at: ts }));
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
  const merged = {
    ...existing,
    ...patch,
    position: patch.position ?? existing.position,
    customFields: patch.customFields ?? existing.customFields,
    id,
  };
  db.prepare(`
    UPDATE nodes SET name = @name, category = @category, status = @status, parent_id = @parent_id,
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

export function listEdges(db, { nodeId } = {}) {
  if (nodeId) {
    return db
      .prepare('SELECT * FROM edges WHERE source_id = ? OR target_id = ? ORDER BY created_at')
      .all(nodeId, nodeId)
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
  INSERT INTO edges (id, source_id, target_id, label, kind, line_style, animated, notes,
                     routing, custom_fields, created_at, updated_at)
  VALUES (@id, @source_id, @target_id, @label, @kind, @line_style, @animated, @notes,
          @routing, @custom_fields, @created_at, @updated_at)`;

function edgeToRow(data, timestamps) {
  return {
    id: data.id,
    source_id: data.sourceId,
    target_id: data.targetId,
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

export function createEdge(db, data) {
  const id = data.id || crypto.randomUUID();
  if (db.prepare('SELECT 1 FROM edges WHERE id = ?').get(id)) {
    throw new ApiError(409, `Edge "${id}" existiert bereits`);
  }
  for (const [field, ref] of [['sourceId', data.sourceId], ['targetId', data.targetId]]) {
    if (!nodeExists(db, ref)) throw new ApiError(400, `${field}: Node "${ref}" existiert nicht`);
  }
  const ts = now();
  db.prepare(INSERT_EDGE).run(edgeToRow({ ...data, id }, { created_at: ts, updated_at: ts }));
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
    UPDATE edges SET source_id = @source_id, target_id = @target_id, label = @label, kind = @kind,
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

export function getGraph(db) {
  return { nodes: listNodes(db), edges: listEdges(db) };
}

export function exportGraph(db) {
  return { version: 1, exportedAt: now(), ...getGraph(db) };
}

export function countNodes(db) {
  return db.prepare('SELECT count(*) AS c FROM nodes').get().c;
}

/**
 * Importiert einen kompletten Graphen (mode=replace: ersetzt alle Daten).
 * Referenzen (parentId, Edge-Endpunkte) werden vorab geprüft.
 */
export function importGraph(db, { nodes, edges }) {
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
    const insertNode = db.prepare(INSERT_NODE);
    for (const n of nodes) {
      insertNode.run(nodeToRow(n, { created_at: n.createdAt ?? ts, updated_at: ts }));
    }
    const insertEdge = db.prepare(INSERT_EDGE);
    for (const e of edges) {
      insertEdge.run(
        edgeToRow({ ...e, id: e.id || crypto.randomUUID() }, { created_at: e.createdAt ?? ts, updated_at: ts })
      );
    }
  });
  tx();
  return { nodes: countNodes(db), edges: db.prepare('SELECT count(*) AS c FROM edges').get().c };
}

/**
 * Wendet das deterministische Auto-Layout auf alle Nodes an (Positionen + Zonengrößen).
 */
export function applyLayout(db, options = {}) {
  const nodes = listNodes(db);
  const edges = listEdges(db);
  const laid = computeLayout(nodes, edges, options);
  const ts = now();
  const stmt = db.prepare(`
    UPDATE nodes SET pos_x = @x, pos_y = @y, width = @width, height = @height, updated_at = @updated_at
    WHERE id = @id
  `);
  // Manuelles Kanten-Routing zurücksetzen: Waypoints beziehen sich auf die
  // alten Positionen und wären nach dem Auto-Align wertlos.
  const resetRouting = db.prepare(`
    UPDATE edges SET routing = '{"mode":"auto","waypoints":[]}', updated_at = @updated_at
    WHERE routing != '{"mode":"auto","waypoints":[]}'
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
    resetRouting.run({ updated_at: ts });
  });
  tx();
  return { updated: laid.length };
}
