import { describe, expect, test } from 'vitest';
import {
  categoryOf,
  groupedCategories,
  ICON_NAMES,
  isInactiveCategory,
  kindOf,
  matchesSearch,
  nodeBadges,
  orphanFields,
} from './catalog';
// Bewusster Zugriff über die Paketgrenze: der Katalog des Backends IST die
// Quelle der Wahrheit für Kategorien, Packs und Vorlagen — ein zweiter Abzug
// hier würde genau das Auseinanderdriften erzeugen, das dieser Test verhindern
// soll. Das Backend ist reines JS ohne Typdeklarationen, daher die Ausnahmen.
// @ts-expect-error -- JS-Modul ohne .d.ts
import { buildCatalog, PACKS } from '../../../backend/src/catalog/index.js';
// @ts-expect-error -- JS-Modul ohne .d.ts
import { TEMPLATES } from '../../../backend/src/templates/index.js';
import type { ApiNode, Catalog } from '../api/types';

/**
 * Der Backend-Katalog nennt Icons nur als String; aufgelöst werden sie hier im
 * Frontend. Dieser Test hält beide Seiten zusammen — ohne ihn fällt ein neues
 * Pack erst in der laufenden UI als graues Standard-Symbol auf.
 */
describe('Icon-Abdeckung des Katalogs', () => {
  const known = new Set(ICON_NAMES);

  test('jede Kategorie des Gesamtkatalogs hat ein Icon', () => {
    const missing = buildCatalog()
      .categories.filter((c: { icon: string }) => !known.has(c.icon))
      .map((c: { id: string; icon: string }) => `${c.id} -> ${c.icon}`);
    expect(missing).toEqual([]);
  });

  test('jedes Pack und jede Vorlage hat ein Icon', () => {
    const missing = [
      ...PACKS.map((p: { id: string; icon: string }) => ({ what: `Pack ${p.id}`, icon: p.icon })),
      ...TEMPLATES.map((t: { id: string; icon: string }) => ({ what: `Vorlage ${t.id}`, icon: t.icon })),
    ]
      .filter((e) => !known.has(e.icon))
      .map((e) => `${e.what} -> ${e.icon}`);
    expect(missing).toEqual([]);
  });
});

const node = (fields: Record<string, string>, extra: Partial<ApiNode> = {}): ApiNode =>
  ({
    id: 'n', name: 'Node', category: 'generic', status: 'active',
    parentId: null, viewId: 'v', linkedViewId: null, position: { x: 0, y: 0 },
    width: null, height: null, fields, customFields: {}, notes: '',
    createdAt: '', updatedAt: '', ...extra,
  }) as ApiNode;

const catalogOf = (packs: string[]) => buildCatalog(packs) as unknown as Catalog;

describe('Feldanzeige folgt den Packs des Projekts', () => {
  test('nodeBadges zeigt nur Felder mit showOnNode, die auch gefüllt sind', () => {
    const catalog = catalogOf(['network']);
    expect(nodeBadges(catalog, node({ ip: '10.0.0.1', vlan: '20' }))).toEqual([
      { key: 'ip', value: '10.0.0.1' },
    ]);
    expect(nodeBadges(catalog, node({}))).toEqual([]);
  });

  test('ohne Netzwerk-Pack verschwindet die IP aus der Anzeige, nicht aus den Daten', () => {
    const entity = node({ ip: '10.0.0.1' });
    const business = catalogOf(['business']);
    expect(nodeBadges(business, entity)).toEqual([]);
    // Der Wert bleibt am Node und wird als „Weiteres Feld" wieder angeboten.
    expect(orphanFields(business, entity.fields).map((f) => f.key)).toEqual(['ip']);
    // Mit aktivem Pack ist er kein Waisenfeld mehr.
    expect(orphanFields(catalogOf(['network']), entity.fields)).toEqual([]);
  });

  test('leere Werte gelten nicht als gesetzt', () => {
    expect(orphanFields(catalogOf(['business']), { ip: '' })).toEqual([]);
  });

  test('ohne geladenen Katalog gilt nichts als Waisenfeld', () => {
    // Sonst würde das Panel während des Ladens kurz ALLE Werte nach
    // „Weitere Felder" schieben.
    expect(orphanFields(null, { ip: '10.0.0.1', owner: 'Team' })).toEqual([]);
    expect(nodeBadges(null, node({ ip: '10.0.0.1' }))).toEqual([]);
  });

  test('Waisenfelder behalten Label und Typ ihres abgewählten Packs', () => {
    const [replicas] = orphanFields(catalogOf(['network']), { replicas: '3' });
    expect(replicas).toMatchObject({ key: 'replicas', label: 'Replicas', type: 'number' });
    // Ein Schlüssel, den KEIN Pack kennt (Import aus fremder Instanz), fällt
    // auf den rohen Namen zurück statt zu verschwinden.
    const [foreign] = orphanFields(catalogOf(['network']), { irgendwas: 'x' });
    expect(foreign).toMatchObject({ key: 'irgendwas', label: 'irgendwas', type: 'text' });
  });
});

/**
 * Regression: Ein Pack abzuwählen darf bestehende Diagramme nicht optisch
 * zerlegen. Vor dieser Trennung verlor ein Node aus einem deaktivierten Pack
 * Icon, Farbe und Label und wurde als graues Standardsymbol mit roher ID
 * gezeichnet — bei einem Kubernetes-Projekt betraf das 12 von 13 Nodes.
 */
describe('Darstellen vs. Anbieten', () => {
  const network = catalogOf(['network']);

  test('Kategorie eines abgewählten Packs behält Icon, Farbe und Label', () => {
    const category = categoryOf(network, 'k8s-workload');
    expect(category.label).toBe('Deployment / StatefulSet');
    expect(category.icon).toBe('boxes');
    expect(category.color).not.toBe('#9ca3af');
    expect(isInactiveCategory(network, 'k8s-workload')).toBe(true);
  });

  test('Verbindungsart eines abgewählten Packs behält ihre Farbe', () => {
    const kind = kindOf(network, 'process-flow');
    expect(kind.label).toBe('Ablauf / nächster Schritt');
    expect(kind.color).not.toBe('#9ca3af');
  });

  test('die Palette bietet inaktive Bausteine trotzdem nicht an', () => {
    const offered = groupedCategories(network).flatMap(([, list]) => list.map((c) => c.id));
    expect(offered).not.toContain('k8s-workload');
    expect(offered).toContain('router');
    // Der Kern ist immer dabei.
    expect(offered).toContain('generic');
  });

  test('eine wirklich unbekannte Kategorie fällt weiterhin auf den Standard zurück', () => {
    const custom = categoryOf(network, 'mein-eigener-typ');
    expect(custom.label).toBe('mein-eigener-typ');
    expect(custom.color).toBe('#9ca3af');
    expect(isInactiveCategory(network, 'mein-eigener-typ')).toBe(false);
  });

  test('Suche findet Feld- und Custom-Field-Werte', () => {
    const entity = node({ ip: '10.0.0.1' }, { customFields: { Rack: 'R42' } });
    expect(matchesSearch(entity, '10.0.0')).toBe(true);
    expect(matchesSearch(entity, 'R42')).toBe(true);
    expect(matchesSearch(entity, 'gibtsnicht')).toBe(false);
  });
});
