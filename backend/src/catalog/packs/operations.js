/** Betrieb: Überwachung, Sicherung, Auslieferung. */
export const operations = {
  id: 'operations',
  label: 'Betrieb & Automatisierung',
  description: 'Monitoring, Backup, CI/CD und wiederkehrende Aufgaben.',
  icon: 'activity',

  categories: [
    { id: 'monitoring', label: 'Monitoring / Logging', group: 'Betrieb', color: '#22d3ee', icon: 'activity' },
    { id: 'backup', label: 'Backup', group: 'Betrieb', color: '#d97706', icon: 'archive' },
    { id: 'file-share', label: 'Dateien / Sync', group: 'Betrieb', color: '#06b6d4', icon: 'share-2' },
    { id: 'ci-runner', label: 'CI/CD Runner', group: 'Betrieb', color: '#f97316', icon: 'workflow' },
    { id: 'git-repo', label: 'Git / GitOps', group: 'Betrieb', color: '#f05032', icon: 'git-branch' },
    { id: 'automation', label: 'Automatisierung / Cronjob', group: 'Betrieb', color: '#a3e635', icon: 'zap' },
  ],

  edgeKinds: [
    { id: 'monitoring', label: 'Monitoring / Metriken', group: 'Betrieb', color: '#22d3ee' },
    { id: 'backup', label: 'Backup / Sync', group: 'Betrieb', color: '#a3e635' },
    { id: 'ci', label: 'CI/CD / Deploy', group: 'Betrieb', color: '#f97316' },
  ],

  fields: [
    { key: 'sla', label: 'SLA / Verfügbarkeit', type: 'text', group: 'Betrieb', placeholder: '99,9 % · Mo–Fr 8–18 Uhr' },
  ],
};
