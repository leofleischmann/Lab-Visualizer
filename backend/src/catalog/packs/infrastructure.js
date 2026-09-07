/** Server, Virtualisierung und Container-Betrieb. */
export const infrastructure = {
  id: 'infrastructure',
  label: 'Infrastructure & virtualization',
  description: 'Hosts, VMs, containers and physical devices.',
  icon: 'server',

  categories: [
    // Kategorien beschreiben die BAUART, nicht das Produkt: ein Proxmox-, ESXi-,
    // Hyper-V- oder XCP-ng-Host ist derselbe `hypervisor` mit anderem `platform`.
    { id: 'hypervisor', label: 'Hypervisor / virt host', group: 'Infrastructure', color: '#e07b39', icon: 'server' },
    { id: 'vm', label: 'Virtual machine', group: 'Infrastructure', color: '#eab308', icon: 'monitor' },
    { id: 'system-container', label: 'System container', group: 'Infrastructure', color: '#f59e0b', icon: 'box' },
    { id: 'physical-device', label: 'Physical device', group: 'Infrastructure', color: '#94a3b8', icon: 'cpu' },
    { id: 'vps', label: 'VPS / root server', group: 'Infrastructure', color: '#10b981', icon: 'server-cog' },
    { id: 'docker-stack', label: 'Container stack', group: 'Containers', color: '#38bdf8', icon: 'layers' },
    { id: 'docker-container', label: 'App container', group: 'Containers', color: '#7dd3fc', icon: 'container' },
  ],

  edgeKinds: [{ id: 'ssh', label: 'SSH / management', group: 'Infrastructure', color: '#fb7185' }],

  fields: [
    { key: 'os', label: 'Operating system', type: 'text', group: 'System', wide: true, placeholder: 'Debian 12' },
    { key: 'cpu', label: 'CPU cores', type: 'number', group: 'System' },
    { key: 'ram', label: 'Memory', type: 'number', group: 'System', unit: 'GB' },
    { key: 'disk', label: 'Disk', type: 'number', group: 'System', unit: 'GB' },
  ],
};
