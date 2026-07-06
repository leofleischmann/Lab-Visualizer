import crypto from 'node:crypto';
import { ApiError } from './validation.js';
import { ensureRootView } from './db.js';
import { computeLayout } from './layout.js';

const now = () => new Date().toISOString();

// ── Serialisierung ──────────────────────────────────────────────

function rowToProject(row) {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    icon: row.icon,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToView(row) {
  return {
    id: row.id,
    projectId: row.project_id,
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

// ── Besitz-Helfer (Row-Level-Autorisierung) ─────────────────────
// Besitz wird transitiv vererbt: project.user_id → view.project_id →
// node/edge.view_id. Jeder Zugriff wird gegen den eingeloggten Nutzer geprüft;
// fremde IDs verhalten sich wie „nicht vorhanden" (404), verraten also keine Existenz.

function projectOwnedExists(db, userId, id) {
  return !!db.prepare('SELECT 1 FROM projects WHERE id = ? AND user_id = ?').get(id, userId);
}

function viewOwnedExists(db, userId, id) {
  return !!db
    .prepare(
      'SELECT 1 FROM views v JOIN projects p ON v.project_id = p.id WHERE v.id = ? AND p.user_id = ?'
    )
    .get(id, userId);
}

function nodeOwnedExists(db, userId, id) {
  return !!db
    .prepare(
      `SELECT 1 FROM nodes n
       JOIN views v ON n.view_id = v.id
       JOIN projects p ON v.project_id = p.id
       WHERE n.id = ? AND p.user_id = ?`
    )
    .get(id, userId);
}

/** Ebene eines Nodes lesen (nur intern nach bereits geprüftem Besitz). */
function nodeViewId(db, id) {
  return db.prepare('SELECT view_id FROM nodes WHERE id = ?').get(id)?.view_id ?? null;
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

// ── Projects (Projekte) ─────────────────────────────────────────

/** Erstes Projekt des Nutzers (oder null). */
export function defaultProjectId(db, userId) {
  return (
    db
      .prepare('SELECT id FROM projects WHERE user_id = ? ORDER BY sort_order, created_at LIMIT 1')
      .get(userId)?.id ?? null
  );
}

export function listProjects(db, userId) {
  return db
    .prepare('SELECT * FROM projects WHERE user_id = ? ORDER BY sort_order, created_at')
    .all(userId)
    .map(rowToProject);
}

export function getProject(db, userId, id) {
  const row = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(id, userId);
  if (!row) throw new ApiError(404, `Projekt "${id}" nicht gefunden`);
  return rowToProject(row);
}

export function createProject(db, userId, data) {
  const id = data.id || crypto.randomUUID();
  // Projekt-IDs sind global eindeutig (Primärschlüssel).
  if (db.prepare('SELECT 1 FROM projects WHERE id = ?').get(id)) {
    throw new ApiError(409, `Projekt "${id}" existiert bereits`);
  }
  const maxOrder =
    db.prepare('SELECT max(sort_order) AS m FROM projects WHERE user_id = ?').get(userId)?.m ?? -1;
  const ts = now();
  db.prepare(
    `INSERT INTO projects (id, user_id, name, color, icon, sort_order, created_at, updated_at)
     VALUES (@id, @user_id, @name, @color, @icon, @sort_order, @created_at, @updated_at)`
  ).run({
    id,
    user_id: userId,
    name: data.name,
    color: data.color ?? null,
    icon: data.icon ?? null,
    sort_order: data.sortOrder ?? maxOrder + 1,
    created_at: ts,
    updated_at: ts,
  });
  // Neues Projekt startet mit einer leeren Root-Ebene.
  ensureRootView(db, id);
  return getProject(db, userId, id);
}

export function updateProject(db, userId, id, patch) {
  const existing = getProject(db, userId, id);
  const merged = { ...existing, ...patch };
  db.prepare(
    `UPDATE projects SET name = @name, color = @color, icon = @icon, sort_order = @sort_order,
       updated_at = @updated_at WHERE id = @id AND user_id = @user_id`
  ).run({
    id,
    user_id: userId,
    name: merged.name,
    color: merged.color ?? null,
    icon: merged.icon ?? null,
    sort_order: merged.sortOrder ?? existing.sortOrder,
    updated_at: now(),
  });
  return getProject(db, userId, id);
}

/** Löscht ein Projekt des Nutzers inkl. Ebenen/Nodes/Edges. Das letzte bleibt. */
export function deleteProject(db, userId, id) {
  getProject(db, userId, id);
  const total = db.prepare('SELECT count(*) AS c FROM projects WHERE user_id = ?').get(userId).c;
  if (total <= 1) throw new ApiError(400, 'Das letzte Projekt kann nicht gelöscht werden');
  const viewIds = db.prepare('SELECT id FROM views WHERE project_id = ?').all(id).map((r) => r.id);
  const nodeCount = viewIds.length
    ? db
        .prepare(
          `SELECT count(*) AS c FROM nodes WHERE view_id IN (${viewIds.map(() => '?').join(',')})`
        )
        .get(...viewIds).c
    : 0;
  db.prepare('DELETE FROM projects WHERE id = ? AND user_id = ?').run(id, userId);
  return { views: viewIds.length, nodes: nodeCount };
}

// ── Views (Ebenen) ──────────────────────────────────────────────

function getViewRow(db, userId, id) {
  return db
    .prepare(
      'SELECT v.* FROM views v JOIN projects p ON v.project_id = p.id WHERE v.id = ? AND p.user_id = ?'
    )
    .get(id, userId);
}

/** Root-Ebene des (Default-)Projekts des Nutzers, oder null. */
export function defaultViewId(db, userId, projectId) {
  const project = projectId ?? defaultProjectId(db, userId);
  if (!project || !projectOwnedExists(db, userId, project)) return null;
  const root = db
    .prepare(
      'SELECT id FROM views WHERE project_id = ? AND parent_id IS NULL ORDER BY sort_order, created_at LIMIT 1'
    )
    .get(project);
  if (root) return root.id;
  return (
    db
      .prepare('SELECT id FROM views WHERE project_id = ? ORDER BY sort_order, created_at LIMIT 1')
      .get(project)?.id ?? null
  );
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

export function listViews(db, userId, { projectId } = {}) {
  if (projectId) {
    return db
      .prepare(
        `SELECT v.* FROM views v JOIN projects p ON v.project_id = p.id
         WHERE p.user_id = ? AND v.project_id = ? ORDER BY v.sort_order, v.created_at`
      )
      .all(userId, projectId)
      .map(rowToView);
  }
  return db
    .prepare(
      `SELECT v.* FROM views v JOIN projects p ON v.project_id = p.id
       WHERE p.user_id = ? ORDER BY v.sort_order, v.created_at`
    )
    .all(userId)
    .map(rowToView);
}

export function getView(db, userId, id) {
  const row = getViewRow(db, userId, id);
  if (!row) throw new ApiError(404, `Ebene "${id}" nicht gefunden`);
  return rowToView(row);
}

export function createView(db, userId, data) {
  const id = data.id || crypto.randomUUID();
  if (db.prepare('SELECT 1 FROM views WHERE id = ?').get(id)) {
    throw new ApiError(409, `Ebene "${id}" existiert bereits`);
  }
  const parent = data.parentId ? getViewRow(db, userId, data.parentId) : null;
  if (data.parentId && !parent) {
    throw new ApiError(400, `Parent-Ebene "${data.parentId}" existiert nicht`);
  }
  // Projekt: von der Parent-Ebene erben, sonst explizit oder Default-Projekt.
  const projectId = parent ? parent.project_id : data.projectId ?? defaultProjectId(db, userId);
  if (!projectId || !projectOwnedExists(db, userId, projectId)) {
    throw new ApiError(400, `Projekt "${projectId}" existiert nicht`);
  }
  const maxOrder =
    db.prepare('SELECT max(sort_order) AS m FROM views WHERE project_id = ?').get(projectId)?.m ?? -1;
  const ts = now();
  db.prepare(
    `INSERT INTO views (id, project_id, name, parent_id, description, color, icon, sort_order, created_at, updated_at)
     VALUES (@id, @project_id, @name, @parent_id, @description, @color, @icon, @sort_order, @created_at, @updated_at)`
  ).run({
    id,
    project_id: projectId,
    name: data.name,
    parent_id: data.parentId ?? null,
    description: data.description ?? '',
    color: data.color ?? null,
    icon: data.icon ?? null,
    sort_order: data.sortOrder ?? maxOrder + 1,
    created_at: ts,
    updated_at: ts,
  });
  return getView(db, userId, id);
}

export function updateView(db, userId, id, patch) {
  const existing = getView(db, userId, id);
  if (patch.parentId !== undefined && patch.parentId !== null) {
    if (patch.parentId === id) throw new ApiError(400, 'Eine Ebene kann nicht ihr eigener Parent sein');
    const parent = getViewRow(db, userId, patch.parentId);
    if (!parent) {
      throw new ApiError(400, `Parent-Ebene "${patch.parentId}" existiert nicht`);
    }
    if (parent.project_id !== existing.projectId) {
      throw new ApiError(400, 'Parent-Ebene muss im selben Projekt liegen');
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
  return getView(db, userId, id);
}

/**
 * Löscht eine Ebene inkl. Kind-Ebenen und deren Nodes/Edges (ON DELETE CASCADE).
 * Die letzte Ebene eines Projekts kann nicht gelöscht werden.
 */
export function deleteView(db, userId, id) {
  const view = getView(db, userId, id);
  const total = db
    .prepare('SELECT count(*) AS c FROM views WHERE project_id = ?')
    .get(view.projectId).c;
  if (total <= 1) throw new ApiError(400, 'Die letzte Ebene eines Projekts kann nicht gelöscht werden');

  // Betroffene Ebenen (inkl. Nachfahren) für die Rückgabe-Statistik sammeln.
  const affected = new Set([id]);
  let grew = true;
  const inProject = db.prepare('SELECT id, parent_id FROM views WHERE project_id = ?').all(view.projectId);
  while (grew) {
    grew = false;
    for (const v of inProject) {
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

export function listNodes(db, userId, { q, category, status, viewId, projectId } = {}) {
  const where = ['p.user_id = :userId'];
  const params = { userId };
  if (q) {
    where.push(
      "(n.name LIKE :q ESCAPE '\\' OR ifnull(n.ip,'') LIKE :q ESCAPE '\\'" +
        " OR ifnull(n.hostname,'') LIKE :q ESCAPE '\\' OR ifnull(n.url,'') LIKE :q ESCAPE '\\'" +
        " OR ifnull(n.os,'') LIKE :q ESCAPE '\\' OR ifnull(n.vlan,'') LIKE :q ESCAPE '\\')"
    );
    // LIKE-Wildcards (% _ \) in der Nutzereingabe escapen, damit sie literal suchen.
    params.q = `%${String(q).replace(/[\\%_]/g, '\\$&')}%`;
  }
  if (category) {
    where.push('n.category = :category');
    params.category = category;
  }
  if (status) {
    where.push('n.status = :status');
    params.status = status;
  }
  if (viewId) {
    where.push('n.view_id = :viewId');
    params.viewId = viewId;
  }
  if (projectId) {
    where.push('v.project_id = :projectId');
    params.projectId = projectId;
  }
  const sql = `SELECT n.* FROM nodes n
    JOIN views v ON n.view_id = v.id
    JOIN projects p ON v.project_id = p.id
    WHERE ${where.join(' AND ')} ORDER BY n.created_at`;
  return sortParentsFirst(db.prepare(sql).all(params).map(rowToNode));
}

export function getNode(db, userId, id) {
  const row = db
    .prepare(
      `SELECT n.* FROM nodes n
       JOIN views v ON n.view_id = v.id
       JOIN projects p ON v.project_id = p.id
       WHERE n.id = ? AND p.user_id = ?`
    )
    .get(id, userId);
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

export function createNode(db, userId, data) {
  const id = data.id || crypto.randomUUID();
  // Node-IDs sind global eindeutig (Primärschlüssel).
  if (db.prepare('SELECT 1 FROM nodes WHERE id = ?').get(id)) {
    throw new ApiError(409, `Node "${id}" existiert bereits`);
  }
  if (data.parentId && !nodeOwnedExists(db, userId, data.parentId)) {
    throw new ApiError(400, `Parent-Node "${data.parentId}" existiert nicht`);
  }
  const viewId = data.viewId ?? defaultViewId(db, userId);
  if (!viewId || !viewOwnedExists(db, userId, viewId)) {
    throw new ApiError(400, `Ebene "${data.viewId ?? viewId}" existiert nicht`);
  }
  if (data.linkedViewId && !viewOwnedExists(db, userId, data.linkedViewId)) {
    throw new ApiError(400, `Verlinkte Ebene "${data.linkedViewId}" existiert nicht`);
  }
  const ts = now();
  db.prepare(INSERT_NODE).run(
    nodeToRow({ ...data, id, viewId }, { created_at: ts, updated_at: ts })
  );
  return getNode(db, userId, id);
}

/** Sammelt einen Node samt aller Nachfahren (über parent_id). */
function collectSubtree(db, rootId) {
  const ids = new Set([rootId]);
  const childStmt = db.prepare('SELECT id FROM nodes WHERE parent_id = ?');
  const queue = [rootId];
  while (queue.length) {
    for (const row of childStmt.all(queue.shift())) {
      if (!ids.has(row.id)) {
        ids.add(row.id);
        queue.push(row.id);
      }
    }
  }
  return [...ids];
}

/**
 * Verschiebt einen Node samt Nachfahren in eine andere Ebene und hält die
 * Intra-View-Invariante der Kanten aufrecht.
 */
function migrateNodeSubtreeView(db, rootId, newViewId, ts) {
  const subtree = collectSubtree(db, rootId);
  const ph = subtree.map(() => '?').join(',');
  db.prepare(`UPDATE nodes SET view_id = ?, updated_at = ? WHERE id IN (${ph})`).run(
    newViewId,
    ts,
    ...subtree
  );
  const affectedEdges = db
    .prepare(
      `SELECT id, source_id, target_id FROM edges WHERE source_id IN (${ph}) OR target_id IN (${ph})`
    )
    .all(...subtree, ...subtree);
  const setView = db.prepare('UPDATE edges SET view_id = ?, updated_at = ? WHERE id = ?');
  const del = db.prepare('DELETE FROM edges WHERE id = ?');
  for (const e of affectedEdges) {
    const sv = nodeViewId(db, e.source_id);
    const tv = nodeViewId(db, e.target_id);
    if (sv && sv === tv) setView.run(sv, ts, e.id);
    else del.run(e.id);
  }
}

export function updateNode(db, userId, id, patch) {
  const existing = getNode(db, userId, id);
  if (patch.parentId !== undefined && patch.parentId !== null) {
    if (patch.parentId === id) throw new ApiError(400, 'Ein Node kann nicht sein eigener Parent sein');
    if (!nodeOwnedExists(db, userId, patch.parentId)) {
      throw new ApiError(400, `Parent-Node "${patch.parentId}" existiert nicht`);
    }
    if (wouldCreateCycle(db, id, patch.parentId)) {
      throw new ApiError(400, 'Parent-Zuordnung würde einen Zyklus erzeugen');
    }
  }
  if (patch.viewId !== undefined && patch.viewId !== null && !viewOwnedExists(db, userId, patch.viewId)) {
    throw new ApiError(400, `Ebene "${patch.viewId}" existiert nicht`);
  }
  if (
    patch.linkedViewId !== undefined &&
    patch.linkedViewId !== null &&
    !viewOwnedExists(db, userId, patch.linkedViewId)
  ) {
    throw new ApiError(400, `Verlinkte Ebene "${patch.linkedViewId}" existiert nicht`);
  }
  const merged = {
    ...existing,
    ...patch,
    position: patch.position ?? existing.position,
    customFields: patch.customFields ?? existing.customFields,
    id,
  };
  const viewChanged =
    patch.viewId !== undefined && patch.viewId !== null && patch.viewId !== existing.viewId;
  const ts = now();
  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE nodes SET name = @name, category = @category, status = @status, parent_id = @parent_id,
        view_id = @view_id, linked_view_id = @linked_view_id,
        pos_x = @pos_x, pos_y = @pos_y, width = @width, height = @height, ip = @ip, vlan = @vlan,
        os = @os, hostname = @hostname, url = @url, notes = @notes, custom_fields = @custom_fields,
        updated_at = @updated_at
      WHERE id = @id
    `).run(nodeToRow(merged, { created_at: existing.createdAt, updated_at: ts }));
    if (viewChanged) migrateNodeSubtreeView(db, id, merged.viewId, ts);
  });
  tx();
  return getNode(db, userId, id);
}

export function deleteNode(db, userId, id) {
  const node = getNode(db, userId, id);
  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE nodes SET parent_id = @newParent, pos_x = pos_x + @dx, pos_y = pos_y + @dy
      WHERE parent_id = @id
    `).run({ id, newParent: node.parentId ?? null, dx: node.position.x, dy: node.position.y });
    db.prepare('DELETE FROM edges WHERE source_id = ? OR target_id = ?').run(id, id);
    db.prepare('DELETE FROM nodes WHERE id = ?').run(id);
  });
  tx();
}

export function updatePositions(db, userId, positions) {
  // Nur Nodes des Nutzers aktualisieren (fremde IDs sind wirkungslos).
  const stmt = db.prepare(`
    UPDATE nodes SET pos_x = @x, pos_y = @y,
      width = coalesce(@width, width), height = coalesce(@height, height),
      updated_at = @updated_at
    WHERE id = @id AND view_id IN (
      SELECT v.id FROM views v JOIN projects p ON v.project_id = p.id WHERE p.user_id = @userId
    )
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
        userId,
      });
      updated += result.changes;
    }
  });
  tx();
  return updated;
}

// ── Edges ───────────────────────────────────────────────────────

export function listEdges(db, userId, { nodeId, viewId } = {}) {
  const where = ['p.user_id = :userId'];
  const params = { userId };
  if (nodeId) {
    where.push('(e.source_id = :nodeId OR e.target_id = :nodeId)');
    params.nodeId = nodeId;
  }
  if (viewId) {
    where.push('e.view_id = :viewId');
    params.viewId = viewId;
  }
  const sql = `SELECT e.* FROM edges e
    JOIN views v ON e.view_id = v.id
    JOIN projects p ON v.project_id = p.id
    WHERE ${where.join(' AND ')} ORDER BY e.created_at`;
  return db.prepare(sql).all(params).map(rowToEdge);
}

export function getEdge(db, userId, id) {
  const row = db
    .prepare(
      `SELECT e.* FROM edges e
       JOIN views v ON e.view_id = v.id
       JOIN projects p ON v.project_id = p.id
       WHERE e.id = ? AND p.user_id = ?`
    )
    .get(id, userId);
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

export function createEdge(db, userId, data) {
  const id = data.id || crypto.randomUUID();
  if (db.prepare('SELECT 1 FROM edges WHERE id = ?').get(id)) {
    throw new ApiError(409, `Edge "${id}" existiert bereits`);
  }
  for (const [field, ref] of [['sourceId', data.sourceId], ['targetId', data.targetId]]) {
    if (!nodeOwnedExists(db, userId, ref)) throw new ApiError(400, `${field}: Node "${ref}" existiert nicht`);
  }
  // Kanten sind intra-view: Quelle und Ziel müssen in derselben Ebene liegen.
  const sourceView = nodeViewId(db, data.sourceId);
  const targetView = nodeViewId(db, data.targetId);
  if (sourceView !== targetView) {
    throw new ApiError(400, 'Quelle und Ziel einer Verbindung müssen in derselben Ebene liegen');
  }
  // view_id ergibt sich aus den (bereits als eigen geprüften) Endknoten.
  const viewId = sourceView ?? defaultViewId(db, userId);
  const ts = now();
  db.prepare(INSERT_EDGE).run(
    edgeToRow({ ...data, id, viewId }, { created_at: ts, updated_at: ts })
  );
  return getEdge(db, userId, id);
}

export function updateEdge(db, userId, id, patch) {
  const existing = getEdge(db, userId, id);
  for (const field of ['sourceId', 'targetId']) {
    if (patch[field] !== undefined && !nodeOwnedExists(db, userId, patch[field])) {
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
  return getEdge(db, userId, id);
}

export function deleteEdge(db, userId, id) {
  getEdge(db, userId, id); // 404, falls nicht vorhanden/nicht eigen
  db.prepare('DELETE FROM edges WHERE id = ?').run(id);
}

// ── Graph (gesamt) ──────────────────────────────────────────────

/** Graph einer Ebene des Nutzers (Default: dessen Root-Ebene). */
export function getGraph(db, userId, viewId) {
  let view = viewId;
  if (view) {
    if (!viewOwnedExists(db, userId, view)) throw new ApiError(404, `Ebene "${view}" nicht gefunden`);
  } else {
    view = defaultViewId(db, userId);
  }
  if (!view) return { viewId: null, nodes: [], edges: [] };
  return {
    viewId: view,
    nodes: listNodes(db, userId, { viewId: view }),
    edges: listEdges(db, userId, { viewId: view }),
  };
}

export function exportGraph(db, userId) {
  return {
    version: 3,
    exportedAt: now(),
    projects: listProjects(db, userId),
    views: listViews(db, userId),
    nodes: listNodes(db, userId),
    edges: listEdges(db, userId),
  };
}

/**
 * Importiert einen kompletten Graphen für den Nutzer (mode=replace): ersetzt NUR
 * die Daten dieses Nutzers, nicht die anderer. Referenzen werden vorab geprüft und
 * beim Insert an die Projekte/Ebenen des Nutzers gebunden.
 */
export function importGraph(db, userId, { projects = [], views = [], nodes, edges }) {
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
    // Nur die eigenen Daten löschen (Kaskade: projects → views → nodes/edges).
    db.prepare('DELETE FROM projects WHERE user_id = ?').run(userId);

    const insertProject = db.prepare(
      `INSERT INTO projects (id, user_id, name, color, icon, sort_order, created_at, updated_at)
       VALUES (@id, @user_id, @name, @color, @icon, @sort_order, @created_at, @updated_at)`
    );
    projects.forEach((p, i) => {
      insertProject.run({
        id: p.id,
        user_id: userId,
        name: p.name,
        color: p.color ?? null,
        icon: p.icon ?? null,
        sort_order: p.sortOrder ?? i,
        created_at: p.createdAt ?? ts,
        updated_at: ts,
      });
    });
    // Immer mindestens ein Projekt für den Nutzer.
    let defaultProject = defaultProjectId(db, userId);
    if (!defaultProject) {
      defaultProject = crypto.randomUUID();
      insertProject.run({
        id: defaultProject,
        user_id: userId,
        name: 'Mein Projekt',
        color: '#38bdf8',
        icon: 'boxes',
        sort_order: 0,
        created_at: ts,
        updated_at: ts,
      });
    }
    const projectIds = new Set(
      db.prepare('SELECT id FROM projects WHERE user_id = ?').all(userId).map((r) => r.id)
    );
    const resolveProject = (id) => (id && projectIds.has(id) ? id : defaultProject);

    const insertView = db.prepare(
      `INSERT INTO views (id, project_id, name, parent_id, description, color, icon, sort_order, created_at, updated_at)
       VALUES (@id, @project_id, @name, @parent_id, @description, @color, @icon, @sort_order, @created_at, @updated_at)`
    );
    sortParentsFirst(views).forEach((v, i) => {
      insertView.run({
        id: v.id,
        project_id: resolveProject(v.projectId),
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

    // Immer mindestens eine Ebene; alles ohne gültige (eigene) Ebene → Root.
    const rootId = ensureRootView(db, defaultProject);
    const viewIds = new Set(
      db
        .prepare('SELECT v.id AS id FROM views v JOIN projects p ON v.project_id = p.id WHERE p.user_id = ?')
        .all(userId)
        .map((r) => r.id)
    );
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
  const counts = db
    .prepare(
      `SELECT
        (SELECT count(*) FROM projects WHERE user_id = @u) AS projects,
        (SELECT count(*) FROM views v JOIN projects p ON v.project_id = p.id WHERE p.user_id = @u) AS views,
        (SELECT count(*) FROM nodes n JOIN views v ON n.view_id = v.id JOIN projects p ON v.project_id = p.id WHERE p.user_id = @u) AS nodes,
        (SELECT count(*) FROM edges e JOIN views v ON e.view_id = v.id JOIN projects p ON v.project_id = p.id WHERE p.user_id = @u) AS edges`
    )
    .get({ u: userId });
  return counts;
}

/**
 * Wendet das deterministische Auto-Layout auf eine Ebene des Nutzers an.
 */
export function applyLayout(db, userId, options = {}) {
  const viewId = options.viewId ?? defaultViewId(db, userId);
  if (!viewId || !viewOwnedExists(db, userId, viewId)) {
    throw new ApiError(404, `Ebene "${options.viewId ?? viewId}" nicht gefunden`);
  }
  const nodes = listNodes(db, userId, { viewId });
  const edges = listEdges(db, userId, { viewId });
  const laid = computeLayout(nodes, edges, options);
  const ts = now();
  const stmt = db.prepare(`
    UPDATE nodes SET pos_x = @x, pos_y = @y, width = @width, height = @height, updated_at = @updated_at
    WHERE id = @id
  `);
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
