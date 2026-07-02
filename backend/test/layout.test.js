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
