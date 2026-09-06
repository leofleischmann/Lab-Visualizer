/** Server, Virtualisierung und Container-Betrieb. */
export const infrastructure = {
  id: 'infrastructure',
  label: 'Infrastruktur & Virtualisierung',
  description: 'Hosts, VMs, Container und physische Geräte.',
  icon: 'server',

  categories: [
    // Kategorien beschreiben die BAUART, nicht das Produkt: ein Proxmox-, ESXi-,
    // Hyper-V- oder XCP-ng-Host ist derselbe `hypervisor` mit anderem `platform`.
    { id: 'hypervisor', label: 'Hypervisor / Virt-Host', group: 'Infrastruktur', color: '#e07b39', icon: 'server' },
    { id: 'vm', label: 'Virtuelle Maschine', group: 'Infrastruktur', color: '#eab308', icon: 'monitor' },
    { id: 'system-container', label: 'System-Container', group: 'Infrastruktur', color: '#f59e0b', icon: 'box' },
    { id: 'physical-device', label: 'Physisches Gerät', group: 'Infrastruktur', color: '#94a3b8', icon: 'cpu' },
    { id: 'vps', label: 'VPS / Root-Server', group: 'Infrastruktur', color: '#10b981', icon: 'server-cog' },
    { id: 'docker-stack', label: 'Container-Stack', group: 'Container', color: '#38bdf8', icon: 'layers' },
    { id: 'docker-container', label: 'App-Container', group: 'Container', color: '#7dd3fc', icon: 'container' },
  ],

  edgeKinds: [{ id: 'ssh', label: 'SSH / Verwaltung', group: 'Infrastruktur', color: '#fb7185' }],

  fields: [
    { key: 'os', label: 'Betriebssystem', type: 'text', group: 'System', wide: true, placeholder: 'Debian 12' },
    { key: 'cpu', label: 'CPU-Kerne', type: 'number', group: 'System' },
    { key: 'ram', label: 'Arbeitsspeicher', type: 'number', group: 'System', unit: 'GB' },
    { key: 'disk', label: 'Speicher', type: 'number', group: 'System', unit: 'GB' },
  ],
};
