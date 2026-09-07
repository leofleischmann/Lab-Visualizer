/**
 * Prozesse und Organisation — der Nachweis, dass das Werkzeug ohne einen
 * einzigen Server auskommt: keine IP, kein Hostname, kein Betriebssystem.
 */
export const business = {
  id: 'business',
  label: 'Processes & organization',
  description: 'Process steps, decisions, roles, departments, business systems.',
  icon: 'briefcase',

  categories: [
    { id: 'process', label: 'Process', group: 'Processes', color: '#a3e635', icon: 'workflow' },
    { id: 'process-step', label: 'Process step', group: 'Processes', color: '#84cc16', icon: 'list-checks' },
    { id: 'decision', label: 'Decision', group: 'Processes', color: '#fbbf24', icon: 'git-fork' },
    { id: 'document', label: 'Document / form', group: 'Processes', color: '#93c5fd', icon: 'file-text' },
    { id: 'role', label: 'Role', group: 'Organization', color: '#e2e8f0', icon: 'user-round' },
    { id: 'department', label: 'Department / team', group: 'Organization', color: '#64748b', icon: 'building-2' },
    { id: 'business-system', label: 'Business system', group: 'Organization', color: '#c084fc', icon: 'briefcase' },
  ],

  edgeKinds: [
    { id: 'process-flow', label: 'Flow / next step', group: 'Processes', color: '#a3e635' },
    { id: 'responsibility', label: 'Responsibility', group: 'Processes', color: '#e2e8f0' },
  ],

  fields: [
    { key: 'costCenter', label: 'Cost center', type: 'text', group: 'Organization', mono: true },
    { key: 'frequency', label: 'Frequency', type: 'text', group: 'Organization', placeholder: 'daily, monthly …' },
  ],
};
