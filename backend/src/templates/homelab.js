/**
 * Homelab: der klassische Selbsthoster-Aufbau mit Drill-down über drei Ebenen.
 * Startvorlage für jedes neu registrierte Konto (siehe backend/src/seed.js).
 */
export const homelab = {
  id: 'homelab',
  label: 'Homelab',
  description: 'Internet -> Cloudflare -> router -> virt host -> NAS, with two detail levels.',
  icon: 'home',
  color: '#38bdf8',
  packs: ['infrastructure', 'network', 'security', 'operations', 'homelab'],
  footprint: { views: 3, nodes: 18 },

  build({ root, view, node, edge }) {
    const l2 = view({
      name: 'Virt host (internal)',
      description: 'Services and internal connections on the virtualization host.',
    });
    const l3 = view({
      name: 'nginx Routing',
      parentId: l2.id,
      description: 'Reverse proxy routing: which domain points to which upstream.',
    });

    // ── Ebene 1: Übersicht (Datenfluss Internet -> Homelab) ──
    node({ id: 'internet', name: 'Internet', category: 'internet', status: 'active', position: { x: 420, y: 40 } });
    node({ id: 'domain', name: 'example.com', category: 'domain', status: 'active', position: { x: 120, y: 220 } });
    node({ id: 'cloudflare', name: 'Cloudflare', category: 'cloud-service', status: 'active', position: { x: 420, y: 220 }, fields: { ip: '104.16.0.1' } });
    node({ id: 'router', name: 'Router', category: 'router', status: 'active', position: { x: 420, y: 400 }, fields: { ip: '192.168.1.1', platform: 'OPNsense' } });
    node({
      id: 'host', name: 'Virtualization host', category: 'hypervisor', status: 'active',
      linkedViewId: l2.id, position: { x: 300, y: 600 },
      // Das Produkt ist ein WERT im Feld `platform`, keine eigene Kategorie —
      // derselbe Node beschreibt so auch einen ESXi-, Hyper-V- oder XCP-ng-Host.
      fields: { ip: '192.168.1.10', hostname: 'pve.lan', platform: 'Proxmox VE', os: 'Debian 12', cpu: '8', ram: '64' },
      notes: '**Double-click** opens the detail level with the internal services.',
    });
    node({ id: 'nas', name: 'NAS', category: 'storage', status: 'active', position: { x: 660, y: 600 }, fields: { ip: '192.168.1.20', platform: 'TrueNAS SCALE', disk: '16000' } });
    edge('domain', 'cloudflare', { kind: 'dns', label: 'DNS' });
    edge('internet', 'cloudflare', { kind: 'https', label: 'HTTPS :443' });
    edge('cloudflare', 'router', { kind: 'tunnel', label: 'Tunnel', animated: true });
    edge('router', 'host', { kind: 'http', label: 'Port forward :443' });
    edge('host', 'nas', { kind: 'backup', label: 'NFS / Backup', lineStyle: 'dashed' });

    // ── Ebene 2: Host intern (Zone mit Diensten) ──
    node({ id: 'zone', name: 'Virt host', category: 'group', viewId: l2.id, position: { x: 40, y: 40 }, width: 940, height: 520 });
    const inZone = (o) => node({ ...o, viewId: l2.id, parentId: 'zone' });
    inZone({ id: 'nginx', name: 'nginx Proxy', category: 'reverse-proxy', status: 'active', linkedViewId: l3.id, position: { x: 40, y: 70 }, fields: { ip: '192.168.1.30' }, notes: '**Double-click** shows the routing.' });
    inZone({ id: 'sso', name: 'SSO / Authelia', category: 'auth', status: 'active', position: { x: 40, y: 250 } });
    inZone({ id: 'git', name: 'Gitea', category: 'git-repo', status: 'active', position: { x: 380, y: 40 }, fields: { ip: '192.168.1.31' } });
    inZone({ id: 'cloud', name: 'Nextcloud', category: 'web-app', status: 'active', position: { x: 380, y: 190 }, fields: { ip: '192.168.1.32' } });
    inZone({ id: 'grafana', name: 'Grafana', category: 'monitoring', status: 'maintenance', position: { x: 380, y: 340 } });
    inZone({ id: 'postgres', name: 'PostgreSQL', category: 'database', status: 'active', position: { x: 720, y: 70 }, fields: { ip: '192.168.1.40', platform: 'PostgreSQL 16' } });
    inZone({ id: 'redis', name: 'Redis', category: 'database', status: 'active', position: { x: 720, y: 300 } });
    edge('nginx', 'git', { kind: 'http', label: 'git.example.com' });
    edge('nginx', 'cloud', { kind: 'http', label: 'cloud.example.com' });
    edge('nginx', 'grafana', { kind: 'http', label: 'stats.example.com' });
    edge('sso', 'cloud', { kind: 'dependency', label: 'SSO', lineStyle: 'dashed' });
    edge('sso', 'git', { kind: 'dependency', label: 'SSO', lineStyle: 'dashed' });
    edge('git', 'postgres', { kind: 'tcp', label: ':5432' });
    edge('cloud', 'postgres', { kind: 'tcp', label: ':5432' });
    edge('cloud', 'redis', { kind: 'tcp', label: ':6379' });
    edge('sso', 'redis', { kind: 'tcp', label: ':6379' });

    // ── Ebene 3: nginx Routing (Upstreams pro Domain) ──
    node({ id: 'nginx3', name: 'nginx', category: 'reverse-proxy', status: 'active', viewId: l3.id, position: { x: 360, y: 40 } });
    node({ id: 'up-git', name: 'Gitea', category: 'git-repo', status: 'active', viewId: l3.id, position: { x: 120, y: 280 }, notes: 'Upstream :3000' });
    node({ id: 'up-cloud', name: 'Nextcloud', category: 'web-app', status: 'active', viewId: l3.id, position: { x: 360, y: 280 }, notes: 'Upstream :8080' });
    node({ id: 'up-graf', name: 'Grafana', category: 'monitoring', status: 'active', viewId: l3.id, position: { x: 600, y: 280 }, notes: 'Upstream :3000' });
    edge('nginx3', 'up-git', { kind: 'http', label: 'git.example.com -> :3000' });
    edge('nginx3', 'up-cloud', { kind: 'http', label: 'cloud.example.com -> :8080' });
    edge('nginx3', 'up-graf', { kind: 'http', label: 'stats.example.com -> :3000' });
  },
};
