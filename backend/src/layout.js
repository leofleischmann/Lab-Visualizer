/**
 * Deterministisches Auto-Layout für den Infrastruktur-Graphen (generisch, nur Topologie).
 * Beeinflusst: backend/src/store.js (applyLayout), routes/graph.js, scripts/layout-lab.mjs
 *
 * Regeln (immer gleiche Eingabe -> gleiche Ausgabe):
 * 1. Layout-Einheiten = Zonen (group) oder freistehende Top-Level-Nodes
 * 2. Schichten entlang der Kantenrichtung (Longest-Path), Zyklen ab kleinster ID
 * 3. Hub-Nodes (hoher Grad) werden pro Schicht zur Mitte gezogen
 * 4. Reihenfolge pro Schicht per Barycenter (weniger Kreuzungen)
 * 5. Kinder in Zonen: Spaltenfluss bei internen Kanten, sonst Raster mit Hub-Mitte
 * 6. Überlappende Koordinaten werden aufgelöst
 */

/**
 * Massangaben in Canvas-Pixeln.
 *
 * NODE_W/NODE_H sind die TATSAECHLICHE Groesse eines Nodes in der UI und muessen
 * zu frontend/src/components/canvas/InfraNode.tsx passen (dort `w-[230px]`; die
 * Hoehe schwankt je nach angezeigten Feldern zwischen ~64 und ~92 px, hier
 * bewusst der obere Wert). Aendert sich die Node-Breite im Frontend, gehoert
 * dieser Wert nachgezogen — sonst stimmen alle Abstaende nicht mehr.
 *
 * Die uebrigen Werte sind ABSTAENDE, keine Groessen:
 *   CELL_X/CELL_Y   Rasterschritt fuer Kinder in einer Zone (Node + Luecke)
 *   PAD / PAD_TOP   Innenabstand einer Zone; oben mehr wegen des Zonentitels
 *   ENTITY_GAP_X    Luecke zwischen zwei Einheiten derselben Schicht
 *   LAYER_GAP_Y     Luecke zwischen zwei Schichten (Platz fuer Kantenlabels)
 *
 * Die Schrittweiten ergeben sich daraus als NODE_W + ENTITY_GAP_X = 350 bzw.
 * NODE_H + LAYER_GAP_Y = 222 und entsprechen damit dem von Hand gesetzten
 * Beispielprojekt (300-360 bzw. 180-200).
 */
const PROFILES = {
  default: {
    NODE_W: 230,
    NODE_H: 92,
    CELL_X: 340,
    CELL_Y: 180,
    PAD: 56,
    PAD_TOP: 80,
    ENTITY_GAP_X: 120,
    LAYER_GAP_Y: 130,
    LANE_STEP: 28,
  },
  wide: {
    NODE_W: 230,
    NODE_H: 92,
    CELL_X: 420,
    CELL_Y: 220,
    PAD: 72,
    PAD_TOP: 96,
    ENTITY_GAP_X: 190,
    LAYER_GAP_Y: 190,
    LANE_STEP: 36,
  },
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

function totalDegree(id, adj, rev) {
  return (adj.get(id)?.size ?? 0) + (rev.get(id)?.size ?? 0);
}

function buildDegreeMap(entities, adj, rev) {
  const map = new Map();
  for (const id of entities) map.set(id, totalDegree(id, adj, rev));
  return map;
}

/** Slot-Indizes: höchster Score (Rank 0) landet in der Mitte */
function centerSlotIndices(n) {
  if (n <= 0) return [];
  const slots = Array.from({ length: n }, (_, i) => i);
  const center = (n - 1) / 2;
  slots.sort(
    (a, b) => Math.abs(a - center) - Math.abs(b - center) || a - b
  );
  return slots;
}

function orderByCenterHeavy(ids, scoreFn) {
  const sorted = [...ids].sort((a, b) => scoreFn(b) - scoreFn(a) || compareIds(a, b));
  const slots = centerSlotIndices(sorted.length);
  const result = new Array(sorted.length);
  sorted.forEach((id, rank) => {
    result[slots[rank]] = id;
  });
  return result;
}

function resolveOverlaps(positions, stepX, stepY) {
  const entries = [...positions.entries()].sort((a, b) => compareIds(a[0], b[0]));
  const used = new Set();
  for (const [id, pos] of entries) {
    let { x, y } = pos;
    let guard = 0;
    while (guard++ < 300) {
      const key = `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`;
      if (!used.has(key)) {
        used.add(key);
        positions.set(id, { x, y });
        break;
      }
      y += stepY;
    }
  }
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
    const fromNode = byId.get(edge.sourceId);
    const toNode = byId.get(edge.targetId);
    if (!fromNode || !toNode) continue;
    addEdge(entityOf(fromNode, byId), entityOf(toNode, byId));
  }

  for (const id of entities) {
    if (!adj.has(id)) adj.set(id, new Set());
    if (!rev.has(id)) rev.set(id, new Set());
  }

  return { byId, childrenOf, entities: [...entities].sort(compareIds), adj, rev };
}

function assignLayers(entities, adj, rev, degreeMap) {
  const layer = new Map();
  const indegree = new Map(entities.map((id) => [id, rev.get(id)?.size ?? 0]));

  let queue = entities
    .filter((id) => indegree.get(id) === 0)
    .sort((a, b) => (degreeMap.get(b) ?? 0) - (degreeMap.get(a) ?? 0) || compareIds(a, b));

  if (!queue.length) {
    const seed = entities[0];
    layer.set(seed, 0);
    queue = [seed];
  } else {
    for (const id of queue) layer.set(id, 0);
  }

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
    if (!layer.has(id)) {
      const preds = [...(rev.get(id) ?? [])];
      const fromPreds = preds.length ? Math.max(...preds.map((p) => layer.get(p) ?? 0)) + 1 : 0;
      layer.set(id, fromPreds);
    }
  }

  return layer;
}

function orderWithinLayers(entities, layer, adj, rev, degreeMap) {
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

  for (const l of layers) {
    const ids = byLayer.get(l);
    byLayer.set(l, orderByCenterHeavy(ids, (id) => degreeMap.get(id) ?? 0));
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

function childDegree(id, adj, rev, edges, childSet) {
  let deg = (adj.get(id)?.size ?? 0) + (rev.get(id)?.size ?? 0);
  for (const edge of edges) {
    if (edge.sourceId === id && !childSet.has(edge.targetId)) deg += 1;
    if (edge.targetId === id && !childSet.has(edge.sourceId)) deg += 1;
  }
  return deg;
}

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

  const maxCol = Math.max(...col.values(), 0);
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

function orderRowIds(rowIds, edges, byId, parentId, entityOrder, adj, rev, childSet) {
  return [...rowIds].sort((a, b) => {
    const ba = externalBarycenter(a, edges, byId, parentId, entityOrder);
    const bb = externalBarycenter(b, edges, byId, parentId, entityOrder);
    const da = childDegree(a, adj, rev, edges, childSet);
    const db = childDegree(b, adj, rev, edges, childSet);
    return ba - bb || db - da || compareIds(a, b);
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

function externalOutCount(nodeId, edges, childSet) {
  let c = 0;
  for (const edge of edges) {
    if (edge.sourceId === nodeId && !childSet.has(edge.targetId)) c += 1;
  }
  return c;
}

function layoutZoneChildren(parentId, childIds, edges, byId, entityOrder, maxCols, metrics) {
  const { NODE_W, NODE_H, CELL_X, CELL_Y, PAD, PAD_TOP, LANE_STEP } = metrics;
  if (!childIds.length) {
    return { positions: new Map(), width: PAD * 2 + NODE_W, height: PAD_TOP + PAD + NODE_H };
  }

  const { adj, rev, hasInternal, childSet } = buildIntraZoneGraph(childIds, edges);
  const positions = new Map();

  if (hasInternal) {
    const columns = assignIntraZoneColumns(childIds, adj, rev).map((column) =>
      orderByCenterHeavy(
        orderRowIds(column, edges, byId, parentId, entityOrder, adj, rev, childSet),
        (id) => childDegree(id, adj, rev, edges, childSet)
      )
    );
    let x = PAD;
    for (const column of columns) {
      let y = PAD_TOP;
      for (const id of column) {
        positions.set(id, { x, y });
        y += CELL_Y + externalOutCount(id, edges, childSet) * LANE_STEP;
      }
      x += CELL_X;
    }
  } else {
    const ordered = orderByCenterHeavy(
      orderRowIds(childIds, edges, byId, parentId, entityOrder, adj, rev, childSet),
      (id) => childDegree(id, adj, rev, edges, childSet)
    );
    const rows = chunkRow(ordered, defaultCols(ordered.length, maxCols));
    let y = PAD_TOP;
    for (const row of rows) {
      const centered = orderByCenterHeavy(row, (id) => childDegree(id, adj, rev, edges, childSet));
      let x = PAD;
      for (const id of centered) {
        positions.set(id, { x, y });
        x += CELL_X;
      }
      y += CELL_Y;
    }
  }

  resolveOverlaps(positions, CELL_X, CELL_Y);

  // Groesse aus den tatsaechlichen Kindpositionen, NACH dem Aufloesen von
  // Ueberlappungen. Frueher wurde der volle Rasterschritt der letzten Spalte
  // bzw. Zeile mitgezaehlt — die Zone war dadurch rechts und unten um fast
  // eine ganze Zelle zu gross.
  let maxRight = 0;
  let maxBottom = 0;
  for (const { x, y } of positions.values()) {
    maxRight = Math.max(maxRight, x + NODE_W);
    maxBottom = Math.max(maxBottom, y + NODE_H);
  }
  return { positions, width: maxRight + PAD, height: maxBottom + PAD };
}

export function computeLayout(nodes, edges, options = {}) {
  const profile = PROFILES[options.profile] ?? PROFILES.default;
  const maxCols = options.maxCols ?? 5;
  if (!nodes.length) return [];

  const { byId, childrenOf, entities, adj, rev } = buildEntityGraph(nodes, edges);
  const degreeMap = buildDegreeMap(entities, adj, rev);
  const entityLayer = assignLayers(entities, adj, rev, degreeMap);
  const byLayer = orderWithinLayers(entities, entityLayer, adj, rev, degreeMap);

  const entityOrder = new Map();
  for (const [l, ids] of byLayer) {
    ids.forEach((id, i) => entityOrder.set(id, l * 1000 + i));
  }

  const entitySize = new Map();
  const childLayout = new Map();

  for (const entityId of entities) {
    const node = byId.get(entityId);
    const rawChildren = (childrenOf.get(entityId) ?? []).sort(compareIds);
    if (isGroup(node) && rawChildren.length) {
      const { positions, width, height } = layoutZoneChildren(
        entityId,
        rawChildren,
        edges,
        byId,
        entityOrder,
        maxCols,
        profile
      );
      entitySize.set(entityId, { width, height });
      childLayout.set(entityId, positions);
    } else if (isGroup(node)) {
      // Leere Zone: Platz fuer genau einen Node, damit sie sichtbar bleibt.
      entitySize.set(entityId, {
        width: profile.PAD * 2 + profile.NODE_W,
        height: profile.PAD_TOP + profile.PAD + profile.NODE_H,
      });
    } else {
      // Freistehender Node: seine Grundflaeche ist die des Nodes, sonst nichts.
      // Frueher standen hier CELL_* (Rasterschritt, enthaelt schon eine Luecke)
      // PLUS PAD_* (Innenabstand einer Zone) — beides fuer einen blanken Node
      // bedeutungslos. Zusammen mit ENTITY_GAP_X/LAYER_GAP_Y wurde die
      // Grundflaeche dadurch dreifach gezaehlt: 452x340 statt 230x92, was bei
      // wenigen Nodes zu Luecken von ~380 px waagerecht und ~480 px senkrecht
      // fuehrte.
      entitySize.set(entityId, { width: profile.NODE_W, height: profile.NODE_H });
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
      x += size.width + profile.ENTITY_GAP_X;
      rowHeight = Math.max(rowHeight, size.height);
    }
    y += rowHeight + profile.LAYER_GAP_Y;
  }

  resolveOverlaps(entityPos, profile.CELL_X, profile.CELL_Y);

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
