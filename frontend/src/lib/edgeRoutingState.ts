/**
 * Manuelles Kanten-Routing (BPMN-ähnlich): Waypoints, Segment-Drag, Label-Position.
 * Beeinflusst: InfraEdge.tsx, store/graph.ts, backend validation/store
 */
import type { EdgeRouting, FlowPoint } from '../api/types';
import type { RoutePoint } from './edgeRouting';
import { pathSegments, pointOnSegment } from './edgeRouting';

export const DEFAULT_EDGE_ROUTING: EdgeRouting = { mode: 'auto', waypoints: [] };

export type ResolvedEdgeGeometry = {
  path: string;
  points: FlowPoint[];
  segments: [FlowPoint, FlowPoint][];
  labelX: number;
  labelY: number;
  mode: 'auto' | 'manual';
};

export function normalizeRouting(routing?: EdgeRouting | null): EdgeRouting {
  if (!routing) return { ...DEFAULT_EDGE_ROUTING };
  return {
    mode: routing.mode === 'manual' ? 'manual' : 'auto',
    waypoints: Array.isArray(routing.waypoints) ? routing.waypoints.map((p) => ({ x: p.x, y: p.y })) : [],
    label: routing.label ? { x: routing.label.x, y: routing.label.y } : null,
  };
}

export function routeToWaypoints(route: RoutePoint): FlowPoint[] {
  const segs = pathSegments(route);
  const chain: FlowPoint[] = [];
  for (const [x1, y1, x2, y2] of segs) {
    if (!chain.length) chain.push({ x: x1, y: y1 });
    const last = chain[chain.length - 1];
    if (last.x !== x2 || last.y !== y2) chain.push({ x: x2, y: y2 });
  }
  if (chain.length <= 2) return [];
  return chain.slice(1, -1);
}

export function expandPathPoints(source: FlowPoint, target: FlowPoint, waypoints: FlowPoint[]): FlowPoint[] {
  return [source, ...waypoints, target];
}

export function pointsToPath(points: FlowPoint[]): string {
  if (!points.length) return '';
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
}

export function pointsToSegments(points: FlowPoint[]): [FlowPoint, FlowPoint][] {
  const segments: [FlowPoint, FlowPoint][] = [];
  for (let i = 0; i < points.length - 1; i++) {
    segments.push([points[i], points[i + 1]]);
  }
  return segments;
}

export function segmentMidpoint(a: FlowPoint, b: FlowPoint): FlowPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function isHorizontalSegment(a: FlowPoint, b: FlowPoint): boolean {
  return Math.abs(a.y - b.y) <= Math.abs(a.x - b.x);
}

export function totalPathLength(points: FlowPoint[]): number {
  let len = 0;
  for (let i = 0; i < points.length - 1; i++) {
    len += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
  }
  return len;
}

export function pointAtPathT(points: FlowPoint[], t: number): FlowPoint {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return { ...points[0] };
  const total = totalPathLength(points);
  if (total < 0.001) return { ...points[0] };
  let remaining = Math.max(0, Math.min(1, t)) * total;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    if (remaining <= segLen) {
      const localT = segLen < 0.001 ? 0 : remaining / segLen;
      return pointOnSegment(a.x, a.y, b.x, b.y, localT);
    }
    remaining -= segLen;
  }
  return { ...points[points.length - 1] };
}

/** Segment-Handle ziehen: horizontale Segmente -> Y, vertikale -> X */
export function dragPathSegment(points: FlowPoint[], segmentIndex: number, dx: number, dy: number): FlowPoint[] {
  const next = points.map((p) => ({ ...p }));
  const a = next[segmentIndex];
  const b = next[segmentIndex + 1];
  if (!a || !b) return next;

  if (isHorizontalSegment(a, b)) {
    if (segmentIndex > 0) a.y += dy;
    if (segmentIndex + 1 < next.length - 1) b.y += dy;
  } else {
    if (segmentIndex > 0) a.x += dx;
    if (segmentIndex + 1 < next.length - 1) b.x += dx;
  }
  return next;
}

export function dragPathCorner(points: FlowPoint[], cornerIndex: number, x: number, y: number): FlowPoint[] {
  const next = points.map((p) => ({ ...p }));
  if (cornerIndex <= 0 || cornerIndex >= next.length - 1) return next;
  next[cornerIndex] = { x, y };
  return next;
}

export function insertWaypointOnSegment(
  points: FlowPoint[],
  segmentIndex: number,
  flowPos: FlowPoint
): FlowPoint[] {
  const a = points[segmentIndex];
  const b = points[segmentIndex + 1];
  if (!a || !b) return points;
  const wp = isHorizontalSegment(a, b) ? { x: flowPos.x, y: a.y } : { x: a.x, y: flowPos.y };
  const next = [...points];
  next.splice(segmentIndex + 1, 0, wp);
  return next;
}

export function pathPointsToWaypoints(points: FlowPoint[]): FlowPoint[] {
  if (points.length <= 2) return [];
  return points.slice(1, -1).map((p) => ({ x: p.x, y: p.y }));
}

export function resolveManualGeometry(
  source: FlowPoint,
  target: FlowPoint,
  waypoints: FlowPoint[]
): ResolvedEdgeGeometry {
  const points = expandPathPoints(source, target, waypoints);
  const segments = pointsToSegments(points);
  const mid = pointAtPathT(points, 0.5);
  return {
    path: pointsToPath(points),
    points,
    segments,
    labelX: mid.x,
    labelY: mid.y,
    mode: 'manual',
  };
}

export function resolveLabelPosition(
  geometry: ResolvedEdgeGeometry,
  routing: EdgeRouting,
  alongT: number
): FlowPoint {
  if (routing.label) return { ...routing.label };
  return pointAtPathT(geometry.points, alongT);
}
