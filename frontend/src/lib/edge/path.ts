/**
 * Polylinie → SVG-Pfad mit abgerundeten Ecken (funktioniert auch für
 * diagonale Segmente, Radius wird an kurze Segmente angepasst).
 * Beeinflusst: InfraEdge.tsx
 */
import type { FlowPoint } from '../../api/types';
import { distance } from './geometry';

export function roundedPath(points: FlowPoint[], radius = 8): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    const inLen = distance(prev, curr);
    const outLen = distance(curr, next);
    const r = Math.min(radius, inLen / 2, outLen / 2);
    if (r < 0.5 || inLen < 0.01 || outLen < 0.01) {
      d += ` L ${curr.x} ${curr.y}`;
      continue;
    }
    const inPoint = {
      x: curr.x - ((curr.x - prev.x) / inLen) * r,
      y: curr.y - ((curr.y - prev.y) / inLen) * r,
    };
    const outPoint = {
      x: curr.x + ((next.x - curr.x) / outLen) * r,
      y: curr.y + ((next.y - curr.y) / outLen) * r,
    };
    d += ` L ${inPoint.x} ${inPoint.y} Q ${curr.x} ${curr.y} ${outPoint.x} ${outPoint.y}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}
