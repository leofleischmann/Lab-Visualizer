import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeLayout } from '../src/layout.js';

test('Zone-Kinder mit interner Kette werden in Zeilenfluss angeordnet', () => {
  const nodes = [
    {
      id: 'zone',
      name: 'Zone',
      category: 'group',
      parentId: null,
      position: { x: 0, y: 0 },
      width: 400,
      height: 300,
    },
    { id: 'a', name: 'A', category: 'dns', parentId: 'zone', position: { x: 0, y: 0 } },
    { id: 'b', name: 'B', category: 'tunnel', parentId: 'zone', position: { x: 0, y: 0 } },
    { id: 'c', name: 'C', category: 'firewall', parentId: 'zone', position: { x: 0, y: 0 } },
  ];
  const edges = [
    { id: 'e1', sourceId: 'a', targetId: 'b' },
    { id: 'e2', sourceId: 'b', targetId: 'c' },
  ];

  const laid = computeLayout(nodes, edges);
  const a = laid.find((n) => n.id === 'a').position;
  const b = laid.find((n) => n.id === 'b').position;
  const c = laid.find((n) => n.id === 'c').position;

  assert.equal(a.y, b.y, 'Kette in derselben Zeile');
  assert.equal(b.y, c.y, 'Kette in derselben Zeile');
  assert.ok(a.x < b.x && b.x < c.x, 'Fluss links nach rechts');
});

test('Auto-Layout ist deterministisch', () => {
  const nodes = [
    { id: 'g1', name: 'G', category: 'group', parentId: null, position: { x: 0, y: 0 } },
    { id: 'n1', name: 'N1', category: 'client', parentId: 'g1', position: { x: 0, y: 0 } },
    { id: 'n2', name: 'N2', category: 'dns', parentId: null, position: { x: 0, y: 0 } },
  ];
  const edges = [{ id: 'e', sourceId: 'n1', targetId: 'n2' }];

  const once = computeLayout(nodes, edges);
  const twice = computeLayout(nodes, edges);
  assert.deepEqual(once, twice);
});

test('überlappende Zone-Kinder erhalten unterschiedliche Positionen', () => {
  const nodes = [
    {
      id: 'zone',
      name: 'Zone',
      category: 'group',
      parentId: null,
      position: { x: 0, y: 0 },
    },
    { id: 'a', name: 'A', category: 'x', parentId: 'zone', position: { x: 0, y: 0 } },
    { id: 'b', name: 'B', category: 'x', parentId: 'zone', position: { x: 0, y: 0 } },
    { id: 'c', name: 'C', category: 'x', parentId: 'zone', position: { x: 0, y: 0 } },
  ];
  const laid = computeLayout(nodes, []);
  const positions = laid
    .filter((n) => n.parentId === 'zone')
    .map((n) => `${n.position.x},${n.position.y}`);
  assert.equal(new Set(positions).size, 3);
});

test('Hub-Kind in Zone wird zur Zeilenmitte gelegt', () => {
  const nodes = [
    { id: 'zone', name: 'Z', category: 'group', parentId: null, position: { x: 0, y: 0 } },
    { id: 'leaf1', name: 'L1', category: 'x', parentId: 'zone', position: { x: 0, y: 0 } },
    { id: 'leaf2', name: 'L2', category: 'x', parentId: 'zone', position: { x: 0, y: 0 } },
    { id: 'hub', name: 'Hub', category: 'x', parentId: 'zone', position: { x: 0, y: 0 } },
    { id: 'ext', name: 'Ext', category: 'y', parentId: null, position: { x: 0, y: 0 } },
  ];
  const edges = [
    { id: 'e1', sourceId: 'hub', targetId: 'ext' },
    { id: 'e2', sourceId: 'hub', targetId: 'leaf1' },
    { id: 'e3', sourceId: 'leaf2', targetId: 'ext' },
  ];
  const laid = computeLayout(nodes, edges);
  const kids = laid.filter((n) => n.parentId === 'zone');
  const hub = kids.find((n) => n.id === 'hub');
  const xs = kids.map((n) => n.position.x).sort((a, b) => a - b);
  const mid = (xs[0] + xs[xs.length - 1]) / 2;
  assert.ok(Math.abs(hub.position.x - mid) <= Math.abs(xs[0] - mid));
});

/**
 * Regression: Die Grundflaeche eines freistehenden Nodes wurde dreifach
 * gezaehlt — CELL_* (Rasterschritt, enthaelt schon eine Luecke) PLUS PAD_*
 * (Innenabstand einer Zone) PLUS ENTITY_GAP_X/LAYER_GAP_Y. Ein 230x92 px
 * grosser Node bekam dadurch ~380 px Luecke waagerecht und ~480 px senkrecht;
 * bei wenigen Nodes wirkte die Ebene dadurch voellig auseinandergezogen.
 *
 * Referenz sind die von Hand gesetzten Abstaende des Beispielprojekts
 * (backend/src/templates/homelab.js): x-Schritt 300-360, y-Schritt 180-200.
 */
const NODE_W = 230;
const NODE_H = 92;

/** Kleinster Abstand zwischen zwei benachbarten Spalten bzw. Zeilen. */
function steps(laid) {
  const uniq = (vals) => [...new Set(vals)].sort((a, b) => a - b);
  const gaps = (vals) => uniq(vals).slice(1).map((v, i) => v - uniq(vals)[i]);
  return {
    x: gaps(laid.map((n) => n.position.x)),
    y: gaps(laid.map((n) => n.position.y)),
  };
}

test('Abstaende freistehender Nodes bleiben im Rahmen der Handarbeit', () => {
  // Stern: ein Knoten zeigt auf vier weitere -> eine Zeile mit vier Spalten
  const nodes = Array.from({ length: 5 }, (_, i) => ({
    id: `n${i}`, name: `N${i}`, category: 'generic', parentId: null, position: { x: 0, y: 0 },
  }));
  const edges = Array.from({ length: 4 }, (_, i) => ({
    id: `e${i}`, sourceId: 'n0', targetId: `n${i + 1}`,
  }));

  const { x, y } = steps(computeLayout(nodes, edges));
  for (const step of x) {
    assert.ok(step >= NODE_W, `Spaltenschritt ${step} laesst Nodes ueberlappen`);
    assert.ok(step <= NODE_W + 200, `Spaltenschritt ${step} ist zu weit (Node ist ${NODE_W} breit)`);
  }
  for (const step of y) {
    assert.ok(step >= NODE_H, `Zeilenschritt ${step} laesst Nodes ueberlappen`);
    assert.ok(step <= NODE_H + 200, `Zeilenschritt ${step} ist zu weit (Node ist ${NODE_H} hoch)`);
  }
});

test('eine lange Kette waechst linear und nicht in Spruengen', () => {
  const chain = (n) => {
    const nodes = Array.from({ length: n }, (_, i) => ({
      id: `n${i}`, name: `N${i}`, category: 'generic', parentId: null, position: { x: 0, y: 0 },
    }));
    const edges = Array.from({ length: n - 1 }, (_, i) => ({
      id: `e${i}`, sourceId: `n${i}`, targetId: `n${i + 1}`,
    }));
    const laid = computeLayout(nodes, edges);
    return Math.max(...laid.map((p) => p.position.y)) + NODE_H;
  };
  // Fuenf Nodes untereinander duerfen kein halbes Stockwerk hoch werden.
  assert.ok(chain(5) < 1100, `Kette aus 5 Nodes ist ${chain(5)} px hoch`);
});

test('Zonen umschliessen ihre Kinder mit gleichmaessigem Rand', () => {
  const nodes = [
    { id: 'z', name: 'Z', category: 'group', parentId: null, position: { x: 0, y: 0 } },
    ...Array.from({ length: 6 }, (_, i) => ({
      id: `c${i}`, name: `C${i}`, category: 'generic', parentId: 'z', position: { x: 0, y: 0 },
    })),
  ];
  const laid = computeLayout(nodes, []);
  const zone = laid.find((n) => n.id === 'z');
  const kids = laid.filter((n) => n.parentId === 'z');
  const right = Math.max(...kids.map((k) => k.position.x)) + NODE_W;
  const bottom = Math.max(...kids.map((k) => k.position.y)) + NODE_H;

  // Kinder passen hinein …
  assert.ok(zone.width >= right, 'Zone ist schmaler als ihr Inhalt');
  assert.ok(zone.height >= bottom, 'Zone ist niedriger als ihr Inhalt');
  // … ohne dass rechts/unten fast eine ganze Rasterzelle leer bleibt.
  assert.ok(zone.width - right <= 80, `Rand rechts ist ${zone.width - right} px`);
  assert.ok(zone.height - bottom <= 80, `Rand unten ist ${zone.height - bottom} px`);
});
