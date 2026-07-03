/**
 * Routing-Zustand einer Kante: Normalisierung des API-Modells, Label-Anker
 * (Position entlang des Pfads) und Versatz paralleler Kanten.
 * Beeinflusst: InfraEdge.tsx, EdgePanel.tsx, store/graph.ts
 */
import type { EdgeRouting, FlowEdge, FlowPoint } from '../../api/types';
import { pointAtT, projectOntoPath } from './geometry';

export const DEFAULT_EDGE_ROUTING: EdgeRouting = { mode: 'auto', waypoints: [], labelT: null };

/** Standard-Position des Labels auf dem Pfad (leicht zur Quelle versetzt, gut lesbar). */
export const DEFAULT_LABEL_T = 0.5;

export function normalizeRouting(routing?: EdgeRouting | null): EdgeRouting {
  if (!routing) return { ...DEFAULT_EDGE_ROUTING };
  return {
    mode: routing.mode === 'manual' ? 'manual' : 'auto',
    waypoints: Array.isArray(routing.waypoints)
      ? routing.waypoints.map((p) => ({ x: p.x, y: p.y }))
      : [],
    labelT: typeof routing.labelT === 'number' ? Math.min(1, Math.max(0, routing.labelT)) : null,
  };
}

export function isRoutingCustomized(routing: EdgeRouting): boolean {
  return routing.mode === 'manual' || routing.waypoints.length > 0 || routing.labelT != null;
}

/** Label-Position: immer AUF der Linie, verankert über Arc-Length-Parameter t. */
export function labelPosition(
  points: FlowPoint[],
  routing: EdgeRouting,
  fallbackT = DEFAULT_LABEL_T
): FlowPoint {
  return pointAtT(points, routing.labelT ?? fallbackT);
}

/**
 * Standard-Label-Anker: bei parallelen Kanten zwischen demselben Node-Paar
 * werden die Labels entlang der Linie gestaffelt, damit sie sich nicht stapeln.
 */
export function defaultLabelT(edgeId: string, source: string, target: string, edges: FlowEdge[]): number {
  const key = (a: string, b: string) => (a < b ? `${a}→${b}` : `${b}→${a}`);
  const pair = key(source, target);
  const bundle = edges
    .filter((e) => key(e.source, e.target) === pair)
    .map((e) => e.id)
    .sort();
  if (bundle.length <= 1) return DEFAULT_LABEL_T;
  const index = bundle.indexOf(edgeId);
  const t = DEFAULT_LABEL_T + (index - (bundle.length - 1) / 2) * 0.18;
  return Math.min(0.85, Math.max(0.15, t));
}

/** Zeiger-Position → Label-Anker t (Label bleibt beim Ziehen auf der Linie). */
export function labelTFromPointer(points: FlowPoint[], pointer: FlowPoint): number {
  const t = projectOntoPath(points, pointer).t;
  return Math.min(0.97, Math.max(0.03, t));
}

