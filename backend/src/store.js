import crypto from 'node:crypto';
import { ApiError } from './validation.js';
import { ensureRootView } from './db.js';
import { computeLayout } from './layout.js';
import { decodeDataUrl } from './assets.js';
import { normalizePacks, DEFAULT_PACKS } from './catalog/index.js';
import {
  assertCanCreateProject,
  assertCanCreateView,
  assertCanCreateNode,
  assertCanCreateAsset,
  assertImportWithinLimits,
  getMaxAssetBytes,
} from './limits.js';

const now = () => new Date().toISOString();

// ── Serialisierung ──────────────────────────────────────────────

function rowToProject(row) {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    icon: row.icon,
    // normalizePacks verwirft IDs, die der Katalog nicht (mehr) kennt — ein
    // entferntes Pack macht das Projekt dadurch nicht unlesbar.
    packs: normalizePacks(JSON.parse(row.packs || '[]')),
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
    icon: row.icon,
    fields: JSON.parse(row.fields || '{}'),
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
/** Projekt, zu dem eine Ebene gehört. */
function viewProjectId(db, id) {
  return db.prepare('SELECT project_id FROM views WHERE id = ?').get(id)?.project_id ?? null;
}

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

// ── Assets (hochgeladene Bilder) ────────────────────────────────
//
// Ein Bild wird an zwei Stellen referenziert: als Node-Icon (`asset:<id>`) und
// als Bild in einer Markdown-Notiz (`/api/assets/<id>`). Beide Formen muessen
// beim Export gefunden und beim Merge-Import umgeschrieben werden — sonst
// zeigt eine geteilte Kopie auf Bilder, die dem anderen Konto gar nicht
// gehoeren.
const ASSET_ICON_PREFIX = 'asset:';
const ASSET_URL_RE = /\/api\/assets\/([A-Za-z0-9_.:-]{1,64})/g;

/** Alle Bild-IDs, die diese Nodes referenzieren (Icon oder Notiz). */
function collectAssetIds(nodes) {
  const ids = new Set();
  for (const node of nodes) {
    if (node.icon?.startsWith(ASSET_ICON_PREFIX)) {
      ids.add(node.icon.slice(ASSET_ICON_PREFIX.length));
    }
    for (const m of (node.notes ?? '').matchAll(ASSET_URL_RE)) ids.add(m[1]);
  }
  return ids;
}

/** Schreibt Icon- und Notiz-Referenzen auf neue Bild-IDs um (Merge-Import). */
function remapAssetRefs(node, assetMap) {
  const icon = node.icon?.startsWith(ASSET_ICON_PREFIX)
    ? ASSET_ICON_PREFIX + (assetMap.get(node.icon.slice(ASSET_ICON_PREFIX.length)) ?? '')
    : node.icon;
  const notes = (node.notes ?? '').replace(
    ASSET_URL_RE,
    (whole, id) => (assetMap.has(id) ? `/api/assets/${assetMap.get(id)}` : whole)
  );
  // Zeigte das Icon auf ein Bild, das der Payload nicht mitbringt, faellt der
  // Node auf sein Kategorie-Icon zurueck statt auf eine tote Referenz.
  return { ...node, icon: icon === ASSET_ICON_PREFIX ? null : icon, notes };
}

/** Bild als Data-URL — die Form, in der es im Export/Import reist. */
export function assetToDataUrl(asset) {
  return `data:${asset.mime};base64,${Buffer.from(asset.bytes).toString('base64')}`;
}
// Die Bytes bleiben absichtlich aus den Listen heraus: sie werden einzeln ueber
// GET /api/assets/:id ausgeliefert, damit der Browser sie cachen kann.

function rowToAsset(row) {
  return {
    id: row.id,
    name: row.name,
    mime: row.mime,
    byteSize: row.byte_size,
    createdAt: row.created_at,
  };
}

export function listAssets(db, userId) {
  return db
    .prepare(
      'SELECT id, name, mime, byte_size, created_at FROM assets WHERE user_id = ? ORDER BY created_at DESC'
    )
    .all(userId)
    .map(rowToAsset);
}

/** Metadaten UND Bytes — nur fuer das Ausliefern und den Export. */
export function getAssetWithBytes(db, userId, id) {
  const row = db.prepare('SELECT * FROM assets WHERE id = ? AND user_id = ?').get(id, userId);
  if (!row) throw new ApiError(404, `Bild "${id}" nicht gefunden`);
  return { ...rowToAsset(row), bytes: row.bytes };
}

export function createAsset(db, userId, { id, name, mime, bytes, createdAt }) {
  assertCanCreateAsset(db, userId);
  const assetId = id || crypto.randomUUID();
  if (db.prepare('SELECT 1 FROM assets WHERE id = ?').get(assetId)) {
    throw new ApiError(409, `Bild "${assetId}" existiert bereits`);
  }
  db.prepare(
    `INSERT INTO assets (id, user_id, name, mime, byte_size, bytes, created_at)
     VALUES (@id, @user_id, @name, @mime, @byte_size, @bytes, @created_at)`
  ).run({
    id: assetId,
    user_id: userId,
    name,
    mime,
    byte_size: bytes.length,
    bytes,
    created_at: createdAt ?? now(),
  });
  return listAssets(db, userId).find((a) => a.id === assetId);
}

/**
 * Loescht ein Bild. Nodes, die es als Icon nutzen, fallen auf das Icon ihrer
 * Kategorie zurueck — dafuer wird die Referenz mit entfernt, damit kein Node
 * dauerhaft auf ein totes Bild zeigt.
 */
export function deleteAsset(db, userId, id) {
  getAssetWithBytes(db, userId, id);
  const ref = `asset:${id}`;
  const tx = db.transaction(() => {
    const cleared = db
      .prepare(
        `UPDATE nodes SET icon = NULL, updated_at = @ts
         WHERE icon = @ref AND view_id IN (
           SELECT v.id FROM views v JOIN projects p ON v.project_id = p.id WHERE p.user_id = @userId
         )`
      )
      .run({ ref, ts: now(), userId }).changes;
    db.prepare('DELETE FROM assets WHERE id = ? AND user_id = ?').run(id, userId);
    return cleared;
  });
  return { clearedNodes: tx() };
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
  assertCanCreateProject(db, userId);
  const id = data.id || crypto.randomUUID();
  // Projekt-IDs sind global eindeutig (Primärschlüssel).
  if (db.prepare('SELECT 1 FROM projects WHERE id = ?').get(id)) {
    throw new ApiError(409, `Projekt "${id}" existiert bereits`);
  }
  const maxOrder =
    db.prepare('SELECT max(sort_order) AS m FROM projects WHERE user_id = ?').get(userId)?.m ?? -1;
  const ts = now();
  db.prepare(
    `INSERT INTO projects (id, user_id, name, color, icon, packs, sort_order, created_at, updated_at)
     VALUES (@id, @user_id, @name, @color, @icon, @packs, @sort_order, @created_at, @updated_at)`
  ).run({
    id,
    user_id: userId,
    name: data.name,
    color: data.color ?? null,
    icon: data.icon ?? null,
    packs: JSON.stringify(data.packs ? normalizePacks(data.packs) : DEFAULT_PACKS),
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
    `UPDATE projects SET name = @name, color = @color, icon = @icon, packs = @packs,
       sort_order = @sort_order, updated_at = @updated_at
     WHERE id = @id AND user_id = @user_id`
  ).run({
    id,
    user_id: userId,
    name: merged.name,
    color: merged.color ?? null,
    icon: merged.icon ?? null,
    // Packs abwählen löscht KEINE Daten: Werte zu Feldern eines inaktiven Packs
    // bleiben im Node erhalten (NodePanel zeigt sie unter „Weitere Felder").
    packs: JSON.stringify(normalizePacks(merged.packs)),
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
  assertCanCreateView(db, projectId);
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
  // Die Kaskade darf nicht sämtliche Ebenen des Projekts entfernen — sonst
  // bliebe ein Projekt ohne Ebene zurück (Root-Ebene mit allen Unterebenen).
  if (affected.size >= total) {
    throw new ApiError(
      400,
      'Diese Ebene kann nicht gelöscht werden: ihre Unterebenen umfassen alle Ebenen des Projekts'
    );
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
    // Durchsucht Name + die WERTE von fields/customFields. json_each ist nötig,
    // damit nicht die Schlüssel mitmatchen (ein LIKE auf das rohe JSON würde bei
    // "ip" jeden Node mit IP-Feld liefern). Deckungsgleich mit matchesSearch()
    // im Frontend — beide müssen dieselben Treffer liefern.
    where.push(
      "(n.name LIKE :q ESCAPE '\\'" +
        " OR EXISTS (SELECT 1 FROM json_each(n.fields) WHERE value LIKE :q ESCAPE '\\')" +
        " OR EXISTS (SELECT 1 FROM json_each(n.custom_fields) WHERE value LIKE :q ESCAPE '\\'))"
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
                     pos_x, pos_y, width, height, icon,
                     fields, custom_fields, notes, created_at, updated_at)
  VALUES (@id, @name, @category, @status, @parent_id, @view_id, @linked_view_id,
          @pos_x, @pos_y, @width, @height, @icon,
          @fields, @custom_fields, @notes, @created_at, @updated_at)`;

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
    icon: data.icon ?? null,
    fields: JSON.stringify(data.fields ?? {}),
    custom_fields: JSON.stringify(data.customFields ?? {}),
    notes: data.notes ?? '',
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
  // Ohne explizite Ebene erbt der Node die Ebene seines Parents (statt Root).
  const viewId =
    data.viewId ?? (data.parentId ? nodeViewId(db, data.parentId) : null) ?? defaultViewId(db, userId);
  if (!viewId || !viewOwnedExists(db, userId, viewId)) {
    throw new ApiError(400, `Ebene "${data.viewId ?? viewId}" existiert nicht`);
  }
  // Parent und Kind müssen in derselben Ebene liegen (Positionen sind relativ).
  if (data.parentId && nodeViewId(db, data.parentId) !== viewId) {
    throw new ApiError(400, 'Parent-Node muss in derselben Ebene liegen');
  }
  assertCanCreateNode(db, viewId);
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
  const targetViewId =
    patch.viewId !== undefined && patch.viewId !== null ? patch.viewId : existing.viewId;
  if (patch.parentId !== undefined && patch.parentId !== null) {
    if (patch.parentId === id) throw new ApiError(400, 'Ein Node kann nicht sein eigener Parent sein');
    if (!nodeOwnedExists(db, userId, patch.parentId)) {
      throw new ApiError(400, `Parent-Node "${patch.parentId}" existiert nicht`);
    }
    if (wouldCreateCycle(db, id, patch.parentId)) {
      throw new ApiError(400, 'Parent-Zuordnung würde einen Zyklus erzeugen');
    }
    // Positionen von Kindern sind relativ zum Parent → Parent muss in der
    // (Ziel-)Ebene des Nodes liegen.
    if (nodeViewId(db, patch.parentId) !== targetViewId) {
      throw new ApiError(400, 'Parent-Node muss in derselben Ebene liegen');
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
    // PATCH ersetzt fields/customFields als Ganzes (kein Deep-Merge), lässt sie
    // ohne Angabe aber unangetastet.
    fields: patch.fields ?? existing.fields,
    customFields: patch.customFields ?? existing.customFields,
    id,
  };
  const viewChanged =
    patch.viewId !== undefined && patch.viewId !== null && patch.viewId !== existing.viewId;
  // Ein Wechsel über Projektgrenzen bringt den kompletten Subtree ins Zielprojekt
  // und muss daher gegen dessen Node-Budget geprüft werden — sonst ließe sich das
  // Limit umgehen, indem man Nodes woanders anlegt und anschließend verschiebt.
  if (viewChanged && viewProjectId(db, existing.viewId) !== viewProjectId(db, merged.viewId)) {
    assertCanCreateNode(db, merged.viewId, collectSubtree(db, id).length);
  }
  // Wechselt der Node die Ebene, bleibt sein bisheriger Parent in der alten
  // Ebene zurück (nur der Subtree des Nodes wandert mit). Ohne explizit neuen
  // Parent wird der Node daher gelöst — mit absoluter Position, damit er in
  // der Ziel-Ebene nicht relativ zu einem fremden Parent „springt".
  if (viewChanged && patch.parentId === undefined && existing.parentId) {
    if (patch.position === undefined) {
      const posStmt = db.prepare('SELECT parent_id, pos_x, pos_y FROM nodes WHERE id = ?');
      let abs = { ...existing.position };
      let current = existing.parentId;
      let guard = 0;
      while (current && guard++ < 100) {
        const row = posStmt.get(current);
        if (!row) break;
        abs = { x: abs.x + row.pos_x, y: abs.y + row.pos_y };
        current = row.parent_id;
      }
      merged.position = abs;
    }
    merged.parentId = null;
  }
  const ts = now();
  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE nodes SET name = @name, category = @category, status = @status, parent_id = @parent_id,
        view_id = @view_id, linked_view_id = @linked_view_id,
        pos_x = @pos_x, pos_y = @pos_y, width = @width, height = @height, icon = @icon,
        fields = @fields, custom_fields = @custom_fields, notes = @notes,
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
      UPDATE nodes SET parent_id = @newParent, pos_x = pos_x + @dx, pos_y = pos_y + @dy,
        updated_at = @ts
      WHERE parent_id = @id
    `).run({
      id,
      newParent: node.parentId ?? null,
      dx: node.position.x,
      dy: node.position.y,
      ts: now(),
    });
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

export function listEdges(db, userId, { nodeId, viewId, projectId } = {}) {
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
  if (projectId) {
    where.push('v.project_id = :projectId');
    params.projectId = projectId;
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
  // Intra-View-Invariante gilt auch nach einem Endpunkt-Wechsel; die Ebene
  // einer Kante folgt immer ihren Endknoten (ein viewId-Patch wird ignoriert).
  const sourceView = nodeViewId(db, merged.sourceId);
  const targetView = nodeViewId(db, merged.targetId);
  if (sourceView !== targetView) {
    throw new ApiError(400, 'Quelle und Ziel einer Verbindung müssen in derselben Ebene liegen');
  }
  merged.viewId = sourceView;
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

/**
 * Export aller Daten des Nutzers — oder (mit `projectId`) nur eines Projekts,
 * z. B. um es zu teilen und beim Empfänger per `mode: "merge"` zu importieren.
 */
/** Bilder als Data-URL, wahlweise nur die von `usedIds` referenzierten. */
function exportAssets(db, userId, usedIds) {
  return listAssets(db, userId)
    .filter((a) => !usedIds || usedIds.has(a.id))
    .map((a) => {
      const full = getAssetWithBytes(db, userId, a.id);
      return {
        id: full.id,
        name: full.name,
        createdAt: full.createdAt,
        dataUrl: assetToDataUrl(full),
      };
    });
}

export function exportGraph(db, userId, projectId) {
  if (projectId) {
    const project = getProject(db, userId, projectId); // 404, falls fremd/fehlt
    const nodes = listNodes(db, userId, { projectId });
    return {
      version: 4,
      exportedAt: now(),
      projects: [project],
      views: listViews(db, userId, { projectId }),
      nodes,
      edges: listEdges(db, userId, { projectId }),
      // Nur die Bilder DIESES Projekts: ein geteilter Export soll nicht die
      // ganze Bibliothek des Kontos mitschleppen.
      assets: exportAssets(db, userId, collectAssetIds(nodes)),
    };
  }
  return {
    version: 4,
    exportedAt: now(),
    projects: listProjects(db, userId),
    views: listViews(db, userId),
    nodes: listNodes(db, userId),
    edges: listEdges(db, userId),
    assets: exportAssets(db, userId, null),
  };
}

/**
 * Importiert einen kompletten Graphen für den Nutzer (mode=replace): ersetzt NUR
 * die Daten dieses Nutzers, nicht die anderer. Referenzen werden vorab geprüft und
 * beim Insert an die Projekte/Ebenen des Nutzers gebunden.
 */
export function importGraph(db, userId, { mode = 'replace', projects = [], views = [], nodes, edges, assets = [] }) {
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
  if (mode === 'merge') return mergeGraph(db, userId, { projects, views, nodes, edges, assets });
  assertImportWithinLimits(db, userId, { projects, views, nodes });
  const ts = now();
  const tx = db.transaction(() => {
    db.pragma('defer_foreign_keys = ON');
    // Nur die eigenen Daten löschen (Kaskade: projects → views → nodes/edges).
    db.prepare('DELETE FROM projects WHERE user_id = ?').run(userId);
    // Bilder ebenso: `replace` ersetzt den gesamten Bestand des Kontos. Die IDs
    // aus dem Payload bleiben erhalten, damit die Referenzen in Icons und
    // Notizen weiter stimmen.
    db.prepare('DELETE FROM assets WHERE user_id = ?').run(userId);
    for (const a of assets) {
      const { bytes, mime } = decodeDataUrl(a.dataUrl, getMaxAssetBytes());
      createAsset(db, userId, { id: a.id, name: a.name, mime, bytes, createdAt: a.createdAt });
    }

    const insertProject = db.prepare(
      `INSERT INTO projects (id, user_id, name, color, icon, packs, sort_order, created_at, updated_at)
       VALUES (@id, @user_id, @name, @color, @icon, @packs, @sort_order, @created_at, @updated_at)`
    );
    projects.forEach((p, i) => {
      insertProject.run({
        id: p.id,
        user_id: userId,
        name: p.name,
        color: p.color ?? null,
        icon: p.icon ?? null,
        // Packs reisen mit dem Export mit. Ein Payload ohne `packs` (älterer
        // Export oder handgeschriebenes JSON) bekommt die Standardauswahl —
        // ein leeres Array bliebe sonst als „nur Kern" hängen.
        packs: JSON.stringify(p.packs ? normalizePacks(p.packs) : DEFAULT_PACKS),
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
        packs: JSON.stringify(DEFAULT_PACKS),
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
    const nodeView = new Map();
    for (const n of nodes) {
      const resolvedView = resolveView(n.viewId);
      nodeView.set(n.id, resolvedView);
      insertNode.run(
        nodeToRow(
          {
            ...n,
            viewId: resolvedView,
            linkedViewId: n.linkedViewId && viewIds.has(n.linkedViewId) ? n.linkedViewId : null,
          },
          { created_at: n.createdAt ?? ts, updated_at: ts }
        )
      );
    }
    // Parent-Kind-Paare müssen nach der Auflösung in derselben Ebene liegen.
    for (const n of nodes) {
      if (n.parentId && nodeView.get(n.parentId) !== nodeView.get(n.id)) {
        throw new ApiError(
          400,
          `Node "${n.id}": Parent "${n.parentId}" liegt in einer anderen Ebene`
        );
      }
    }
    const insertEdge = db.prepare(INSERT_EDGE);
    for (const e of edges) {
      // Kanten sind intra-view: Ebene folgt den Endknoten.
      const sourceView = nodeView.get(e.sourceId);
      if (sourceView !== nodeView.get(e.targetId)) {
        throw new ApiError(
          400,
          `Edge "${e.id ?? '(neu)'}": Quelle und Ziel liegen in unterschiedlichen Ebenen`
        );
      }
      insertEdge.run(
        edgeToRow(
          { ...e, id: e.id || crypto.randomUUID(), viewId: sourceView },
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
        (SELECT count(*) FROM edges e JOIN views v ON e.view_id = v.id JOIN projects p ON v.project_id = p.id WHERE p.user_id = @u) AS edges,
        (SELECT count(*) FROM assets WHERE user_id = @u) AS assets`
    )
    .get({ u: userId });
  return counts;
}

/**
 * Additiver Import (mode=merge): fügt die Projekte/Ebenen/Nodes/Kanten des
 * Payloads als NEUE Objekte hinzu, ohne Bestehendes anzutasten. Alle IDs werden
 * neu vergeben (inkl. Referenz-Remapping) — dadurch sind Kollisionen mit
 * vorhandenen Daten ausgeschlossen. Damit lassen sich exportierte Projekte
 * zwischen Konten teilen (Export mit `?projectId=` → Import mit mode=merge).
 */
function mergeGraph(db, userId, { projects, views, nodes, edges, assets = [] }) {
  const ts = now();
  // Instanz-Limits: Merge legt neue Projekte an (mindestens eines).
  const newProjects = projects.length ? projects : [{ name: 'Importiertes Projekt' }];
  assertCanCreateProject(db, userId, newProjects.length);
  // Neue Projekte starten leer; Ebenen und Nodes des Payloads sind ihr gesamter
  // Bestand — die Projektzahl ist oben bereits geprüft.
  assertImportWithinLimits(db, userId, { projects: [], views, nodes });

  const projectMap = new Map(); // alte Projekt-ID → neue ID
  const viewMap = new Map(); // alte Ebenen-ID → neue ID
  const nodeMap = new Map(); // alte Node-ID → neue ID
  const assetMap = new Map(); // alte Bild-ID → neue ID

  const tx = db.transaction(() => {
    // Bilder zuerst: die Nodes weiter unten brauchen die neuen IDs. Wie alles
    // andere beim Merge bekommen sie frische IDs, damit sie nicht mit der
    // vorhandenen Bibliothek des Kontos kollidieren.
    for (const a of assets) {
      const { bytes, mime } = decodeDataUrl(a.dataUrl, getMaxAssetBytes());
      const created = createAsset(db, userId, { name: a.name, mime, bytes });
      assetMap.set(a.id, created.id);
    }
    const maxOrder =
      db.prepare('SELECT max(sort_order) AS m FROM projects WHERE user_id = ?').get(userId)?.m ??
      -1;
    const insertProject = db.prepare(
      `INSERT INTO projects (id, user_id, name, color, icon, packs, sort_order, created_at, updated_at)
       VALUES (@id, @user_id, @name, @color, @icon, @packs, @sort_order, @created_at, @updated_at)`
    );
    const newProjectIds = [];
    newProjects.forEach((p, i) => {
      const newId = crypto.randomUUID();
      newProjectIds.push(newId);
      if (p.id) projectMap.set(p.id, newId);
      insertProject.run({
        id: newId,
        user_id: userId,
        name: p.name ?? 'Importiertes Projekt',
        color: p.color ?? null,
        icon: p.icon ?? null,
        packs: JSON.stringify(p.packs ? normalizePacks(p.packs) : DEFAULT_PACKS),
        sort_order: maxOrder + 1 + i,
        created_at: ts,
        updated_at: ts,
      });
    });
    const fallbackProject = newProjectIds[0];

    const insertView = db.prepare(
      `INSERT INTO views (id, project_id, name, parent_id, description, color, icon, sort_order, created_at, updated_at)
       VALUES (@id, @project_id, @name, @parent_id, @description, @color, @icon, @sort_order, @created_at, @updated_at)`
    );
    sortParentsFirst(views).forEach((v, i) => {
      const newId = crypto.randomUUID();
      viewMap.set(v.id, newId);
      insertView.run({
        id: newId,
        project_id: (v.projectId && projectMap.get(v.projectId)) ?? fallbackProject,
        name: v.name,
        parent_id: (v.parentId && viewMap.get(v.parentId)) ?? null,
        description: v.description ?? '',
        color: v.color ?? null,
        icon: v.icon ?? null,
        sort_order: v.sortOrder ?? i,
        created_at: ts,
        updated_at: ts,
      });
    });
    // Jedes neue Projekt braucht mindestens eine Ebene.
    for (const projectId of newProjectIds) ensureRootView(db, projectId);
    const fallbackView = ensureRootView(db, fallbackProject);

    const insertNode = db.prepare(INSERT_NODE);
    const nodeView = new Map();
    for (const n of nodes) nodeMap.set(n.id, crypto.randomUUID());
    for (const n of sortParentsFirst(nodes)) {
      const viewId = (n.viewId && viewMap.get(n.viewId)) ?? fallbackView;
      nodeView.set(n.id, viewId);
      if (n.parentId && nodeView.get(n.parentId) !== viewId) {
        throw new ApiError(400, `Node "${n.id}": Parent "${n.parentId}" liegt in einer anderen Ebene`);
      }
      insertNode.run(
        nodeToRow(
          {
            // Icon- und Notiz-Referenzen auf die neu vergebenen Bild-IDs
            // umschreiben, sonst zeigt die Kopie auf fremde Bilder.
            ...remapAssetRefs(n, assetMap),
            id: nodeMap.get(n.id),
            parentId: n.parentId ? nodeMap.get(n.parentId) : null,
            viewId,
            linkedViewId: (n.linkedViewId && viewMap.get(n.linkedViewId)) ?? null,
          },
          { created_at: n.createdAt ?? ts, updated_at: ts }
        )
      );
    }
    const insertEdge = db.prepare(INSERT_EDGE);
    for (const e of edges) {
      const sourceView = nodeView.get(e.sourceId);
      if (sourceView !== nodeView.get(e.targetId)) {
        throw new ApiError(
          400,
          `Edge "${e.id ?? '(neu)'}": Quelle und Ziel liegen in unterschiedlichen Ebenen`
        );
      }
      insertEdge.run(
        edgeToRow(
          {
            ...e,
            id: crypto.randomUUID(),
            sourceId: nodeMap.get(e.sourceId),
            targetId: nodeMap.get(e.targetId),
            viewId: sourceView,
          },
          { created_at: e.createdAt ?? ts, updated_at: ts }
        )
      );
    }
  });
  tx();
  return {
    mode: 'merge',
    projects: newProjects.length,
    views: viewMap.size || 1,
    nodes: nodes.length,
    edges: edges.length,
  };
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
