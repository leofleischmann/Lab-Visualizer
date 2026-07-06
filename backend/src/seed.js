/**
 * Beispiel-Projekt für einen NEU registrierten Nutzer: eine nach Best Practice
 * strukturierte Homelab-Infrastruktur mit mehreren Ebenen (Drill-down). So startet
 * jeder Account mit einem sinnvollen Beispiel statt einer leeren Canvas.
 *
 * Wird bei der Registrierung genau einmal pro Nutzer angelegt und gehört diesem
 * Nutzer (Besitz wird über project.user_id vererbt).
 */
import * as store from './store.js';

export function seedExampleForUser(db, userId) {
  const project = store.createProject(db, userId, {
    name: 'Homelab (Beispiel)',
    color: '#38bdf8',
    icon: 'boxes',
  });
  const root = store
    .listViews(db, userId, { projectId: project.id })
    .find((v) => v.parentId === null);

  // Beispiel-IDs müssen pro Nutzer eindeutig sein (mehrere Accounts, gleiches
  // Beispiel). Deterministisch aus der global eindeutigen Projekt-ID abgeleitet.
  const nid = (key) => `ex-${project.id.slice(0, 8)}-${key}`;

  // Zwei Detailebenen für den Drill-down (Ebene 2 unter Übersicht, Ebene 3 darunter).
  const l2 = store.createView(db, userId, {
    projectId: project.id,
    name: 'Proxmox-Server (intern)',
    parentId: root.id,
    description: 'Dienste und interne Verbindungen auf dem Proxmox-Host.',
  });
  const l3 = store.createView(db, userId, {
    projectId: project.id,
    name: 'nginx Routing',
    parentId: l2.id,
    description: 'Reverse-Proxy-Routing: welche Domain auf welchen Upstream zeigt.',
  });

  // status defaulten: store.createNode wendet (anders als die Routen) keine
  // Zod-Defaults an, daher hier einen gültigen Standard für status-lose Nodes (Zonen) setzen.
  const node = (data) => store.createNode(db, userId, { status: 'unknown', ...data });
  const edge = (s, t, viewId, o = {}) =>
    store.createEdge(db, userId, { sourceId: nid(s), targetId: nid(t), viewId, ...o });

  // ── Ebene 1: Übersicht (Datenfluss Internet → Homelab) ──
  node({ id: nid('internet'), name: 'Internet', category: 'internet', status: 'running', viewId: root.id, position: { x: 420, y: 40 } });
  node({ id: nid('domain'), name: 'example.com', category: 'domain', status: 'running', viewId: root.id, position: { x: 120, y: 220 } });
  node({ id: nid('cloudflare'), name: 'Cloudflare', category: 'cloud-service', status: 'running', viewId: root.id, position: { x: 420, y: 220 }, ip: '104.16.0.1' });
  node({ id: nid('router'), name: 'OPNsense Router', category: 'router', status: 'running', viewId: root.id, position: { x: 420, y: 400 }, ip: '192.168.1.1' });
  node({
    id: nid('proxmox'), name: 'Proxmox Host', category: 'proxmox-host', status: 'running', viewId: root.id,
    linkedViewId: l2.id, position: { x: 300, y: 600 }, ip: '192.168.1.10', hostname: 'pve.lan',
    notes: '**Doppelklick** öffnet die Detailebene mit den internen Diensten.',
  });
  node({ id: nid('nas'), name: 'TrueNAS', category: 'storage', status: 'running', viewId: root.id, position: { x: 660, y: 600 }, ip: '192.168.1.20' });
  edge('domain', 'cloudflare', root.id, { kind: 'dns', label: 'DNS' });
  edge('internet', 'cloudflare', root.id, { kind: 'https', label: 'HTTPS :443' });
  edge('cloudflare', 'router', root.id, { kind: 'tunnel', label: 'cloudflared Tunnel', animated: true });
  edge('router', 'proxmox', root.id, { kind: 'http', label: 'Portfreigabe :443' });
  edge('proxmox', 'nas', root.id, { kind: 'backup', label: 'NFS / Backup', lineStyle: 'dashed' });

  // ── Ebene 2: Proxmox intern (Zone „Proxmox" mit Diensten) ──
  node({ id: nid('zone'), name: 'Proxmox', category: 'group', viewId: l2.id, position: { x: 40, y: 40 }, width: 940, height: 520 });
  const inZone = (o) => node({ ...o, viewId: l2.id, parentId: nid('zone') });
  inZone({ id: nid('nginx'), name: 'nginx Proxy', category: 'reverse-proxy', status: 'running', linkedViewId: l3.id, position: { x: 40, y: 70 }, ip: '192.168.1.30', notes: '**Doppelklick** zeigt das Routing.' });
  inZone({ id: nid('authelia'), name: 'Authelia (SSO)', category: 'auth', status: 'running', position: { x: 40, y: 250 } });
  inZone({ id: nid('gitea'), name: 'Gitea', category: 'git-repo', status: 'running', position: { x: 380, y: 40 }, ip: '192.168.1.31' });
  inZone({ id: nid('nextcloud'), name: 'Nextcloud', category: 'web-app', status: 'running', position: { x: 380, y: 190 }, ip: '192.168.1.32' });
  inZone({ id: nid('grafana'), name: 'Grafana', category: 'monitoring', status: 'maintenance', position: { x: 380, y: 340 } });
  inZone({ id: nid('postgres'), name: 'PostgreSQL', category: 'database', status: 'running', position: { x: 720, y: 70 }, ip: '192.168.1.40' });
  inZone({ id: nid('redis'), name: 'Redis', category: 'database', status: 'running', position: { x: 720, y: 300 } });
  edge('nginx', 'gitea', l2.id, { kind: 'http', label: 'git.example.com' });
  edge('nginx', 'nextcloud', l2.id, { kind: 'http', label: 'cloud.example.com' });
  edge('nginx', 'grafana', l2.id, { kind: 'http', label: 'stats.example.com' });
  edge('authelia', 'nextcloud', l2.id, { kind: 'dependency', label: 'SSO', lineStyle: 'dashed' });
  edge('authelia', 'gitea', l2.id, { kind: 'dependency', label: 'SSO', lineStyle: 'dashed' });
  edge('gitea', 'postgres', l2.id, { kind: 'tcp', label: ':5432' });
  edge('nextcloud', 'postgres', l2.id, { kind: 'tcp', label: ':5432' });
  edge('nextcloud', 'redis', l2.id, { kind: 'tcp', label: ':6379' });
  edge('authelia', 'redis', l2.id, { kind: 'tcp', label: ':6379' });

  // ── Ebene 3: nginx Routing (Upstreams pro Domain) ──
  node({ id: nid('nginx3'), name: 'nginx', category: 'reverse-proxy', status: 'running', viewId: l3.id, position: { x: 360, y: 40 } });
  node({ id: nid('up-gitea'), name: 'Gitea', category: 'git-repo', status: 'running', viewId: l3.id, position: { x: 120, y: 280 }, notes: 'Upstream :3000' });
  node({ id: nid('up-cloud'), name: 'Nextcloud', category: 'web-app', status: 'running', viewId: l3.id, position: { x: 360, y: 280 }, notes: 'Upstream :8080' });
  node({ id: nid('up-graf'), name: 'Grafana', category: 'monitoring', status: 'running', viewId: l3.id, position: { x: 600, y: 280 }, notes: 'Upstream :3000' });
  edge('nginx3', 'up-gitea', l3.id, { kind: 'http', label: 'git.example.com → :3000' });
  edge('nginx3', 'up-cloud', l3.id, { kind: 'http', label: 'cloud.example.com → :8080' });
  edge('nginx3', 'up-graf', l3.id, { kind: 'http', label: 'stats.example.com → :3000' });

  return project;
}
