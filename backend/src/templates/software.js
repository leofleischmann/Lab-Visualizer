/**
 * Software-Architektur nach C4-Idee: Ebene 1 ist der Systemkontext, Ebene 2
 * zerlegt das eigene System in Komponenten. Genau dafür ist die vorhandene
 * Ebenen-Hierarchie gedacht.
 */
export const software = {
  id: 'software',
  label: 'Software-Architektur',
  description: 'Systemkontext und Komponentenzerlegung, C4-artig über zwei Ebenen.',
  icon: 'puzzle',
  color: '#a78bfa',
  packs: ['software', 'operations'],
  footprint: { views: 2, nodes: 14 },

  build({ view, node, edge }) {
    const l2 = view({
      name: 'Shop-Plattform (Komponenten)',
      description: 'Zerlegung des eigenen Systems in Module und Schnittstellen.',
    });

    // ── Ebene 1: Systemkontext ──
    node({ id: 'customer', name: 'Kundin', category: 'actor', status: 'active', position: { x: 140, y: 40 } });
    node({ id: 'staff', name: 'Mitarbeitende', category: 'actor', status: 'active', position: { x: 700, y: 40 } });
    node({
      id: 'shop', name: 'Shop-Plattform', category: 'software-system', status: 'active',
      linkedViewId: l2.id, position: { x: 400, y: 260 },
      fields: { owner: 'Team Commerce', repository: 'https://github.com/example/shop', language: 'TypeScript', criticality: 'Kritisch' },
      notes: 'Eigenes System. **Doppelklick** öffnet die Komponentensicht.',
    });
    node({ id: 'pay', name: 'Zahlungsdienstleister', category: 'external-system', status: 'active', position: { x: 100, y: 500 }, fields: { owner: 'extern' } });
    node({ id: 'erp', name: 'ERP', category: 'external-system', status: 'active', position: { x: 400, y: 500 }, fields: { owner: 'extern' } });
    node({ id: 'mailer', name: 'E-Mail-Versand', category: 'external-system', status: 'active', position: { x: 700, y: 500 }, fields: { owner: 'extern' } });

    edge('customer', 'shop', { kind: 'api', label: 'bestellt' });
    edge('staff', 'shop', { kind: 'api', label: 'pflegt Katalog' });
    edge('shop', 'pay', { kind: 'api', label: 'Zahlung autorisieren' });
    edge('shop', 'erp', { kind: 'data-flow', label: 'Auftrag übergeben' });
    edge('shop', 'mailer', { kind: 'event', label: 'Bestellbestätigung' });

    // ── Ebene 2: Komponenten ──
    node({ id: 'zone', name: 'Shop-Plattform', category: 'group', viewId: l2.id, position: { x: 40, y: 40 }, width: 900, height: 520 });
    const inZone = (o) => node({ ...o, viewId: l2.id, parentId: 'zone', status: 'active' });
    inZone({ id: 'web', name: 'Web-Frontend', category: 'component', position: { x: 40, y: 60 }, fields: { language: 'React' } });
    inZone({ id: 'api', name: 'Öffentliche API', category: 'api-endpoint', position: { x: 340, y: 60 }, fields: { language: 'TypeScript' } });
    inZone({ id: 'catalog', name: 'Katalog', category: 'component', position: { x: 340, y: 200 } });
    inZone({ id: 'orders', name: 'Bestellungen', category: 'component', position: { x: 640, y: 200 } });
    inZone({ id: 'queue', name: 'Event-Bus', category: 'message-queue', position: { x: 640, y: 60 }, fields: { platform: 'RabbitMQ' } });
    inZone({ id: 'db', name: 'Shop-Datenbank', category: 'database', position: { x: 340, y: 360 }, fields: { platform: 'PostgreSQL 16' } });
    inZone({ id: 'search', name: 'Suchindex', category: 'component', position: { x: 40, y: 360 }, fields: { platform: 'OpenSearch' } });

    edge('web', 'api', { kind: 'api', label: 'REST' });
    edge('api', 'catalog', { kind: 'dependency' });
    edge('api', 'orders', { kind: 'dependency' });
    edge('catalog', 'db', { kind: 'data-flow' });
    edge('orders', 'db', { kind: 'data-flow' });
    edge('orders', 'queue', { kind: 'event', label: 'OrderPlaced', animated: true });
    edge('catalog', 'search', { kind: 'data-flow', label: 'indiziert', lineStyle: 'dashed' });
  },
};
