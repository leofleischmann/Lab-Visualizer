/**
 * Deterministisches Auto-Layout für den Infrastruktur-Graphen.
 * Beeinflusst: backend/src/store.js (applyLayout), routes/graph.js, scripts/layout-lab.mjs
 *
 * Regeln (immer gleiche Eingabe -> gleiche Ausgabe):
 * 1. Layout-Einheiten = Zonen (group) oder freistehende Top-Level-Nodes
 * 2. Einheiten in Schichten entlang der Kantenrichtung (Longest-Path)
 * 3. Reihenfolge pro Schicht per Barycenter (weniger Kreuzungen)
 * 4. Kinder in Zonen: Spalten entlang interner Kanten (links->rechts = Fluss), sonst Raster
 * 5. Mehr Abstand zwischen Zellen, damit Pfade und Labels Luft haben
 */

/** Raster-Abstände (px) — synchron zu React-Flow-Nodebreite ~230px */
export const CELL_X = 340;
export const CELL_Y = 180;
export const PAD_X = 56;
export const PAD_Y = 80;
export const ENTITY_GAP_X = 160;
export const LAYER_GAP_Y = 220;

const CATEGORY_LAYER_HINT = {
  client: 0,
  internet: 0,
  domain: 1,
  'cloud-service': 1,
  email: 1,
  dns: 1,
  tunnel: 1,
  firewall: 1,
  auth: 1,
  router: 2,
  'reverse-proxy': 3,
  vpn: 3,
  ids: 3,
  monitoring: 4,
  database: 4,
  'docker-stack': 5,
  'web-app': 5,
  lxc: 5,
  vm: 5,
  'proxmox-host': 5,
  group: 2,
};

function isGroup(node) {
  return node.category === 'group';
}

function entityOf(node, byId) {
  if (node.parentId) return node.parentId;
  if (isGroup(node)) return node.id;
  return node.id;
}

function compareIds(a, b) {
  return a.localeCompare(b, 'en');
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

function layerHintForEntity(entityId, byId, childrenOf) {
  const node = byId.get(entityId);
  if (!node) return 99;
  if (isGroup(node)) {
    const kids = childrenOf.get(entityId) ?? [];
    if (!kids.length) return CATEGORY_LAYER_HINT.group ?? 2;
    return Math.min(...kids.map((id) => layerHintForNode(byId.get(id))));
  }
  return layerHintForNode(node);
}

function layerHintForNode(node) {
  if (!node) return 99;
  return CATEGORY_LAYER_HINT[node.category] ?? 4;
}

function buildEntityGraph(nodes, edges) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const childrenOf = new Map();
  const entities = new Set();

  for (const node of nodes) {
    entities.add(entityOf(node, byId));
    if (node.parentId) {
      if (!childrenOf.has(node.parentId)) childrenOf.set(node.parentId, []);
      childrenOf.get(node.parentId).push(node.id);
    }
  }

  const adj = new Map();
  const rev = new Map();
  const addEdge = (from, to) => {
    if (from === to) return;
    if (!adj.has(from)) adj.set(from, new Set());
    if (!rev.has(to)) rev.set(to, new Set());
    adj.get(from).add(to);
    rev.get(to).add(from);
  };

  for (const edge of edges) {
    const from = entityOf(byId.get(edge.sourceId), byId);
    const to = entityOf(byId.get(edge.targetId), byId);
    addEdge(from, to);
  }

  for (const id of entities) {
    if (!adj.has(id)) adj.set(id, new Set());
    if (!rev.has(id)) rev.set(id, new Set());
  }

  return { byId, childrenOf, entities: [...entities].sort(compareIds), adj, rev };
}

function assignLayers(entities, adj, rev, byId, childrenOf) {
  const layer = new Map();
  const indegree = new Map(entities.map((id) => [id, rev.get(id)?.size ?? 0]));

  const queue = entities
    .filter((id) => indegree.get(id) === 0)
    .sort((a, b) => {
      const ha = layerHintForEntity(a, byId, childrenOf);
      const hb = layerHintForEntity(b, byId, childrenOf);
      return ha - hb || compareIds(a, b);
    });

  if (!queue.length) {
    for (const id of entities) {
      layer.set(id, layerHintForEntity(id, byId, childrenOf));
    }
    return layer;
  }

  for (const id of queue) layer.set(id, 0);

  const visited = new Set(queue);
  while (queue.length) {
    const id = queue.shift();
    const base = layer.get(id);
    for (const next of [...(adj.get(id) ?? [])].sort(compareIds)) {
      layer.set(next, Math.max(layer.get(next) ?? 0, base + 1));
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
    queue.sort((a, b) => (layer.get(a) - layer.get(b)) || compareIds(a, b));
  }

  for (const id of entities) {
    if (!layer.has(id)) layer.set(id, layerHintForEntity(id, byId, childrenOf));
  }

  return layer;
}

function orderWithinLayers(entities, layer, adj, rev) {
  const byLayer = new Map();
  for (const id of entities) {
    const l = layer.get(id);
    if (!byLayer.has(l)) byLayer.set(l, []);
    byLayer.get(l).push(id);
  }

  const indexInLayer = new Map();
  const layers = [...byLayer.keys()].sort((a, b) => a - b);

  for (const l of layers) {
    byLayer.get(l).sort(compareIds);
    byLayer.get(l).forEach((id, i) => indexInLayer.set(id, i));
  }

  for (let pass = 0; pass < 6; pass++) {
    for (const l of layers) {
      const ids = byLayer.get(l);
      const scored = ids.map((id) => {
        const prevIdx = [...(rev.get(id) ?? [])]
          .map((p) => indexInLayer.get(p))
          .filter((v) => v !== undefined);
        const nextIdx = [...(adj.get(id) ?? [])]
          .map((n) => indexInLayer.get(n))
          .filter((v) => v !== undefined);
        return {
          id,
          score: pass % 2 === 0 ? median(prevIdx) : median(nextIdx),
        };
      });
      scored.sort((a, b) => a.score - b.score || compareIds(a.id, b.id));
      scored.forEach((s, i) => indexInLayer.set(s.id, i));
      byLayer.set(
        l,
        scored.map((s) => s.id)
      );
    }
  }

  return byLayer;
}

function buildIntraZoneGraph(childIds, edges) {
  const childSet = new Set(childIds);
  const adj = new Map(childIds.map((id) => [id, new Set()]));
  const rev = new Map(childIds.map((id) => [id, new Set()]));
  let hasInternal = false;

  for (const edge of edges) {
    if (!childSet.has(edge.sourceId) || !childSet.has(edge.targetId)) continue;
    hasInternal = true;
    adj.get(edge.sourceId).add(edge.targetId);
    rev.get(edge.targetId).add(edge.sourceId);
  }

  return { adj, rev, hasInternal, childSet };
}

/** Spalten innerhalb einer Zone entlang interner Kanten (Quelle links, Senke rechts). */
function assignIntraZoneColumns(childIds, adj, rev) {
  const col = new Map(childIds.map((id) => [id, 0]));
  const indegree = new Map(childIds.map((id) => [id, rev.get(id).size]));
  const queue = childIds.filter((id) => indegree.get(id) === 0).sort(compareIds);

  if (queue.length) {
    const visited = new Set();
    while (queue.length) {
      const id = queue.shift();
      visited.add(id);
      for (const next of [...adj.get(id)].sort(compareIds)) {
        col.set(next, Math.max(col.get(next), col.get(id) + 1));
        indegree.set(next, indegree.get(next) - 1);
        if (indegree.get(next) === 0 && !visited.has(next)) queue.push(next);
      }
      queue.sort(compareIds);
    }
  }

  const maxCol = Math.max(...col.values());
  const columns = [];
  for (let c = 0; c <= maxCol; c++) {
    const ids = childIds.filter((id) => col.get(id) === c);
    if (ids.length) columns.push(ids);
  }
  return columns;
}

function externalBarycenter(nodeId, edges, byId, parentId, entityOrder) {
  const scores = [];
  for (const edge of edges) {
    for (const [here, there] of [
      [edge.sourceId, edge.targetId],
      [edge.targetId, edge.sourceId],
    ]) {
      if (here !== nodeId) continue;
      const other = byId.get(there);
      if (!other) continue;
      const ent = entityOf(other, byId);
      if (ent === parentId) continue;
      if (entityOrder.has(ent)) scores.push(entityOrder.get(ent));
    }
  }
  return median(scores);
}

function orderRowIds(rowIds, edges, byId, parentId, entityOrder) {
  return [...rowIds].sort((a, b) => {
    const ba = externalBarycenter(a, edges, byId, parentId, entityOrder);
    const bb = externalBarycenter(b, edges, byId, parentId, entityOrder);
    return ba - bb || compareIds(a, b);
  });
}

function chunkRow(ids, cols) {
  const rows = [];
  for (let i = 0; i < ids.length; i += cols) {
    rows.push(ids.slice(i, i + cols));
  }
  return rows;
}

function defaultCols(count, maxCols) {
  if (count <= 1) return 1;
  if (count <= 3) return count;
  const capped = Math.min(maxCols, 4);
  return Math.min(capped, Math.ceil(Math.sqrt(count)));
}

/**
 * Layout für Kinder einer Zone: Spaltenfluss bei internen Kanten, sonst kompaktes Raster.
 */
function layoutZoneChildren(parentId, childIds, edges, byId, entityOrder, maxCols) {
  if (!childIds.length) {
    return { positions: new Map(), width: 400, height: 200 };
  }

  const { adj, rev, hasInternal } = buildIntraZoneGraph(childIds, edges);

  const positions = new Map();
  let width = 0;
  let height = 0;

  if (hasInternal) {
    const columns = assignIntraZoneColumns(childIds, adj, rev).map((column) =>
      orderRowIds(column, edges, byId, parentId, entityOrder)
    );
    let x = PAD_X;
    let maxHeight = 0;
    for (const column of columns) {
      let y = PAD_Y;
      for (const id of column) {
        positions.set(id, { x, y });
        y += CELL_Y;
      }
      maxHeight = Math.max(maxHeight, y + 48);
      x += CELL_X;
    }
    width = x + PAD_X;
    height = maxHeight;
  } else {
    const ordered = orderRowIds(childIds, edges, byId, parentId, entityOrder);
    const rows = chunkRow(ordered, defaultCols(ordered.length, maxCols));
    let y = PAD_Y;
    let maxRowWidth = 0;
    for (const row of rows) {
      let x = PAD_X;
      for (const id of row) {
        positions.set(id, { x, y });
        x += CELL_X;
      }
      maxRowWidth = Math.max(maxRowWidth, x + PAD_X);
      y += CELL_Y;
    }
    width = maxRowWidth;
    height = y + 48;
  }

  return { positions, width, height };
}

export function computeLayout(nodes, edges, options = {}) {
  const maxCols = options.maxCols ?? 5;
  if (!nodes.length) return [];

  const { byId, childrenOf, entities, adj, rev } = buildEntityGraph(nodes, edges);
  const entityLayer = assignLayers(entities, adj, rev, byId, childrenOf);
  const byLayer = orderWithinLayers(entities, entityLayer, adj, rev);

  const entityOrder = new Map();
  for (const [l, ids] of byLayer) {
    ids.forEach((id, i) => entityOrder.set(id, l * 1000 + i));
  }

  const entitySize = new Map();
  const childLayout = new Map();

  for (const entityId of entities) {
    const node = byId.get(entityId);
    const rawChildren = childrenOf.get(entityId) ?? [];
    if (isGroup(node) && rawChildren.length) {
      const { positions, width, height } = layoutZoneChildren(
        entityId,
        rawChildren,
        edges,
        byId,
        entityOrder,
        maxCols
      );
      entitySize.set(entityId, { width, height });
      childLayout.set(entityId, positions);
    } else if (isGroup(node)) {
      entitySize.set(entityId, { width: PAD_X * 2 + CELL_X, height: PAD_Y * 2 + CELL_Y + 48 });
    } else {
      entitySize.set(entityId, { width: CELL_X + PAD_X * 2, height: CELL_Y + PAD_Y * 2 });
    }
  }

  const entityPos = new Map();
  const layers = [...byLayer.keys()].sort((a, b) => a - b);
  let y = 0;

  for (const l of layers) {
    const ids = byLayer.get(l);
    let x = 0;
    let rowHeight = 0;
    for (const id of ids) {
      const size = entitySize.get(id) ?? { width: 440, height: 240 };
      entityPos.set(id, { x, y });
      x += size.width + ENTITY_GAP_X;
      rowHeight = Math.max(rowHeight, size.height);
    }
    y += rowHeight + LAYER_GAP_Y;
  }

  return nodes.map((node) => {
    const copy = { ...node, position: { ...node.position } };

    if (node.parentId) {
      const rel = childLayout.get(node.parentId)?.get(node.id);
      if (rel) copy.position = { ...rel };
      return copy;
    }

    if (isGroup(node)) {
      const pos = entityPos.get(node.id);
      const size = entitySize.get(node.id);
      if (pos) copy.position = { ...pos };
      if (size) {
        copy.width = size.width;
        copy.height = size.height;
      }
      return copy;
    }

    const pos = entityPos.get(entityOf(node, byId));
    if (pos) copy.position = { ...pos };
    return copy;
  });
}
