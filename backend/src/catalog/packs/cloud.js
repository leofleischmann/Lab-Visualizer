/**
 * Cloud-Ressourcen, anbieterneutral formuliert. AWS, Azure, GCP und Hetzner
 * unterscheiden sich im Feld `platform`, nicht in der Kategorie.
 */
export const cloud = {
  id: 'cloud',
  label: 'Cloud',
  description: 'Regions, networks, managed services, object storage, serverless.',
  icon: 'cloud',

  categories: [
    { id: 'cloud-region', label: 'Region / availability zone', group: 'Cloud', color: '#fb923c', icon: 'globe' },
    { id: 'cloud-network', label: 'VPC / virtual network', group: 'Cloud', color: '#38bdf8', icon: 'network' },
    { id: 'managed-service', label: 'Managed Service', group: 'Cloud', color: '#22d3ee', icon: 'cloud-cog' },
    { id: 'object-storage', label: 'Object storage / bucket', group: 'Cloud', color: '#14b8a6', icon: 'package' },
    { id: 'serverless', label: 'Serverless / function', group: 'Cloud', color: '#facc15', icon: 'zap' },
    { id: 'load-balancer', label: 'Load Balancer', group: 'Cloud', color: '#2dd4bf', icon: 'split' },
  ],

  edgeKinds: [],

  fields: [
    { key: 'region', label: 'Region', type: 'text', group: 'Cloud', mono: true, showOnNode: true, placeholder: 'eu-central-1' },
    { key: 'accountId', label: 'Account / Subscription', type: 'text', group: 'Cloud', mono: true },
    { key: 'resourceId', label: 'Resource ID / ARN', type: 'text', group: 'Cloud', mono: true, wide: true },
    // Bewusst Text statt Zahl: die Währung gehört zum Wert und ist je nach
    // Anbieter und Land verschieden.
    { key: 'cost', label: 'Cost / month', type: 'text', group: 'Cloud', placeholder: '120 EUR' },
  ],
};
