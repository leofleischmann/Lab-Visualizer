import { describe, expect, test } from 'vitest';
import type { FlowEdge } from '../../api/types';
import {
  DEFAULT_LABEL_T,
  defaultLabelT,
  isRoutingCustomized,
  labelPosition,
  labelTFromPointer,
  normalizeRouting,
} from './routing';

// Waagerechte Strecke der Länge 100 — damit ist t direkt in x ablesbar.
const LINE = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
];

const edge = (id: string, source: string, target: string) => ({ id, source, target }) as FlowEdge;

describe('normalizeRouting', () => {
  test('ohne Eingabe kommt das Standard-Routing zurück', () => {
    expect(normalizeRouting(null)).toEqual({ mode: 'auto', waypoints: [], labelT: null });
    expect(normalizeRouting(undefined)).toEqual({ mode: 'auto', waypoints: [], labelT: null });
  });

  test('unbekannter Modus fällt auf "auto" zurück', () => {
    expect(normalizeRouting({ mode: 'kaputt' as 'auto', waypoints: [] }).mode).toBe('auto');
  });

  test('labelT wird auf 0..1 begrenzt, Unsinn wird zu null', () => {
    expect(normalizeRouting({ mode: 'auto', waypoints: [], labelT: 5 }).labelT).toBe(1);
    expect(normalizeRouting({ mode: 'auto', waypoints: [], labelT: -3 }).labelT).toBe(0);
    expect(normalizeRouting({ mode: 'auto', waypoints: [], labelT: null }).labelT).toBeNull();
  });

  test('Wegpunkte werden kopiert, nicht referenziert', () => {
    const input = { mode: 'manual' as const, waypoints: [{ x: 1, y: 2 }] };
    const result = normalizeRouting(input);
    result.waypoints[0].x = 999;
    expect(input.waypoints[0].x).toBe(1);
  });

  test('kaputte waypoints kippen nicht die App', () => {
    expect(normalizeRouting({ mode: 'auto', waypoints: 'nope' as never }).waypoints).toEqual([]);
  });
});

describe('isRoutingCustomized', () => {
  test('unberührtes Auto-Routing gilt als nicht angepasst', () => {
    expect(isRoutingCustomized({ mode: 'auto', waypoints: [], labelT: null })).toBe(false);
  });

  test('Modus, Wegpunkte oder ein Label-Anker machen es angepasst', () => {
    expect(isRoutingCustomized({ mode: 'manual', waypoints: [], labelT: null })).toBe(true);
    expect(isRoutingCustomized({ mode: 'auto', waypoints: [{ x: 1, y: 1 }], labelT: null })).toBe(true);
    expect(isRoutingCustomized({ mode: 'auto', waypoints: [], labelT: 0.3 })).toBe(true);
  });
});

describe('labelPosition', () => {
  test('ohne Anker sitzt das Label beim Standardwert', () => {
    const p = labelPosition(LINE, { mode: 'auto', waypoints: [], labelT: null });
    expect(p.x).toBeCloseTo(100 * DEFAULT_LABEL_T);
  });

  test('der Anker bestimmt die Position entlang der Linie', () => {
    const p = labelPosition(LINE, { mode: 'auto', waypoints: [], labelT: 0.25 });
    expect(p.x).toBeCloseTo(25);
    expect(p.y).toBeCloseTo(0);
  });
});

describe('labelTFromPointer', () => {
  test('die Zeigerposition wird auf den Pfad projiziert', () => {
    // Punkt neben der Linie → senkrecht auf sie projiziert.
    expect(labelTFromPointer(LINE, { x: 40, y: 50 })).toBeCloseTo(0.4);
  });

  test('das Label rutscht nie ganz an die Enden', () => {
    expect(labelTFromPointer(LINE, { x: -500, y: 0 })).toBeGreaterThan(0);
    expect(labelTFromPointer(LINE, { x: 5000, y: 0 })).toBeLessThan(1);
  });
});

describe('defaultLabelT', () => {
  test('eine einzelne Kante bekommt den Standardanker', () => {
    const edges = [edge('e1', 'a', 'b')];
    expect(defaultLabelT('e1', 'a', 'b', edges)).toBe(DEFAULT_LABEL_T);
  });

  test('parallele Kanten werden gestaffelt, damit Labels sich nicht stapeln', () => {
    const edges = [edge('e1', 'a', 'b'), edge('e2', 'a', 'b'), edge('e3', 'a', 'b')];
    const ts = edges.map((e) => defaultLabelT(e.id, 'a', 'b', edges));
    expect(new Set(ts).size).toBe(3);
    expect(Math.min(...ts)).toBeGreaterThanOrEqual(0.15);
    expect(Math.max(...ts)).toBeLessThanOrEqual(0.85);
  });

  test('die Richtung des Paares spielt keine Rolle (a→b bündelt mit b→a)', () => {
    const edges = [edge('e1', 'a', 'b'), edge('e2', 'b', 'a')];
    expect(defaultLabelT('e1', 'a', 'b', edges)).not.toBe(defaultLabelT('e2', 'b', 'a', edges));
  });

  test('Kanten zu anderen Nodes beeinflussen die Staffelung nicht', () => {
    const edges = [edge('e1', 'a', 'b'), edge('e2', 'c', 'd')];
    expect(defaultLabelT('e1', 'a', 'b', edges)).toBe(DEFAULT_LABEL_T);
  });
});
