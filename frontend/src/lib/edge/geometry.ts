/**
 * Geometrie-Grundbausteine für das Kanten-Routing (Punkte, Rechtecke, Polylinien).
 * Beeinflusst: lib/edge/* (Router, manuelles Routing, Label-Anker)
 */
import type { FlowPoint } from '../../api/types';

export type Rect = { x: number; y: number; width: number; height: number };

export type PathProjection = {
  /** Arc-Length-Parameter 0..1 auf der Polylinie */
  t: number;
  point: FlowPoint;
  distance: number;
  segmentIndex: number;
};

export function distance(a: FlowPoint, b: FlowPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function rectCenter(rect: Rect): FlowPoint {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

export function inflate(rect: Rect, margin: number): Rect {
  return {
    x: rect.x - margin,
    y: rect.y - margin,
    width: rect.width + margin * 2,
    height: rect.height + margin * 2,
  };
}

export function pointInRect(p: FlowPoint, rect: Rect): boolean {
  return (
    p.x >= rect.x && p.x <= rect.x + rect.width && p.y >= rect.y && p.y <= rect.y + rect.height
  );
}

/** Achse eines Segments: horizontal, vertikal oder diagonal. */
export function segmentAxis(a: FlowPoint, b: FlowPoint, tolerance = 0.5): 'h' | 'v' | 'd' {
  if (Math.abs(a.y - b.y) <= tolerance) return 'h';
  if (Math.abs(a.x - b.x) <= tolerance) return 'v';
  return 'd';
}

/** Liang-Barsky-Clipping: schneidet die Strecke a→b das Rechteck? */
export function segmentIntersectsRect(a: FlowPoint, b: FlowPoint, rect: Rect): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) < 1e-9) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  return (
    clip(-dx, a.x - rect.x) &&
    clip(dx, rect.x + rect.width - a.x) &&
    clip(-dy, a.y - rect.y) &&
    clip(dy, rect.y + rect.height - a.y)
  );
}

export function pathLength(points: FlowPoint[]): number {
  let len = 0;
  for (let i = 0; i < points.length - 1; i++) len += distance(points[i], points[i + 1]);
  return len;
}

/** Punkt bei Arc-Length-Parameter t (0..1) auf der Polylinie. */
export function pointAtT(points: FlowPoint[], t: number): FlowPoint {
  if (!points.length) return { x: 0, y: 0 };
  if (points.length === 1) return { ...points[0] };
  const total = pathLength(points);
  if (total < 1e-6) return { ...points[0] };
  let remaining = Math.min(1, Math.max(0, t)) * total;
  for (let i = 0; i < points.length - 1; i++) {
    const segLen = distance(points[i], points[i + 1]);
    if (remaining <= segLen || i === points.length - 2) {
      const local = segLen < 1e-6 ? 0 : Math.min(1, remaining / segLen);
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * local,
        y: points[i].y + (points[i + 1].y - points[i].y) * local,
      };
    }
    remaining -= segLen;
  }
  return { ...points[points.length - 1] };
}

function projectOntoSegment(p: FlowPoint, a: FlowPoint, b: FlowPoint): { point: FlowPoint; localT: number } {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  if (lenSq < 1e-9) return { point: { ...a }, localT: 0 };
  const localT = Math.min(1, Math.max(0, ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq));
  return { point: { x: a.x + abx * localT, y: a.y + aby * localT }, localT };
}

/** Nächster Punkt auf der Polylinie inkl. Arc-Length-Parameter. */
export function projectOntoPath(points: FlowPoint[], p: FlowPoint): PathProjection {
  const fallback: PathProjection = {
    t: 0,
    point: points[0] ? { ...points[0] } : { x: 0, y: 0 },
    distance: points[0] ? distance(points[0], p) : 0,
    segmentIndex: 0,
  };
  if (points.length < 2) return fallback;

  const total = pathLength(points);
  let best = fallback;
  let walked = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const segLen = distance(points[i], points[i + 1]);
    const { point, localT } = projectOntoSegment(p, points[i], points[i + 1]);
    const d = distance(point, p);
    if (d < best.distance) {
      best = {
        t: total < 1e-6 ? 0 : (walked + segLen * localT) / total,
        point,
        distance: d,
        segmentIndex: i,
      };
    }
    walked += segLen;
  }
  return best;
}

/** Nur (nahezu) identische aufeinanderfolgende Punkte entfernen. */
export function dedupePath(points: FlowPoint[], tolerance = 0.75): FlowPoint[] {
  const result: FlowPoint[] = [];
  for (const p of points) {
    const prev = result[result.length - 1];
    if (prev && distance(prev, p) < tolerance) continue;
    result.push({ ...p });
  }
  if (result.length >= 2 && points.length >= 2) {
    // Endpunkt hat Vorrang vor einem fast identischen vorletzten Punkt
    const last = points[points.length - 1];
    if (distance(result[result.length - 1], last) >= tolerance) result.push({ ...last });
  }
  return result;
}

/**
 * Polylinie bereinigen: doppelte Punkte und (nahezu) kollineare Zwischenpunkte
 * entfernen. Endpunkte bleiben erhalten.
 */
export function simplifyPath(points: FlowPoint[], tolerance = 2): FlowPoint[] {
  if (points.length <= 2) return points.map((p) => ({ ...p }));

  const result: FlowPoint[] = [{ ...points[0] }];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = result[result.length - 1];
    const curr = points[i];
    const next = points[i + 1];
    if (distance(prev, curr) < tolerance) continue;
    // Abstand von curr zur Geraden prev→next (Kollinearitätstest)
    const area = Math.abs(
      (next.x - prev.x) * (prev.y - curr.y) - (prev.x - curr.x) * (next.y - prev.y)
    );
    const base = distance(prev, next);
    if (base > 1e-6 && area / base < tolerance) continue;
    result.push({ ...curr });
  }

  const last = points[points.length - 1];
  if (result.length > 1 && distance(result[result.length - 1], last) < tolerance) {
    result.pop();
  }
  result.push({ ...last });
  return result;
}
