/**
 * Prozesse & Organisation. Bewusst ohne einen einzigen Server: kein Feld für
 * IP, Hostname oder Betriebssystem ist hier aktiv — der Beleg dafür, dass das
 * Werkzeug nicht an Infrastruktur hängt.
 */
export const business = {
  id: 'business',
  label: 'Process & organization',
  description: 'A business process with roles, decisions and the systems involved.',
  icon: 'briefcase',
  color: '#a3e635',
  packs: ['business'],
  footprint: { views: 2, nodes: 14 },

  build({ view, node, edge }) {
    const l2 = view({
      name: 'Invoice review (flow)',
      description: 'Steps, decisions and responsibilities in detail.',
    });

    // ── Ebene 1: Landkarte ──
    node({ id: 'proc-order', name: 'Ordering', category: 'process', status: 'active', position: { x: 120, y: 60 }, fields: { owner: 'Purchasing', frequency: 'daily' } });
    node({
      id: 'proc-invoice', name: 'Invoice review', category: 'process', status: 'active',
      linkedViewId: l2.id, position: { x: 440, y: 60 },
      fields: { owner: 'Accounting', frequency: 'daily', costCenter: '4711', criticality: 'High' },
      notes: '**Double-click** opens the flow.',
    });
    node({ id: 'proc-pay', name: 'Payment', category: 'process', status: 'active', position: { x: 760, y: 60 }, fields: { owner: 'Accounting', frequency: 'weekly' } });

    node({ id: 'dep-buy', name: 'Purchasing', category: 'department', status: 'active', position: { x: 120, y: 280 }, fields: { costCenter: '4200' } });
    node({ id: 'dep-fin', name: 'Accounting', category: 'department', status: 'active', position: { x: 500, y: 280 }, fields: { costCenter: '4711' } });

    node({ id: 'sys-erp', name: 'ERP', category: 'business-system', status: 'active', position: { x: 300, y: 460 }, fields: { platform: 'SAP', owner: 'IT' } });
    node({ id: 'sys-dms', name: 'Document store', category: 'business-system', status: 'active', position: { x: 660, y: 460 }, fields: { owner: 'IT' } });

    edge('proc-order', 'proc-invoice', { kind: 'process-flow', label: 'delivery received' });
    edge('proc-invoice', 'proc-pay', { kind: 'process-flow', label: 'approved' });
    edge('dep-buy', 'proc-order', { kind: 'responsibility', label: 'accountable', lineStyle: 'dashed' });
    edge('dep-fin', 'proc-invoice', { kind: 'responsibility', label: 'accountable', lineStyle: 'dashed' });
    edge('proc-invoice', 'sys-erp', { kind: 'data-flow', label: 'booking' });
    edge('proc-invoice', 'sys-dms', { kind: 'data-flow', label: 'file receipt' });

    // ── Ebene 2: Ablauf ──
    node({ id: 'doc-in', name: 'Invoice arrives', category: 'document', status: 'active', viewId: l2.id, position: { x: 380, y: 40 } });
    node({ id: 'step-check', name: 'Verify content', category: 'process-step', status: 'active', viewId: l2.id, position: { x: 380, y: 180 }, fields: { owner: 'Business unit' } });
    node({ id: 'dec', name: 'Amount over 5,000 EUR?', category: 'decision', status: 'active', viewId: l2.id, position: { x: 380, y: 320 } });
    node({ id: 'step-approve', name: 'Second approval', category: 'process-step', status: 'active', viewId: l2.id, position: { x: 700, y: 320 }, fields: { owner: 'Management' } });
    node({ id: 'step-book', name: 'Book entry', category: 'process-step', status: 'active', viewId: l2.id, position: { x: 380, y: 480 }, fields: { owner: 'Accounting' } });
    node({ id: 'role-lead', name: 'Division lead', category: 'role', status: 'active', viewId: l2.id, position: { x: 700, y: 180 } });
    node({ id: 'step-file', name: 'Archive receipt', category: 'process-step', status: 'active', viewId: l2.id, position: { x: 380, y: 620 } });

    edge('doc-in', 'step-check', { kind: 'process-flow' });
    edge('step-check', 'dec', { kind: 'process-flow' });
    edge('dec', 'step-approve', { kind: 'process-flow', label: 'yes' });
    edge('dec', 'step-book', { kind: 'process-flow', label: 'no' });
    edge('step-approve', 'step-book', { kind: 'process-flow', label: 'approved' });
    edge('step-book', 'step-file', { kind: 'process-flow' });
    edge('role-lead', 'step-approve', { kind: 'responsibility', lineStyle: 'dashed' });
  },
};
