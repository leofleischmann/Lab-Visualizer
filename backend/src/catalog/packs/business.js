/**
 * Prozesse und Organisation — der Nachweis, dass das Werkzeug ohne einen
 * einzigen Server auskommt: keine IP, kein Hostname, kein Betriebssystem.
 */
export const business = {
  id: 'business',
  label: 'Prozesse & Organisation',
  description: 'Prozessschritte, Entscheidungen, Rollen, Abteilungen, Fachsysteme.',
  icon: 'briefcase',

  categories: [
    { id: 'process', label: 'Prozess', group: 'Prozesse', color: '#a3e635', icon: 'workflow' },
    { id: 'process-step', label: 'Prozessschritt', group: 'Prozesse', color: '#84cc16', icon: 'list-checks' },
    { id: 'decision', label: 'Entscheidung', group: 'Prozesse', color: '#fbbf24', icon: 'git-fork' },
    { id: 'document', label: 'Dokument / Formular', group: 'Prozesse', color: '#93c5fd', icon: 'file-text' },
    { id: 'role', label: 'Rolle', group: 'Organisation', color: '#e2e8f0', icon: 'user-round' },
    { id: 'department', label: 'Abteilung / Team', group: 'Organisation', color: '#64748b', icon: 'building-2' },
    { id: 'business-system', label: 'Fachsystem', group: 'Organisation', color: '#c084fc', icon: 'briefcase' },
  ],

  edgeKinds: [
    { id: 'process-flow', label: 'Ablauf / nächster Schritt', group: 'Prozesse', color: '#a3e635' },
    { id: 'responsibility', label: 'Zuständigkeit', group: 'Prozesse', color: '#e2e8f0' },
  ],

  fields: [
    { key: 'costCenter', label: 'Kostenstelle', type: 'text', group: 'Organisation', mono: true },
    { key: 'frequency', label: 'Häufigkeit', type: 'text', group: 'Organisation', placeholder: 'täglich, monatlich …' },
  ],
};
