/**
 * Software-Architektur nach C4-Idee: Ebene 1 ist der Systemkontext, Ebene 2
 * zerlegt das eigene System in Komponenten. Genau dafür ist die vorhandene
 * Ebenen-Hierarchie gedacht.
 */
export const software = {
  id: 'software',
  label: 'Software architecture',
  description: 'System context and component breakdown, C4-style across two levels.',
  icon: 'puzzle',
  color: '#a78bfa',
  packs: ['software', 'operations'],
  footprint: { views: 2, nodes: 14 },

  build({ view, node, edge }) {
    const l2 = view({
      name: 'Shop platform (components)',
      description: 'Breakdown of your own system into modules and interfaces.',
    });

    // ── Ebene 1: Systemkontext ──
    node({ id: 'customer', name: 'Customer', category: 'actor', status: 'active', position: { x: 140, y: 40 } });
    node({ id: 'staff', name: 'Staff', category: 'actor', status: 'active', position: { x: 700, y: 40 } });
    node({
      id: 'shop', name: 'Shop platform', category: 'software-system', status: 'active',
      linkedViewId: l2.id, position: { x: 400, y: 260 },
      fields: { owner: 'Team Commerce', repository: 'https://github.com/example/shop', language: 'TypeScript', criticality: 'Critical' },
      notes: 'Your own system. **Double-click** opens the component view.',
    });
    node({ id: 'pay', name: 'Payment provider', category: 'external-system', status: 'active', position: { x: 100, y: 500 }, fields: { owner: 'external' } });
    node({ id: 'erp', name: 'ERP', category: 'external-system', status: 'active', position: { x: 400, y: 500 }, fields: { owner: 'external' } });
    node({ id: 'mailer', name: 'Email delivery', category: 'external-system', status: 'active', position: { x: 700, y: 500 }, fields: { owner: 'external' } });

    edge('customer', 'shop', { kind: 'api', label: 'places orders' });
    edge('staff', 'shop', { kind: 'api', label: 'maintains catalog' });
    edge('shop', 'pay', { kind: 'api', label: 'authorize payment' });
    edge('shop', 'erp', { kind: 'data-flow', label: 'hand over order' });
    edge('shop', 'mailer', { kind: 'event', label: 'order confirmation' });

    // ── Ebene 2: Komponenten ──
    node({ id: 'zone', name: 'Shop platform', category: 'group', viewId: l2.id, position: { x: 40, y: 40 }, width: 900, height: 520 });
    const inZone = (o) => node({ ...o, viewId: l2.id, parentId: 'zone', status: 'active' });
    inZone({ id: 'web', name: 'Web frontend', category: 'component', position: { x: 40, y: 60 }, fields: { language: 'React' } });
    inZone({ id: 'api', name: 'Public API', category: 'api-endpoint', position: { x: 340, y: 60 }, fields: { language: 'TypeScript' } });
    inZone({ id: 'catalog', name: 'Catalog', category: 'component', position: { x: 340, y: 200 } });
    inZone({ id: 'orders', name: 'Orders', category: 'component', position: { x: 640, y: 200 } });
    inZone({ id: 'queue', name: 'Event bus', category: 'message-queue', position: { x: 640, y: 60 }, fields: { platform: 'RabbitMQ' } });
    inZone({ id: 'db', name: 'Shop database', category: 'database', position: { x: 340, y: 360 }, fields: { platform: 'PostgreSQL 16' } });
    inZone({ id: 'search', name: 'Search index', category: 'component', position: { x: 40, y: 360 }, fields: { platform: 'OpenSearch' } });

    edge('web', 'api', { kind: 'api', label: 'REST' });
    edge('api', 'catalog', { kind: 'dependency' });
    edge('api', 'orders', { kind: 'dependency' });
    edge('catalog', 'db', { kind: 'data-flow' });
    edge('orders', 'db', { kind: 'data-flow' });
    edge('orders', 'queue', { kind: 'event', label: 'OrderPlaced', animated: true });
    edge('catalog', 'search', { kind: 'data-flow', label: 'indexes', lineStyle: 'dashed' });
  },
};
