/**
 * Docking-Logik: an welcher Node-Seite eine Kante ansetzt und wo genau.
 * Beeinflusst: lib/edge/orthogonal.ts (Auto-Routing), lib/edge/manual.ts (Reparatur)
 */
import type { FlowPoint } from '../../api/types';
import { rectCenter, type Rect } from './geometry';

export type Side = 'top' | 'right' | 'bottom' | 'left';

/** Achse, auf der eine Kante die Seite verlässt. */
export function sideAxis(side: Side): 'h' | 'v' {
  return side === 'left' || side === 'right' ? 'h' : 'v';
}

export function outwardNormal(side: Side): FlowPoint {
  switch (side) {
    case 'top':
      return { x: 0, y: -1 };
    case 'right':
      return { x: 1, y: 0 };
    case 'bottom':
      return { x: 0, y: 1 };
    case 'left':
      return { x: -1, y: 0 };
  }
}

/**
 * Dockpunkt auf der Seitenmitte, optional entlang der Seite verschoben
 * (für parallele Kanten). Bleibt mit Innenabstand auf der Node-Kante.
 */
export function dockPoint(rect: Rect, side: Side, shift = 0): FlowPoint {
  const inset = 10;
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  if (sideAxis(side) === 'h') {
    const x = side === 'left' ? rect.x : rect.x + rect.width;
    const y = Math.min(rect.y + rect.height - inset, Math.max(rect.y + inset, cy + shift));
    return { x, y };
  }
  const y = side === 'top' ? rect.y : rect.y + rect.height;
  const x = Math.min(rect.x + rect.width - inset, Math.max(rect.x + inset, cx + shift));
  return { x, y };
}


/**
 * Beste Seitenkombination für die Auto-Route zwischen zwei Nodes:
 * bevorzugt die Achse mit dem größeren freien Abstand zwischen den Rechtecken.
 */
export function chooseSides(source: Rect, target: Rect): { source: Side; target: Side } {
  const gapRight = target.x - (source.x + source.width);
  const gapLeft = source.x - (target.x + target.width);
  const gapBelow = target.y - (source.y + source.height);
  const gapAbove = source.y - (target.y + target.height);

  const horizontalGap = Math.max(gapRight, gapLeft);
  const verticalGap = Math.max(gapBelow, gapAbove);

  if (horizontalGap >= verticalGap) {
    if (gapRight >= gapLeft) return { source: 'right', target: 'left' };
    return { source: 'left', target: 'right' };
  }
  if (gapBelow >= gapAbove) return { source: 'bottom', target: 'top' };
  return { source: 'top', target: 'bottom' };
}

/**
 * Seite eines Rechtecks, die einem externen Punkt zugewandt ist.
 * Normalisiert auf die Halbausdehnung, damit flache/breite Nodes korrekt wirken.
 */
export function sideToward(rect: Rect, p: FlowPoint): Side {
  const c = rectCenter(rect);
  const dx = (p.x - c.x) / Math.max(1, rect.width / 2);
  const dy = (p.y - c.y) / Math.max(1, rect.height / 2);
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'bottom' : 'top';
}
