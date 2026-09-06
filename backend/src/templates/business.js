/**
 * Prozesse & Organisation. Bewusst ohne einen einzigen Server: kein Feld für
 * IP, Hostname oder Betriebssystem ist hier aktiv — der Beleg dafür, dass das
 * Werkzeug nicht an Infrastruktur hängt.
 */
export const business = {
  id: 'business',
  label: 'Prozess & Organisation',
  description: 'Ein Fachprozess mit Rollen, Entscheidungen und beteiligten Systemen.',
  icon: 'briefcase',
  color: '#a3e635',
  packs: ['business'],
  footprint: { views: 2, nodes: 14 },

  build({ view, node, edge }) {
    const l2 = view({
      name: 'Rechnungsprüfung (Ablauf)',
      description: 'Schritte, Entscheidungen und Zuständigkeiten im Detail.',
    });

    // ── Ebene 1: Landkarte ──
    node({ id: 'proc-order', name: 'Bestellung', category: 'process', status: 'active', position: { x: 120, y: 60 }, fields: { owner: 'Einkauf', frequency: 'täglich' } });
    node({
      id: 'proc-invoice', name: 'Rechnungsprüfung', category: 'process', status: 'active',
      linkedViewId: l2.id, position: { x: 440, y: 60 },
      fields: { owner: 'Buchhaltung', frequency: 'täglich', costCenter: '4711', criticality: 'Hoch' },
      notes: '**Doppelklick** öffnet den Ablauf.',
    });
    node({ id: 'proc-pay', name: 'Zahlung', category: 'process', status: 'active', position: { x: 760, y: 60 }, fields: { owner: 'Buchhaltung', frequency: 'wöchentlich' } });

    node({ id: 'dep-buy', name: 'Einkauf', category: 'department', status: 'active', position: { x: 120, y: 280 }, fields: { costCenter: '4200' } });
    node({ id: 'dep-fin', name: 'Buchhaltung', category: 'department', status: 'active', position: { x: 500, y: 280 }, fields: { costCenter: '4711' } });

    node({ id: 'sys-erp', name: 'ERP', category: 'business-system', status: 'active', position: { x: 300, y: 460 }, fields: { platform: 'SAP', owner: 'IT' } });
    node({ id: 'sys-dms', name: 'Dokumentenablage', category: 'business-system', status: 'active', position: { x: 660, y: 460 }, fields: { owner: 'IT' } });

    edge('proc-order', 'proc-invoice', { kind: 'process-flow', label: 'Lieferung erhalten' });
    edge('proc-invoice', 'proc-pay', { kind: 'process-flow', label: 'freigegeben' });
    edge('dep-buy', 'proc-order', { kind: 'responsibility', label: 'verantwortlich', lineStyle: 'dashed' });
    edge('dep-fin', 'proc-invoice', { kind: 'responsibility', label: 'verantwortlich', lineStyle: 'dashed' });
    edge('proc-invoice', 'sys-erp', { kind: 'data-flow', label: 'Buchung' });
    edge('proc-invoice', 'sys-dms', { kind: 'data-flow', label: 'Beleg ablegen' });

    // ── Ebene 2: Ablauf ──
    node({ id: 'doc-in', name: 'Rechnung geht ein', category: 'document', status: 'active', viewId: l2.id, position: { x: 380, y: 40 } });
    node({ id: 'step-check', name: 'Sachlich prüfen', category: 'process-step', status: 'active', viewId: l2.id, position: { x: 380, y: 180 }, fields: { owner: 'Fachabteilung' } });
    node({ id: 'dec', name: 'Betrag über 5.000 €?', category: 'decision', status: 'active', viewId: l2.id, position: { x: 380, y: 320 } });
    node({ id: 'step-approve', name: 'Zweitfreigabe', category: 'process-step', status: 'active', viewId: l2.id, position: { x: 700, y: 320 }, fields: { owner: 'Leitung' } });
    node({ id: 'step-book', name: 'Buchen', category: 'process-step', status: 'active', viewId: l2.id, position: { x: 380, y: 480 }, fields: { owner: 'Buchhaltung' } });
    node({ id: 'role-lead', name: 'Bereichsleitung', category: 'role', status: 'active', viewId: l2.id, position: { x: 700, y: 180 } });
    node({ id: 'step-file', name: 'Beleg archivieren', category: 'process-step', status: 'active', viewId: l2.id, position: { x: 380, y: 620 } });

    edge('doc-in', 'step-check', { kind: 'process-flow' });
    edge('step-check', 'dec', { kind: 'process-flow' });
    edge('dec', 'step-approve', { kind: 'process-flow', label: 'ja' });
    edge('dec', 'step-book', { kind: 'process-flow', label: 'nein' });
    edge('step-approve', 'step-book', { kind: 'process-flow', label: 'freigegeben' });
    edge('step-book', 'step-file', { kind: 'process-flow' });
    edge('role-lead', 'step-approve', { kind: 'responsibility', lineStyle: 'dashed' });
  },
};
