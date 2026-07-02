import { Position } from '@xyflow/react';
import type { FlowEdge } from '../api/types';

/** Abstand für orthogonalen Knick nahe am Quell-Node (vermeidet Mitte zwischen vielen Nodes) */
const GUTTER = 56;

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

/**
 * Berechnet Smooth-Step-Routing mit Gutter nahe Source/Target statt exakt in der Mitte.
 * Beeinflusst: InfraEdge.tsx
 */
export function computeEdgeRoute(props: {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: Position;
  targetPosition: Position;
  offset?: number;
}): RoutePoint {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition } = props;
  const offset = props.offset ?? 0;
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;

  if (Math.abs(dy) >= Math.abs(dx)) {
    const sign = dy >= 0 ? 1 : -1;
    return {
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
      centerY: sourceY + sign * GUTTER,
      offset,
    };
  }

  const sign = dx >= 0 ? 1 : -1;
  return {
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    centerX: sourceX + sign * GUTTER,
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
  const step = 18;
  return (index - (bundle.length - 1) / 2) * step;
}

/** Label leicht seitlich versetzen, damit es nicht auf der Linie liegt */
export function labelNudge(
  labelX: number,
  labelY: number,
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number
): { x: number; y: number } {
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const amount = 14;
  return { x: labelX + nx * amount, y: labelY + ny * amount };
}
