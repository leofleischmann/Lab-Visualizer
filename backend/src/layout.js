/**
 * Deterministisches Auto-Layout für den Infrastruktur-Graphen.
 * Beeinflusst: backend/src/store.js (applyLayout), routes/graph.js, scripts/layout-lab.mjs
 *
 * Regeln (immer gleiche Eingabe -> gleiche Ausgabe):
 * 1. Layout-Einheiten = Zonen (group) oder freistehende Top-Level-Nodes
 * 2. Einheiten werden in Schichten angeordnet (Longest-Path entlang der Kantenrichtung)
 * 3. Reihenfolge innerhalb einer Schicht per Barycenter-Heuristik (weniger Kreuzungen)
 * 4. Kinder innerhalb einer Zone: sortiert nach externer Schicht + Grad, dann Raster
 */

/** Raster-Abstände (px) — synchron zu React-Flow-Nodebreite ~230px */
export const CELL_X = 300;
export const CELL_Y = 150;
export const PAD_X = 48;
export const PAD_Y = 72;
export const ENTITY_GAP_X = 120;
export const LAYER_GAP_Y = 160;

/** Kategorie-Hints für Schicht 0, wenn der Graph Zyklen hat oder keine Quellen */
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

/** Einheit, in der auf Top-Level platziert wird */
function entityOf(node, byId) {
  if (node.parentId) return node.parentId;
  if (isGroup(node)) return node.id;
  return node.id;
}

function compareIds(a, b) {
  return a.localeCompare(b, 'en');
}

function gridMetrics(count, cols) {
  const columns = Math.max(1, cols);
  const rows = Math.ceil(count / columns) || 1;
  return {
    cols: columns,
    rows,
    width: PAD_X * 2 + columns * CELL_X,
    height: PAD_Y * 2 + rows * CELL_Y + 40,
  };
}

function gridPosition(index, cols) {
  const col = index % cols;
  const row = Math.floor(index / cols);
  return { x: PAD_X + col * CELL_X, y: PAD_Y + row * CELL_Y };
}

/** Median (deterministisch; bei gerader Länge unteres Mittel) */
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
    const e = entityOf(node, byId);
    entities.add(e);
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
      const nextLayer = Math.max(layer.get(next) ?? 0, base + 1);
      layer.set(next, nextLayer);
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

  for (let pass = 0; pass < 4; pass++) {
    for (const l of layers) {
      const ids = byLayer.get(l);
      const scored = ids.map((id) => {
        const prev = [...(rev.get(id) ?? [])];
        const next = [...(adj.get(id) ?? [])];
        const prevIdx = prev.map((p) => indexInLayer.get(p)).filter((v) => v !== undefined);
        const nextIdx = next.map((n) => indexInLayer.get(n)).filter((v) => v !== undefined);
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

function orderChildren(parentId, childIds, edges, byId, entityLayer) {
  if (childIds.length <= 1) return [...childIds].sort(compareIds);

  const childSet = new Set(childIds);
  const out = new Map(childIds.map((id) => [id, 0]));
  const ext = new Map(childIds.map((id) => [id, []]));

  for (const edge of edges) {
    const src = edge.sourceId;
    const tgt = edge.targetId;
    if (childSet.has(src) && childSet.has(tgt)) {
      out.set(src, (out.get(src) ?? 0) + 1);
    }
    for (const [nodeId, otherId] of [
      [src, tgt],
      [tgt, src],
    ]) {
      if (!childSet.has(nodeId)) continue;
      const other = byId.get(otherId);
      if (!other) continue;
      const ent = entityOf(other, byId);
      if (ent === parentId) continue;
      ext.get(nodeId).push(entityLayer.get(ent) ?? 0);
    }
  }

  return [...childIds].sort((a, b) => {
    const ea = median(ext.get(a) ?? []);
    const eb = median(ext.get(b) ?? []);
    return ea - eb || (out.get(b) - out.get(a)) || compareIds(a, b);
  });
}

function defaultCols(count, maxCols) {
  if (count <= 1) return 1;
  if (count <= 3) return count;
  const capped = Math.min(maxCols, 5);
  return Math.min(capped, Math.ceil(Math.sqrt(count)));
}

/**
 * Berechnet neue Positionen und Zonengrößen.
 * @param {import('./store.js').rowToNode extends Function ? object[] : object[]} nodes
 * @param {object[]} edges
 * @param {{ maxCols?: number }} [options]
 */
export function computeLayout(nodes, edges, options = {}) {
  const maxCols = options.maxCols ?? 5;
  if (!nodes.length) return [];

  const { byId, childrenOf, entities, adj, rev } = buildEntityGraph(nodes, edges);
  const entityLayer = assignLayers(entities, adj, rev, byId, childrenOf);
  const byLayer = orderWithinLayers(entities, entityLayer, adj, rev);

  const entitySize = new Map();
  const childLayout = new Map();

  for (const entityId of entities) {
    const node = byId.get(entityId);
    const rawChildren = childrenOf.get(entityId) ?? [];
    if (isGroup(node) && rawChildren.length) {
      const ordered = orderChildren(entityId, rawChildren, edges, byId, entityLayer);
      const cols = defaultCols(ordered.length, maxCols);
      const { width, height } = gridMetrics(ordered.length, cols);
      entitySize.set(entityId, { width, height });
      const positions = new Map();
      ordered.forEach((childId, i) => positions.set(childId, gridPosition(i, cols)));
      childLayout.set(entityId, positions);
    } else if (isGroup(node)) {
      entitySize.set(entityId, { width: gridMetrics(1, 1).width, height: gridMetrics(1, 1).height });
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
      const size = entitySize.get(id) ?? { width: 400, height: 200 };
      entityPos.set(id, { x, y });
      x += size.width + ENTITY_GAP_X;
      rowHeight = Math.max(rowHeight, size.height);
    }
    y += rowHeight + LAYER_GAP_Y;
  }

  return nodes.map((node) => {
    const entityId = entityOf(node, byId);
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

    const pos = entityPos.get(entityId);
    if (pos) copy.position = { ...pos };
    return copy;
  });
}
