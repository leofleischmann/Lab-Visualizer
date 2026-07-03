/**
 * Ausrichtungshilfen beim Node-Drag (bpmn.io-Stil): Kanten und Zentren
 * benachbarter Nodes ziehen den bewegten Node an, Hilfslinien zeigen die Flucht.
 * Beeinflusst: FlowCanvas.tsx, components/canvas/AlignmentGuides.tsx
 */
import type { Rect } from './edge/geometry';

export type AlignmentGuide = {
  axis: 'v' | 'h';
  position: number;
  from: number;
  to: number;
};

export type AlignmentResult = {
  dx: number;
  dy: number;
  guides: AlignmentGuide[];
};

type Candidate = { delta: number; position: number; other: Rect };

function edgesX(rect: Rect): number[] {
  return [rect.x, rect.x + rect.width / 2, rect.x + rect.width];
}

function edgesY(rect: Rect): number[] {
  return [rect.y, rect.y + rect.height / 2, rect.y + rect.height];
}

function bestCandidate(mine: number[], others: { values: number[]; rect: Rect }[], threshold: number): Candidate | null {
  let best: Candidate | null = null;
  for (const { values, rect } of others) {
    for (const otherValue of values) {
      for (const myValue of mine) {
        const delta = otherValue - myValue;
        if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) {
          best = { delta, position: otherValue, other: rect };
        }
      }
    }
  }
  return best;
}

const GUIDE_MARGIN = 24;

export function computeAlignment(rect: Rect, others: Rect[], threshold = 6): AlignmentResult {
  const xCandidates = others.map((o) => ({ values: edgesX(o), rect: o }));
  const yCandidates = others.map((o) => ({ values: edgesY(o), rect: o }));

  const bestX = bestCandidate(edgesX(rect), xCandidates, threshold);
  const bestY = bestCandidate(edgesY(rect), yCandidates, threshold);

  const guides: AlignmentGuide[] = [];
  const dx = bestX?.delta ?? 0;
  const dy = bestY?.delta ?? 0;

  if (bestX) {
    const from = Math.min(rect.y + dy, bestX.other.y) - GUIDE_MARGIN;
    const to = Math.max(rect.y + dy + rect.height, bestX.other.y + bestX.other.height) + GUIDE_MARGIN;
    guides.push({ axis: 'v', position: bestX.position, from, to });
  }
  if (bestY) {
    const from = Math.min(rect.x + dx, bestY.other.x) - GUIDE_MARGIN;
    const to = Math.max(rect.x + dx + rect.width, bestY.other.x + bestY.other.width) + GUIDE_MARGIN;
    guides.push({ axis: 'h', position: bestY.position, from, to });
  }

  return { dx, dy, guides };
}
