import { describe, expect, test } from 'vitest';
import { filterDefs, matchesFilters } from './catalog';
// @ts-expect-error -- JS-Modul ohne .d.ts (siehe backend-Kommentar in catalog.test.ts)
import { buildCatalog } from '../../../backend/src/catalog/index.js';
import type { ApiNode, Catalog } from '../api/types';

const catalogOf = (packs: string[]) => buildCatalog(packs) as unknown as Catalog;

const node = (overrides: Partial<ApiNode> = {}): ApiNode =>
  ({
    id: 'n', name: 'N', category: 'generic', status: 'active', parentId: null, viewId: 'v',
    linkedViewId: null, position: { x: 0, y: 0 }, width: null, height: null,
    icon: null, color: null, fields: {}, customFields: {}, notes: '',
    createdAt: '', updatedAt: '', ...overrides,
  }) as ApiNode;

describe('Filter bauen sich aus dem Katalog des Projekts', () => {
  test('Status und Kategorie sind immer dabei', () => {
    const keys = filterDefs(catalogOf([])).map((d) => d.key);
    expect(keys).toContain('status');
    expect(keys).toContain('category');
  });

  test('select-Felder des Projekts kommen dazu, andere Typen nicht', () => {
    const defs = filterDefs(catalogOf(['network']));
    const keys = defs.map((d) => d.key);
    // `environment` und `criticality` sind select …
    expect(keys).toContain('environment');
    expect(keys).toContain('criticality');
    // … `ip` ist Text und taugt nicht als Auswahlliste (dafür gibt es die Suche).
    expect(keys).not.toContain('ip');
    expect(defs.find((d) => d.key === 'environment')?.options.map((o) => o.value)).toEqual([
      'Production', 'Staging', 'Test', 'Development',
    ]);
  });

  test('ein Prozess-Projekt bekommt andere Kategorien als ein Server-Projekt', () => {
    const catOf = (packs: string[]) =>
      filterDefs(catalogOf(packs)).find((d) => d.key === 'category')!.options.map((o) => o.value);
    expect(catOf(['infrastructure'])).toContain('hypervisor');
    expect(catOf(['business'])).not.toContain('hypervisor');
    expect(catOf(['business'])).toContain('process-step');
  });

  test('Zonen stehen nicht zur Auswahl — sie sind Struktur, kein Inhalt', () => {
    const options = filterDefs(catalogOf([])).find((d) => d.key === 'category')!.options;
    expect(options.map((o) => o.value)).not.toContain('group');
  });

  test('ohne Katalog gibt es keine Filter', () => {
    expect(filterDefs(null)).toEqual([]);
  });
});

describe('Filter greifen als UND', () => {
  const kritisch = node({ fields: { environment: 'Production', criticality: 'Critical' } });

  test('leerer Filter lässt alles durch', () => {
    expect(matchesFilters(kritisch, {})).toBe(true);
  });

  test('ein Feldwert muss exakt passen', () => {
    expect(matchesFilters(kritisch, { criticality: 'Critical' })).toBe(true);
    expect(matchesFilters(kritisch, { criticality: 'Niedrig' })).toBe(false);
  });

  test('mehrere Filter müssen ALLE passen', () => {
    expect(matchesFilters(kritisch, { environment: 'Production', criticality: 'Critical' })).toBe(true);
    expect(matchesFilters(kritisch, { environment: 'Test', criticality: 'Critical' })).toBe(false);
  });

  test('Status und Kategorie liegen am Node, nicht in fields', () => {
    const db = node({ category: 'database', status: 'maintenance' });
    expect(matchesFilters(db, { category: 'database' })).toBe(true);
    expect(matchesFilters(db, { status: 'maintenance' })).toBe(true);
    expect(matchesFilters(db, { status: 'active' })).toBe(false);
  });

  test('ein Node ohne den gefilterten Wert fällt heraus', () => {
    expect(matchesFilters(node(), { criticality: 'Critical' })).toBe(false);
  });

  test('Zonen bleiben immer sichtbar', () => {
    // Sonst verschwände der Rahmen, während seine Kinder noch da sind.
    const zone = node({ category: 'group' });
    expect(matchesFilters(zone, { criticality: 'Critical' })).toBe(true);
    expect(matchesFilters(zone, { status: 'error' })).toBe(true);
  });

  test('ein leerer Wert zählt nicht als gesetzter Filter', () => {
    expect(matchesFilters(node(), { criticality: '' })).toBe(true);
  });
});
