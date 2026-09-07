/** Betrieb: Überwachung, Sicherung, Auslieferung. */
export const operations = {
  id: 'operations',
  label: 'Operations & automation',
  description: 'Monitoring, backup, CI/CD and recurring tasks.',
  icon: 'activity',

  categories: [
    { id: 'monitoring', label: 'Monitoring / logging', group: 'Operations', color: '#22d3ee', icon: 'activity' },
    { id: 'backup', label: 'Backup', group: 'Operations', color: '#d97706', icon: 'archive' },
    { id: 'file-share', label: 'Files / sync', group: 'Operations', color: '#06b6d4', icon: 'share-2' },
    { id: 'ci-runner', label: 'CI/CD runner', group: 'Operations', color: '#f97316', icon: 'workflow' },
    { id: 'git-repo', label: 'Git / GitOps', group: 'Operations', color: '#f05032', icon: 'git-branch' },
    { id: 'automation', label: 'Automation / cron job', group: 'Operations', color: '#a3e635', icon: 'zap' },
  ],

  edgeKinds: [
    { id: 'monitoring', label: 'Monitoring / metrics', group: 'Operations', color: '#22d3ee' },
    { id: 'backup', label: 'Backup / sync', group: 'Operations', color: '#a3e635' },
    { id: 'ci', label: 'CI/CD / deploy', group: 'Operations', color: '#f97316' },
  ],

  fields: [
    { key: 'sla', label: 'SLA / availability', type: 'text', group: 'Operations', placeholder: '99.9 % - Mon-Fri 8-18' },
  ],
};
