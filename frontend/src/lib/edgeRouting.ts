/**
 * Kanten-Routing & Label-Platzierung (generisch, unabhängig vom Graph-Inhalt).
 * Beeinflusst: InfraEdge.tsx (Handle-Richtung beim Routing)
 */
import { Position } from '@xyflow/react';
import type { FlowEdge, FlowNode } from '../api/types';
import { absolutePosition } from '../store/graph';

/** Entspricht InfraNode (230px) + Handle-Luft */
export const NODE_W = 230;
export const NODE_H = 108;
const GUTTER = 64;
const LABEL_SPREAD = 0.14;

export type NodeBox = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RoutePoint = {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: Position;
  targetPosition: Position;
  centerX?: number;
  centerY?: number;
  offset: number;
};

export function inferHandlePositions(
  nodes: FlowNode[],
  sourceId: string,
  targetId: string
): { sourcePosition: Position; targetPosition: Position } {
  const s = absolutePosition(nodes, sourceId);
  const t = absolutePosition(nodes, targetId);
  const dx = t.x - s.x;
  const dy = t.y - s.y;

  if (Math.abs(dy) >= Math.abs(dx) * 0.85) {
    return {
      sourcePosition: dy >= 0 ? Position.Bottom : Position.Top,
      targetPosition: dy >= 0 ? Position.Top : Position.Bottom,
    };
  }

  return {
    sourcePosition: dx >= 0 ? Position.Right : Position.Left,
    targetPosition: dx >= 0 ? Position.Left : Position.Right,
  };
}

export function buildNodeBoxes(nodes: FlowNode[], exclude: Set<string>): NodeBox[] {
  return nodes
    .filter((n) => n.type !== 'zone' && !exclude.has(n.id))
    .map((n) => {
      const abs = absolutePosition(nodes, n.id);
      return {
        id: n.id,
        x: abs.x,
        y: abs.y,
        width: n.width ?? NODE_W,
        height: n.height ?? NODE_H,
      };
    });
}

function padBox(box: NodeBox, margin: number): NodeBox {
  return {
    ...box,
    x: box.x - margin,
    y: box.y - margin,
    width: box.width + margin * 2,
    height: box.height + margin * 2,
  };
}

function segmentIntersectsRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  box: NodeBox
): boolean {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  const bx2 = box.x + box.width;
  const by2 = box.y + box.height;
  if (maxX < box.x || minX > bx2 || maxY < box.y || minY > by2) return false;
  const vertical = Math.abs(x1 - x2) < 0.5;
  const horizontal = Math.abs(y1 - y2) < 0.5;
  if (vertical) return x1 >= box.x && x1 <= bx2 && maxY >= box.y && minY <= by2;
  if (horizontal) return y1 >= box.y && y1 <= by2 && maxX >= box.x && minX <= bx2;
  return false;
}

function scoreRoute(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  centerX: number | undefined,
  centerY: number | undefined,
  obstacles: NodeBox[]
): number {
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  let score = 0;
  const segments: [number, number, number, number][] = [];

  if (centerY !== undefined && Math.abs(dy) >= Math.abs(dx)) {
    segments.push([sourceX, sourceY, sourceX, centerY]);
    segments.push([sourceX, centerY, targetX, centerY]);
    segments.push([targetX, centerY, targetX, targetY]);
  } else if (centerX !== undefined) {
    segments.push([sourceX, sourceY, centerX, sourceY]);
    segments.push([centerX, sourceY, centerX, targetY]);
    segments.push([centerX, targetY, targetX, targetY]);
  } else {
    segments.push([sourceX, sourceY, targetX, targetY]);
  }

  for (const [x1, y1, x2, y2] of segments) {
    for (const box of obstacles) {
      if (segmentIntersectsRect(x1, y1, x2, y2, box)) score += 100;
    }
  }
  return score;
}

export function computeEdgeRoute(
  props: {
    sourceX: number;
    sourceY: number;
    targetX: number;
    targetY: number;
    sourcePosition: Position;
    targetPosition: Position;
    offset?: number;
  },
  obstacles: NodeBox[] = []
): RoutePoint {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition } = props;
  const offset = props.offset ?? 0;
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const padded = obstacles.map((b) => padBox(b, 12));

  if (Math.abs(dy) >= Math.abs(dx) * 0.85) {
    const sign = dy >= 0 ? 1 : -1;
    const candidates = [
      sourceY + sign * GUTTER,
      sourceY + sign * (GUTTER + 48),
      (sourceY + targetY) / 2,
      targetY - sign * GUTTER,
    ];
    let bestY = candidates[0];
    let bestScore = Infinity;
    for (const centerY of candidates) {
      const s = scoreRoute(sourceX, sourceY, targetX, targetY, undefined, centerY, padded);
      if (s < bestScore) {
        bestScore = s;
        bestY = centerY;
      }
    }
    return {
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
      centerY: bestY,
      offset,
    };
  }

  const sign = dx >= 0 ? 1 : -1;
  const candidates = [
    sourceX + sign * GUTTER,
    sourceX + sign * (GUTTER + 48),
    (sourceX + targetX) / 2,
    targetX - sign * GUTTER,
  ];
  let bestX = candidates[0];
  let bestScore = Infinity;
  for (const centerX of candidates) {
    const s = scoreRoute(sourceX, sourceY, targetX, targetY, centerX, undefined, padded);
    if (s < bestScore) {
      bestScore = s;
      bestX = centerX;
    }
  }

  return {
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    centerX: bestX,
    offset,
  };
}

/** Parallele Kanten zwischen gleichen Nodes leicht versetzen */
export function edgeBundleOffset(
  edgeId: string,
  source: string,
  target: string,
  edges: FlowEdge[]
): number {
  const bundle = edges
    .filter((e) => e.source === source && e.target === target)
    .map((e) => e.id)
    .sort();
  if (bundle.length <= 1) return 0;
  const index = bundle.indexOf(edgeId);
  const step = 22;
  return (index - (bundle.length - 1) / 2) * step;
}

/** Labels gleicher Quelle entlang der Kante verteilen (weniger Stapel) */
export function labelAlongPathOffset(
  edgeId: string,
  source: string,
  edges: FlowEdge[]
): number {
  const siblings = edges
    .filter((e) => e.source === source)
    .map((e) => e.id)
    .sort();
  if (siblings.length <= 1) return 0.5;
  const index = siblings.indexOf(edgeId);
  const t = 0.22 + index * LABEL_SPREAD;
  return Math.min(0.78, t);
}

export function pointOnSegment(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  t: number
): { x: number; y: number } {
  return { x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t };
}

export function labelPosition(
  labelX: number,
  labelY: number,
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  alongT: number,
  obstacles: NodeBox[]
): { x: number; y: number } {
  const base = pointOnSegment(sourceX, sourceY, targetX, targetY, alongT);
  let x = labelX + (base.x - labelX) * 0.55;
  let y = labelY + (base.y - labelY) * 0.55;

  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  x += nx * 16;
  y += ny * 16;

  for (const box of obstacles.map((b) => padBox(b, 8))) {
    if (x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height) {
      x += nx * 28;
      y += ny * 28;
    }
  }

  return { x, y };
}
