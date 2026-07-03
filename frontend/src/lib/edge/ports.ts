/**
 * Port-Verteilung: Docken mehrere Kanten an derselben Node-Seite an, werden
 * sie entlang der Seite gestaffelt statt alle auf der Seitenmitte zu liegen.
 * Ersetzt reines Parallel-Bundling und trennt auch deckungsgleiche Korridore.
 * Die Zuordnung Node-Seite → Kanten wird pro edges/nodes-Snapshot gecacht.
 * Beeinflusst: InfraEdge.tsx (Auto-Routing)
 */
import type { FlowEdge, FlowNode } from '../../api/types';
import { chooseSides, sideToward, type Side } from './dock';
import { nodeRect } from './nodes';
import { normalizeRouting } from './routing';

const PORT_STEP = 16;

/** Seite, mit der eine Kante an einem ihrer End-Nodes andockt. */
function dockSide(edge: FlowEdge, nodeId: string, nodes: FlowNode[]): Side | null {
  const sourceRect = nodeRect(nodes, edge.source);
  const targetRect = nodeRect(nodes, edge.target);
  if (!sourceRect || !targetRect) return null;
  const routing = normalizeRouting(edge.data?.entity.routing);
  const isSource = edge.source === nodeId;
  if (routing.mode === 'manual' && routing.waypoints.length) {
    const rect = isSource ? sourceRect : targetRect;
    const toward = isSource
      ? routing.waypoints[0]
      : routing.waypoints[routing.waypoints.length - 1];
    return sideToward(rect, toward);
  }
  const sides = chooseSides(sourceRect, targetRect);
  return isSource ? sides.source : sides.target;
}

type PortMap = Map<string, string[]>;

const portCache = new WeakMap<readonly FlowEdge[], WeakMap<readonly FlowNode[], PortMap>>();

function buildPortMap(edges: FlowEdge[], nodes: FlowNode[]): PortMap {
  const map: PortMap = new Map();
  for (const edge of edges) {
    if (edge.source === edge.target) continue;
    for (const nodeId of [edge.source, edge.target]) {
      const side = dockSide(edge, nodeId, nodes);
      if (!side) continue;
      const key = `${nodeId}|${side}`;
      const list = map.get(key);
      if (list) list.push(edge.id);
      else map.set(key, [edge.id]);
    }
  }
  for (const list of map.values()) list.sort();
  return map;
}

function portMap(edges: FlowEdge[], nodes: FlowNode[]): PortMap {
  let byNodes = portCache.get(edges);
  if (!byNodes) {
    byNodes = new WeakMap();
    portCache.set(edges, byNodes);
  }
  let map = byNodes.get(nodes);
  if (!map) {
    map = buildPortMap(edges, nodes);
    byNodes.set(nodes, map);
  }
  return map;
}

/**
 * Versatz entlang der Seite für eine Kante, deterministisch über die sortierten
 * IDs aller Kanten, die an derselben Node-Seite andocken.
 */
export function portShift(
  edgeId: string,
  nodeId: string,
  side: Side,
  edges: FlowEdge[],
  nodes: FlowNode[]
): number {
  const siblings = portMap(edges, nodes).get(`${nodeId}|${side}`) ?? [];
  if (siblings.length <= 1) return 0;
  const index = siblings.indexOf(edgeId);
  if (index < 0) return 0;
  return (index - (siblings.length - 1) / 2) * PORT_STEP;
}
