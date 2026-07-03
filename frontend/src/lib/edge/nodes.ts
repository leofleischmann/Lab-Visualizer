/**
 * Node-Geometrie für das Kanten-Routing: absolute Rechtecke aus dem Store
 * (gemessene Größen von React Flow, Fallback auf Standardmaße).
 * Pro Store-Snapshot gecacht (WeakMap), damit große Graphen (50+ Nodes)
 * nicht pro Kante neu rechnen.
 * Beeinflusst: InfraEdge.tsx, lib/edge/ports.ts, FlowCanvas.tsx (Alignment)
 */
import type { FlowNode } from '../../api/types';
import type { Rect } from './geometry';

/** Standardmaße eines InfraNode (w-[230px], Höhe je nach Inhalt) */
export const NODE_W = 230;
export const NODE_H = 64;

export function nodeSize(node: FlowNode): { width: number; height: number } {
  return {
    width: node.measured?.width ?? node.width ?? NODE_W,
    height: node.measured?.height ?? node.height ?? NODE_H,
  };
}

const rectCache = new WeakMap<readonly FlowNode[], Map<string, Rect>>();
const obstacleCache = new WeakMap<readonly FlowNode[], { id: string; rect: Rect }[]>();

function buildRectMap(nodes: FlowNode[]): Map<string, Rect> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const absolute = new Map<string, { x: number; y: number }>();

  const absoluteOf = (id: string, guard = 0): { x: number; y: number } => {
    const cached = absolute.get(id);
    if (cached) return cached;
    const node = byId.get(id);
    if (!node) return { x: 0, y: 0 };
    let pos = { x: node.position.x, y: node.position.y };
    if (node.parentId && guard < 100) {
      const parent = absoluteOf(node.parentId, guard + 1);
      pos = { x: pos.x + parent.x, y: pos.y + parent.y };
    }
    absolute.set(id, pos);
    return pos;
  };

  const rects = new Map<string, Rect>();
  for (const node of nodes) {
    const { width, height } = nodeSize(node);
    const pos = absoluteOf(node.id);
    rects.set(node.id, { x: pos.x, y: pos.y, width, height });
  }
  return rects;
}

/** Absolute Rechtecke aller Nodes, gecacht pro nodes-Array-Identität. */
export function rectMap(nodes: FlowNode[]): Map<string, Rect> {
  let map = rectCache.get(nodes);
  if (!map) {
    map = buildRectMap(nodes);
    rectCache.set(nodes, map);
  }
  return map;
}

export function nodeRect(nodes: FlowNode[], id: string): Rect | null {
  return rectMap(nodes).get(id) ?? null;
}

/** Hindernisse für den Auto-Router: alle Nicht-Zonen-Nodes außer Quelle/Ziel. */
export function buildObstacles(nodes: FlowNode[], exclude: Set<string>): Rect[] {
  let all = obstacleCache.get(nodes);
  if (!all) {
    const rects = rectMap(nodes);
    all = nodes
      .filter((n) => n.type !== 'zone')
      .map((n) => ({ id: n.id, rect: rects.get(n.id)! }));
    obstacleCache.set(nodes, all);
  }
  const result: Rect[] = [];
  for (const o of all) {
    if (!exclude.has(o.id)) result.push(o.rect);
  }
  return result;
}
