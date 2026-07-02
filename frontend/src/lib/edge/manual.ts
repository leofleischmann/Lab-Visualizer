/**
 * Manuelles Kanten-Routing (BPMN-ähnlich): Waypoints sind absolute Canvas-Punkte,
 * das Docking an den Nodes wird bei jedem Render repariert — dadurch bleibt der
 * Verlauf orthogonal, auch wenn Nodes verschoben werden.
 * Beeinflusst: InfraEdge.tsx, lib/edge/routing.ts
 */
import type { FlowPoint } from '../../api/types';
import { sideAxis, sideToward } from './dock';
import { dedupePath, projectOntoPath, segmentAxis, type Rect } from './geometry';

const INSET = 10;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Dock + ggf. Zwischenpunkt, damit der Übergang Node → erster Waypoint
 * orthogonal bleibt. `toward` ist der äußere Nachbarpunkt des Docks.
 */
function dockTowards(rect: Rect, toward: FlowPoint): FlowPoint[] {
  const side = sideToward(rect, toward);
  if (sideAxis(side) === 'h') {
    const x = side === 'left' ? rect.x : rect.x + rect.width;
    const y = clamp(toward.y, rect.y + INSET, rect.y + rect.height - INSET);
    const dock = { x, y };
    if (Math.abs(y - toward.y) > 0.5) return [dock, { x: toward.x, y }];
    return [dock];
  }
  const y = side === 'top' ? rect.y : rect.y + rect.height;
  const x = clamp(toward.x, rect.x + INSET, rect.x + rect.width - INSET);
  const dock = { x, y };
  if (Math.abs(x - toward.x) > 0.5) return [dock, { x, y: toward.y }];
  return [dock];
}

/**
 * Vollständigen Pfad aus gespeicherten Waypoints rekonstruieren:
 * Docking an beiden Nodes reparieren, Orthogonalität der Übergänge sichern.
 * Bewusst kein Kollinearitäts-Simplify: auch ein Bendpoint auf gerader Linie
 * bleibt sichtbar und greifbar (wie in bpmn.io direkt nach dem Einfügen).
 */
export function repairManualPath(source: Rect, target: Rect, waypoints: FlowPoint[]): FlowPoint[] {
  if (!waypoints.length) return [];
  const head = dockTowards(source, waypoints[0]);
  const tail = dockTowards(target, waypoints[waypoints.length - 1]).reverse();
  return dedupePath([...head, ...waypoints, ...tail]);
}

/** Innere Punkte (= persistierte Waypoints) eines vollständigen Pfads. */
export function waypointsFromPath(points: FlowPoint[]): FlowPoint[] {
  if (points.length <= 2) return [];
  return points.slice(1, -1).map((p) => ({ x: p.x, y: p.y }));
}

export type SegmentDragSession = {
  points: FlowPoint[];
  segmentIndex: number;
};

/**
 * Segment-Drag vorbereiten: Randsegmente (am Dock) werden geteilt, damit das
 * gezogene Segment frei beweglich ist und der Node-Anschluss erhalten bleibt.
 */
export function beginSegmentDrag(points: FlowPoint[], segmentIndex: number): SegmentDragSession {
  const next = points.map((p) => ({ ...p }));
  let index = segmentIndex;
  if (index === 0) {
    next.splice(1, 0, { ...next[0] });
    index = 1;
  }
  if (index === next.length - 2) {
    next.splice(next.length - 1, 0, { ...next[next.length - 1] });
  }
  return { points: next, segmentIndex: index };
}

/** Segment senkrecht zu seiner Achse verschieben (diagonale Segmente: frei). */
export function moveSegment(
  session: SegmentDragSession,
  delta: FlowPoint
): FlowPoint[] {
  const points = session.points.map((p) => ({ ...p }));
  const a = points[session.segmentIndex];
  const b = points[session.segmentIndex + 1];
  if (!a || !b) return points;
  const axis = segmentAxis(a, b);
  if (axis === 'h') {
    a.y += delta.y;
    b.y += delta.y;
  } else if (axis === 'v') {
    a.x += delta.x;
    b.x += delta.x;
  } else {
    a.x += delta.x;
    a.y += delta.y;
    b.x += delta.x;
    b.y += delta.y;
  }
  return points;
}

/**
 * Eckpunkt verschieben. Snapping auf Nachbar-Koordinaten hält den Verlauf
 * leicht orthogonal, erlaubt aber bewusst auch diagonale Segmente.
 */
export function moveBendpoint(
  points: FlowPoint[],
  index: number,
  pos: FlowPoint,
  snapTolerance = 8
): FlowPoint[] {
  const next = points.map((p) => ({ ...p }));
  if (index <= 0 || index >= next.length - 1) return next;

  const snapped = { ...pos };
  const neighbors = [next[index - 1], next[index + 1]];
  let bestDx = snapTolerance;
  let bestDy = snapTolerance;
  for (const n of neighbors) {
    if (Math.abs(pos.x - n.x) < bestDx) {
      bestDx = Math.abs(pos.x - n.x);
      snapped.x = n.x;
    }
    if (Math.abs(pos.y - n.y) < bestDy) {
      bestDy = Math.abs(pos.y - n.y);
      snapped.y = n.y;
    }
  }
  next[index] = snapped;
  return next;
}

/** Eckpunkt auf der Linie einfügen (Doppelklick auf ein Segment). */
export function insertBendpoint(
  points: FlowPoint[],
  pos: FlowPoint
): { points: FlowPoint[]; index: number } {
  const projection = projectOntoPath(points, pos);
  const next = points.map((p) => ({ ...p }));
  const index = projection.segmentIndex + 1;
  next.splice(index, 0, projection.point);
  return { points: next, index };
}

/** Eckpunkt entfernen (Doppelklick auf einen Eckpunkt). */
export function removeBendpoint(points: FlowPoint[], index: number): FlowPoint[] {
  if (index <= 0 || index >= points.length - 1) return points.map((p) => ({ ...p }));
  const next = points.map((p) => ({ ...p }));
  next.splice(index, 1);
  return next;
}
