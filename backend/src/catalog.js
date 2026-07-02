/**
 * Zentraler Katalog: vordefinierte Node-Kategorien, Status und Verbindungsarten.
 * Kategorien sind bewusst nicht hart erzwungen (beliebige Strings erlaubt),
 * damit das Datenmodell flexibel bleibt — der Katalog dient UI & API als Referenz.
 * Neue Kategorie = ein Eintrag hier (Frontend rendert unbekannte Icons mit Fallback).
 */

export const CATEGORIES = [
  // Infrastruktur
  { id: 'proxmox-host', label: 'Proxmox Host', group: 'Infrastruktur', color: '#e07b39', icon: 'server' },
  { id: 'vm', label: 'Virtuelle Maschine', group: 'Infrastruktur', color: '#eab308', icon: 'monitor' },
  { id: 'lxc', label: 'LXC Container', group: 'Infrastruktur', color: '#f59e0b', icon: 'box' },
  { id: 'physical-device', label: 'Physisches Gerät', group: 'Infrastruktur', color: '#94a3b8', icon: 'cpu' },
  { id: 'router', label: 'Router / Gateway', group: 'Infrastruktur', color: '#a3a3a3', icon: 'router' },
  { id: 'vps', label: 'VPS / Cloud-Server', group: 'Infrastruktur', color: '#10b981', icon: 'server-cog' },
  // Dienste
  { id: 'docker-stack', label: 'Docker Stack', group: 'Dienste', color: '#38bdf8', icon: 'layers' },
  { id: 'docker-container', label: 'Docker Container', group: 'Dienste', color: '#7dd3fc', icon: 'container' },
  { id: 'native-service', label: 'Nativer Dienst', group: 'Dienste', color: '#4ade80', icon: 'terminal' },
  { id: 'database', label: 'Datenbank', group: 'Dienste', color: '#f472b6', icon: 'database' },
  { id: 'web-app', label: 'Web-App / Website', group: 'Dienste', color: '#a78bfa', icon: 'app-window' },
  { id: 'monitoring', label: 'Monitoring / Logging', group: 'Dienste', color: '#22d3ee', icon: 'activity' },
  { id: 'media', label: 'Medien / Streaming', group: 'Dienste', color: '#c084fc', icon: 'film' },
  { id: 'game-server', label: 'Game-Server', group: 'Dienste', color: '#8b5cf6', icon: 'gamepad-2' },
  { id: 'ai-service', label: 'KI / LLM-Dienst', group: 'Dienste', color: '#ec4899', icon: 'brain' },
  // Netzwerk & Routing
  { id: 'reverse-proxy', label: 'Reverse Proxy', group: 'Netzwerk', color: '#2dd4bf', icon: 'arrow-left-right' },
  { id: 'tunnel', label: 'Tunnel', group: 'Netzwerk', color: '#f6821f', icon: 'cable' },
  { id: 'vpn', label: 'VPN', group: 'Netzwerk', color: '#818cf8', icon: 'lock' },
  { id: 'dns', label: 'DNS / DHCP', group: 'Netzwerk', color: '#60a5fa', icon: 'network' },
  { id: 'wifi-ap', label: 'Switch / Access Point', group: 'Netzwerk', color: '#0ea5e9', icon: 'wifi' },
  // Security
  { id: 'firewall', label: 'Firewall / WAF', group: 'Security', color: '#ef4444', icon: 'shield' },
  { id: 'ids', label: 'IDS / IPS', group: 'Security', color: '#f87171', icon: 'shield-alert' },
  { id: 'auth', label: 'Auth / SSO / Zero Trust', group: 'Security', color: '#f43f5e', icon: 'fingerprint' },
  { id: 'secrets', label: 'Secrets / Passwort-Manager', group: 'Security', color: '#d946ef', icon: 'key-round' },
  { id: 'certificate', label: 'Zertifikate / TLS', group: 'Security', color: '#84cc16', icon: 'shield-check' },
  // CI/CD & Automatisierung
  { id: 'ci-runner', label: 'CI/CD Runner', group: 'CI/CD & Automatisierung', color: '#f97316', icon: 'workflow' },
  { id: 'git-repo', label: 'Git / GitOps', group: 'CI/CD & Automatisierung', color: '#f05032', icon: 'git-branch' },
  { id: 'automation', label: 'Automatisierung / Cronjob', group: 'CI/CD & Automatisierung', color: '#a3e635', icon: 'zap' },
  // Storage & Backup
  { id: 'storage', label: 'NAS / Storage', group: 'Storage & Backup', color: '#14b8a6', icon: 'hard-drive' },
  { id: 'backup', label: 'Backup', group: 'Storage & Backup', color: '#d97706', icon: 'archive' },
  { id: 'file-share', label: 'Dateien / Sync', group: 'Storage & Backup', color: '#06b6d4', icon: 'share-2' },
  // Smart Home & IoT
  { id: 'smart-home', label: 'Smart Home Hub', group: 'Smart Home & IoT', color: '#41bdf5', icon: 'home' },
  { id: 'iot-device', label: 'IoT-Gerät', group: 'Smart Home & IoT', color: '#fbbf24', icon: 'lightbulb' },
  // Extern
  { id: 'cloud-service', label: 'Cloud-Dienst', group: 'Extern', color: '#fb923c', icon: 'cloud' },
  { id: 'email', label: 'E-Mail-Dienst', group: 'Extern', color: '#e879f9', icon: 'mail' },
  { id: 'domain', label: 'Domain / DNS-Zone', group: 'Extern', color: '#93c5fd', icon: 'at-sign' },
  { id: 'notification', label: 'Benachrichtigungen', group: 'Extern', color: '#facc15', icon: 'bell' },
  { id: 'client', label: 'Client / Benutzer', group: 'Extern', color: '#e2e8f0', icon: 'users' },
  { id: 'internet', label: 'Internet / WAN', group: 'Extern', color: '#64748b', icon: 'globe' },
  // Sonstiges
  { id: 'group', label: 'Gruppe / Zone', group: 'Sonstiges', color: '#64748b', icon: 'folder' },
  { id: 'generic', label: 'Allgemein', group: 'Sonstiges', color: '#9ca3af', icon: 'shapes' },
];

export const STATUSES = [
  { id: 'running', label: 'Läuft', color: '#22c55e' },
  { id: 'stopped', label: 'Gestoppt', color: '#64748b' },
  { id: 'planned', label: 'Geplant', color: '#38bdf8' },
  { id: 'maintenance', label: 'Wartung', color: '#a78bfa' },
  { id: 'error', label: 'Fehler', color: '#ef4444' },
  { id: 'unknown', label: 'Unbekannt', color: '#d97706' },
];

export const EDGE_KINDS = [
  { id: 'http', label: 'HTTP', color: '#60a5fa' },
  { id: 'https', label: 'HTTPS', color: '#34d399' },
  { id: 'tcp', label: 'TCP', color: '#94a3b8' },
  { id: 'udp', label: 'UDP', color: '#c084fc' },
  { id: 'ssh', label: 'SSH', color: '#fb7185' },
  { id: 'tunnel', label: 'Tunnel', color: '#f6821f' },
  { id: 'vpn', label: 'VPN / WireGuard', color: '#818cf8' },
  { id: 'dns', label: 'DNS', color: '#fbbf24' },
  { id: 'mail', label: 'E-Mail / SMTP', color: '#e879f9' },
  { id: 'monitoring', label: 'Monitoring / Metriken', color: '#22d3ee' },
  { id: 'backup', label: 'Backup / Sync', color: '#a3e635' },
  { id: 'ci', label: 'CI/CD / Deploy', color: '#f97316' },
  { id: 'dependency', label: 'Abhängigkeit', color: '#f472b6' },
  { id: 'generic', label: 'Allgemein', color: '#9ca3af' },
];

export const STATUS_IDS = STATUSES.map((s) => s.id);
export const LINE_STYLES = ['solid', 'dashed', 'dotted'];
