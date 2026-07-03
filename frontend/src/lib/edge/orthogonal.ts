/**
 * Automatischer orthogonaler Kanten-Router (Manhattan-Stil, hindernis-bewusst).
 * Kandidatenrouten werden generiert und nach Kollisionen, Länge und Knicken bewertet.
 * Beeinflusst: InfraEdge.tsx (Auto-Modus)
 */
import type { FlowPoint } from '../../api/types';
import { chooseSides, dockPoint, outwardNormal, type Side } from './dock';
import {
  inflate,
  pathLength,
  segmentAxis,
  segmentIntersectsRect,
  simplifyPath,
  type Rect,
} from './geometry';

export type AutoRouteInput = {
  source: Rect;
  target: Rect;
  obstacles: Rect[];
  /** Versatz des Dockpunkts entlang der Quell-Seite (Port-Verteilung) */
  sourceShift?: number;
  /** Versatz des Dockpunkts entlang der Ziel-Seite (Port-Verteilung) */
  targetShift?: number;
  /** Mindestabstand, den die Kante senkrecht vom Node weg läuft */
  stub?: number;
};

const OBSTACLE_PADDING = 10;
const ENDPOINT_PADDING = 12;
const DETOUR_PADDING = 28;

function addScaled(p: FlowPoint, dir: FlowPoint, len: number): FlowPoint {
  return { x: p.x + dir.x * len, y: p.y + dir.y * len };
}

/** Kandidaten für den Mittelteil zwischen den beiden Stub-Endpunkten. */
function middleCandidates(
  a: FlowPoint,
  b: FlowPoint,
  detours: { xs: number[]; ys: number[] },
  midShift = 0
): FlowPoint[][] {
  const candidates: FlowPoint[][] = [
    [a, { x: b.x, y: a.y }, b],
    [a, { x: a.x, y: b.y }, b],
  ];
  const xs = [(a.x + b.x) / 2 + midShift, ...detours.xs];
  for (const m of xs) {
    candidates.push([a, { x: m, y: a.y }, { x: m, y: b.y }, b]);
  }
  const ys = [(a.y + b.y) / 2 + midShift, ...detours.ys];
  for (const m of ys) {
    candidates.push([a, { x: a.x, y: m }, { x: b.x, y: m }, b]);
  }
  return candidates;
}

function countCorners(points: FlowPoint[]): number {
  let corners = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const before = segmentAxis(points[i - 1], points[i]);
    const after = segmentAxis(points[i], points[i + 1]);
    if (before !== after) corners += 1;
  }
  return corners;
}

function scorePath(points: FlowPoint[], blockers: Rect[]): number {
  let collisions = 0;
  for (let i = 0; i < points.length - 1; i++) {
    for (const box of blockers) {
      if (segmentIntersectsRect(points[i], points[i + 1], box)) collisions += 1;
    }
  }
  return collisions * 1000 + pathLength(points) + countCorners(points) * 24;
}

const DOCK_INSET = 10;

/**
 * Bei gegenüberliegenden Seiten die Dockpunkte aufeinander ausrichten, wenn
 * sich die Seitenbereiche überlappen → gerade Linie statt Mini-S-Versatz.
 * Der Dock der weniger belegten Seite (Shift 0) folgt dem verschobenen Dock.
 */
function alignFacingDocks(
  axis: 'h' | 'v',
  source: Rect,
  target: Rect,
  start: FlowPoint,
  end: FlowPoint,
  sourceShift: number,
  targetShift: number
): void {
  const key = axis === 'h' ? 'y' : 'x';
  const size = axis === 'h' ? 'height' : 'width';
  const lo = Math.max(source[key] + DOCK_INSET, target[key] + DOCK_INSET);
  const hi = Math.min(source[key] + source[size] - DOCK_INSET, target[key] + target[size] - DOCK_INSET);
  if (lo > hi) return;

  const clamp = (v: number) => Math.min(hi, Math.max(lo, v));
  let aligned: number;
  if (sourceShift === 0 && targetShift !== 0) aligned = clamp(end[key]);
  else if (targetShift === 0 && sourceShift !== 0) aligned = clamp(start[key]);
  else aligned = clamp((start[key] + end[key]) / 2);
  start[key] = aligned;
  end[key] = aligned;
}

export function routeOrthogonal(input: AutoRouteInput): FlowPoint[] {
  const { source, target, obstacles } = input;
  const stub = input.stub ?? 24;
  const sourceShift = input.sourceShift ?? 0;
  const targetShift = input.targetShift ?? 0;
  const midShift = (sourceShift + targetShift) / 2;

  const sides = chooseSides(source, target);
  const start = dockPoint(source, sides.source, sourceShift);
  const end = dockPoint(target, sides.target, targetShift);
  if (sides.source === 'right' || sides.source === 'left') {
    alignFacingDocks('h', source, target, start, end, sourceShift, targetShift);
  } else {
    alignFacingDocks('v', source, target, start, end, sourceShift, targetShift);
  }
  const stubStart = addScaled(start, outwardNormal(sides.source), stub);
  const stubEnd = addScaled(end, outwardNormal(sides.target), stub);

  // Umwege links/rechts bzw. oberhalb/unterhalb beider Nodes
  const minX = Math.min(source.x, target.x) - DETOUR_PADDING;
  const maxX = Math.max(source.x + source.width, target.x + target.width) + DETOUR_PADDING;
  const minY = Math.min(source.y, target.y) - DETOUR_PADDING;
  const maxY = Math.max(source.y + source.height, target.y + target.height) + DETOUR_PADDING;

  const blockers = [
    ...obstacles.map((o) => inflate(o, OBSTACLE_PADDING)),
    inflate(source, ENDPOINT_PADDING),
    inflate(target, ENDPOINT_PADDING),
  ];

  const candidates = middleCandidates(
    stubStart,
    stubEnd,
    {
      xs: [minX + midShift, maxX + midShift],
      ys: [minY + midShift, maxY + midShift],
    },
    midShift
  );

  let best: FlowPoint[] | null = null;
  let bestScore = Infinity;
  for (const middle of candidates) {
    const path = simplifyPath([start, ...middle, end], 0.5);
    const score = scorePath(path, blockers);
    if (score < bestScore) {
      bestScore = score;
      best = path;
    }
  }

  return best ?? [start, end];
}

export type { Side };
