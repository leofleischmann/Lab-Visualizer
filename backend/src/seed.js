/**
 * Beispiel-Projekt für den ERSTEN Programmstart: eine nach Best Practice
 * strukturierte Homelab-Infrastruktur mit mehreren Ebenen (Drill-down).
 *
 * - Wird über das `meta.seeded`-Flag genau EINMAL angelegt (nach „Alles löschen"
 *   oder einem leeren Projekt kommt es nicht zurück).
 * - Wird nur angelegt, wenn die DB frei von Nodes/Edges ist (kein Überschreiben
 *   von Nutzerdaten).
 * - Nur der echte Server (server.js) seedet; Tests nutzen createApp direkt und
 *   bleiben dadurch unberührt.
 */
import { getMeta, setMeta } from './db.js';
import * as store from './store.js';

export function maybeSeedExample(db) {
  if (getMeta(db, 'seeded') === '1') return false;

  const nodeCount = db.prepare('SELECT count(*) AS c FROM nodes').get().c;
  const edgeCount = db.prepare('SELECT count(*) AS c FROM edges').get().c;
  if (nodeCount > 0 || edgeCount > 0) {
    // Bereits Nutzerdaten vorhanden: nichts anlegen, aber als „geseedet" markieren,
    // damit spätere Starts nicht erneut prüfen bzw. seeden.
    setMeta(db, 'seeded', '1');
    return false;
  }

  // Alles-oder-nichts: erst bei erfolgreichem Seed das Flag setzen. Schlägt der
  // Seed fehl, bleibt die DB unangetastet und der Start bricht sichtbar ab.
  db.transaction(() => {
    seedExample(db);
    setMeta(db, 'seeded', '1');
  })();
  return true;
}

function seedExample(db) {
  // Leeres Default-Projekt (falls durch die Migration angelegt) verwerfen.
  db.prepare('DELETE FROM projects').run();

  const project = store.createProject(db, {
    id: 'beispiel-homelab',
    name: 'Homelab (Beispiel)',
    color: '#38bdf8',
    icon: 'boxes',
  });
  const root = store
    .listViews(db, { projectId: project.id })
    .find((v) => v.parentId === null);

  // Zwei Detailebenen für den Drill-down (Ebene 2 unter Übersicht, Ebene 3 darunter).
  const l2 = store.createView(db, {
    projectId: project.id,
    name: 'Proxmox-Server (intern)',
    parentId: root.id,
    description: 'Dienste und interne Verbindungen auf dem Proxmox-Host.',
  });
  const l3 = store.createView(db, {
    projectId: project.id,
    name: 'nginx Routing',
    parentId: l2.id,
    description: 'Reverse-Proxy-Routing: welche Domain auf welchen Upstream zeigt.',
  });

  // status defaulten: store.createNode wendet (anders als die Routen) keine
  // Zod-Defaults an, daher hier einen gültigen Standard für status-lose Nodes (Zonen) setzen.
  const node = (data) => store.createNode(db, { status: 'unknown', ...data });
  const edge = (data) => store.createEdge(db, data);

  // ── Ebene 1: Übersicht (Datenfluss Internet → Homelab) ──
  node({ id: 'ex-internet', name: 'Internet', category: 'internet', status: 'running', viewId: root.id, position: { x: 420, y: 40 } });
  node({ id: 'ex-domain', name: 'example.com', category: 'domain', status: 'running', viewId: root.id, position: { x: 120, y: 220 } });
  node({ id: 'ex-cloudflare', name: 'Cloudflare', category: 'cloud-service', status: 'running', viewId: root.id, position: { x: 420, y: 220 }, ip: '104.16.0.1' });
  node({ id: 'ex-router', name: 'OPNsense Router', category: 'router', status: 'running', viewId: root.id, position: { x: 420, y: 400 }, ip: '192.168.1.1' });
  node({
    id: 'ex-proxmox', name: 'Proxmox Host', category: 'proxmox-host', status: 'running', viewId: root.id,
    linkedViewId: l2.id, position: { x: 300, y: 600 }, ip: '192.168.1.10', hostname: 'pve.lan',
    notes: '**Doppelklick** öffnet die Detailebene mit den internen Diensten.',
  });
  node({ id: 'ex-nas', name: 'TrueNAS', category: 'storage', status: 'running', viewId: root.id, position: { x: 660, y: 600 }, ip: '192.168.1.20' });
  edge({ id: 'ex-e1', sourceId: 'ex-domain', targetId: 'ex-cloudflare', viewId: root.id, kind: 'dns', label: 'DNS' });
  edge({ id: 'ex-e2', sourceId: 'ex-internet', targetId: 'ex-cloudflare', viewId: root.id, kind: 'https', label: 'HTTPS :443' });
  edge({ id: 'ex-e3', sourceId: 'ex-cloudflare', targetId: 'ex-router', viewId: root.id, kind: 'tunnel', label: 'cloudflared Tunnel', animated: true });
  edge({ id: 'ex-e4', sourceId: 'ex-router', targetId: 'ex-proxmox', viewId: root.id, kind: 'http', label: 'Portfreigabe :443' });
  edge({ id: 'ex-e5', sourceId: 'ex-proxmox', targetId: 'ex-nas', viewId: root.id, kind: 'backup', label: 'NFS / Backup', lineStyle: 'dashed' });

  // ── Ebene 2: Proxmox intern (Zone „Proxmox" mit Diensten) ──
  node({ id: 'ex-zone', name: 'Proxmox', category: 'group', viewId: l2.id, position: { x: 40, y: 40 }, width: 940, height: 520 });
  const inZone = (o) => node({ ...o, viewId: l2.id, parentId: 'ex-zone' });
  inZone({ id: 'ex-nginx', name: 'nginx Proxy', category: 'reverse-proxy', status: 'running', linkedViewId: l3.id, position: { x: 40, y: 70 }, ip: '192.168.1.30', notes: '**Doppelklick** zeigt das Routing.' });
  inZone({ id: 'ex-authelia', name: 'Authelia (SSO)', category: 'auth', status: 'running', position: { x: 40, y: 250 } });
  inZone({ id: 'ex-gitea', name: 'Gitea', category: 'git-repo', status: 'running', position: { x: 380, y: 40 }, ip: '192.168.1.31' });
  inZone({ id: 'ex-nextcloud', name: 'Nextcloud', category: 'web-app', status: 'running', position: { x: 380, y: 190 }, ip: '192.168.1.32' });
  inZone({ id: 'ex-grafana', name: 'Grafana', category: 'monitoring', status: 'maintenance', position: { x: 380, y: 340 } });
  inZone({ id: 'ex-postgres', name: 'PostgreSQL', category: 'database', status: 'running', position: { x: 720, y: 70 }, ip: '192.168.1.40' });
  inZone({ id: 'ex-redis', name: 'Redis', category: 'database', status: 'running', position: { x: 720, y: 300 } });
  const e2 = (id, s, t, o = {}) => edge({ id, sourceId: s, targetId: t, viewId: l2.id, ...o });
  e2('ex-e10', 'ex-nginx', 'ex-gitea', { kind: 'http', label: 'git.example.com' });
  e2('ex-e11', 'ex-nginx', 'ex-nextcloud', { kind: 'http', label: 'cloud.example.com' });
  e2('ex-e12', 'ex-nginx', 'ex-grafana', { kind: 'http', label: 'stats.example.com' });
  e2('ex-e13', 'ex-authelia', 'ex-nextcloud', { kind: 'dependency', label: 'SSO', lineStyle: 'dashed' });
  e2('ex-e14', 'ex-authelia', 'ex-gitea', { kind: 'dependency', label: 'SSO', lineStyle: 'dashed' });
  e2('ex-e15', 'ex-gitea', 'ex-postgres', { kind: 'tcp', label: ':5432' });
  e2('ex-e16', 'ex-nextcloud', 'ex-postgres', { kind: 'tcp', label: ':5432' });
  e2('ex-e17', 'ex-nextcloud', 'ex-redis', { kind: 'tcp', label: ':6379' });
  e2('ex-e18', 'ex-authelia', 'ex-redis', { kind: 'tcp', label: ':6379' });

  // ── Ebene 3: nginx Routing (Upstreams pro Domain) ──
  node({ id: 'ex-nginx3', name: 'nginx', category: 'reverse-proxy', status: 'running', viewId: l3.id, position: { x: 360, y: 40 } });
  node({ id: 'ex-up-gitea', name: 'Gitea', category: 'git-repo', status: 'running', viewId: l3.id, position: { x: 120, y: 280 }, notes: 'Upstream :3000' });
  node({ id: 'ex-up-cloud', name: 'Nextcloud', category: 'web-app', status: 'running', viewId: l3.id, position: { x: 360, y: 280 }, notes: 'Upstream :8080' });
  node({ id: 'ex-up-graf', name: 'Grafana', category: 'monitoring', status: 'running', viewId: l3.id, position: { x: 600, y: 280 }, notes: 'Upstream :3000' });
  edge({ id: 'ex-e20', sourceId: 'ex-nginx3', targetId: 'ex-up-gitea', viewId: l3.id, kind: 'http', label: 'git.example.com → :3000' });
  edge({ id: 'ex-e21', sourceId: 'ex-nginx3', targetId: 'ex-up-cloud', viewId: l3.id, kind: 'http', label: 'cloud.example.com → :8080' });
  edge({ id: 'ex-e22', sourceId: 'ex-nginx3', targetId: 'ex-up-graf', viewId: l3.id, kind: 'http', label: 'stats.example.com → :3000' });
}
