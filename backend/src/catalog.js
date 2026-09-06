/**
 * Zentraler Katalog: Node-Kategorien, Status, Verbindungsarten und Felddefinitionen.
 *
 * Bewusst domänenneutral gehalten: Der Katalog beschreibt allgemeine Bausteine von
 * Systemlandschaften (Hypervisor, Container, Dienst, Datenbank, ...) und nennt keine
 * konkreten Produkte. Ein Produkt wie "Proxmox VE", "AWS" oder "Kubernetes" ist ein
 * WERT im Feld `platform`, keine eigene Kategorie — sonst müsste der Katalog jeden
 * Hersteller kennen.
 *
 * Kategorien und Verbindungsarten sind nicht hart erzwungen (beliebige Strings
 * erlaubt), damit das Datenmodell flexibel bleibt — der Katalog dient UI & API als
 * Referenz. Neue Kategorie = ein Eintrag hier (Frontend rendert unbekannte Icons
 * mit Fallback).
 *
 * Beeinflusst: backend/src/validation.js (Status-Enum, Feld-Validierung),
 * backend/src/routes/meta.js (/api/meta/catalog), frontend/src/lib/catalog.ts,
 * frontend/src/components/Palette.tsx, panel/NodePanel.tsx, canvas/InfraNode.tsx.
 * Icons müssen in frontend/src/lib/catalog.ts im ICONS-Mapping existieren.
 */

export const CATEGORIES = [
  // Infrastruktur
  { id: 'hypervisor', label: 'Hypervisor / Virt-Host', group: 'Infrastruktur', color: '#e07b39', icon: 'server' },
  { id: 'vm', label: 'Virtuelle Maschine', group: 'Infrastruktur', color: '#eab308', icon: 'monitor' },
  { id: 'system-container', label: 'System-Container', group: 'Infrastruktur', color: '#f59e0b', icon: 'box' },
  { id: 'physical-device', label: 'Physisches Gerät', group: 'Infrastruktur', color: '#94a3b8', icon: 'cpu' },
  { id: 'router', label: 'Router / Gateway', group: 'Infrastruktur', color: '#a3a3a3', icon: 'router' },
  { id: 'vps', label: 'VPS / Cloud-Server', group: 'Infrastruktur', color: '#10b981', icon: 'server-cog' },
  // Dienste
  { id: 'docker-stack', label: 'Container-Stack', group: 'Dienste', color: '#38bdf8', icon: 'layers' },
  { id: 'docker-container', label: 'App-Container', group: 'Dienste', color: '#7dd3fc', icon: 'container' },
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

/**
 * Status sind bewusst allgemein formuliert ("Aktiv" statt "Läuft"), damit sie auch
 * für Nicht-Server-Setups (Prozesse, Fachsysteme, geplante Komponenten) passen.
 * Anders als Kategorien sind Status ein geschlossenes Enum (siehe validation.js).
 */
export const STATUSES = [
  { id: 'active', label: 'Aktiv', color: '#22c55e' },
  { id: 'inactive', label: 'Inaktiv', color: '#64748b' },
  { id: 'planned', label: 'Geplant', color: '#38bdf8' },
  { id: 'maintenance', label: 'Wartung', color: '#a78bfa' },
  { id: 'error', label: 'Fehler / Störung', color: '#ef4444' },
  { id: 'unknown', label: 'Unbekannt', color: '#d97706' },
];

/**
 * Verbindungsarten. Die Gruppe "Allgemein" beschreibt Beziehungen unabhängig von
 * der Technik (Abhängigkeit, Datenfluss, Steuerung) und trägt damit auch
 * Architektur-, Prozess- und Organisationsdiagramme; "Netzwerk" und "Betrieb"
 * ergänzen die technischen Protokolle.
 */
export const EDGE_KINDS = [
  // Allgemein — domänenneutrale Beziehungen
  { id: 'generic', label: 'Allgemein', group: 'Allgemein', color: '#9ca3af' },
  { id: 'dependency', label: 'Abhängigkeit', group: 'Allgemein', color: '#f472b6' },
  { id: 'data-flow', label: 'Datenfluss', group: 'Allgemein', color: '#38bdf8' },
  { id: 'control', label: 'Steuerung', group: 'Allgemein', color: '#fbbf24' },
  { id: 'api', label: 'API-Aufruf', group: 'Allgemein', color: '#a78bfa' },
  // Netzwerk — konkrete Protokolle
  { id: 'http', label: 'HTTP', group: 'Netzwerk', color: '#60a5fa' },
  { id: 'https', label: 'HTTPS', group: 'Netzwerk', color: '#34d399' },
  { id: 'tcp', label: 'TCP', group: 'Netzwerk', color: '#94a3b8' },
  { id: 'udp', label: 'UDP', group: 'Netzwerk', color: '#c084fc' },
  { id: 'ssh', label: 'SSH', group: 'Netzwerk', color: '#fb7185' },
  { id: 'tunnel', label: 'Tunnel', group: 'Netzwerk', color: '#f6821f' },
  { id: 'vpn', label: 'VPN / WireGuard', group: 'Netzwerk', color: '#818cf8' },
  { id: 'dns', label: 'DNS', group: 'Netzwerk', color: '#fbbf24' },
  { id: 'mail', label: 'E-Mail / SMTP', group: 'Netzwerk', color: '#e879f9' },
  // Betrieb
  { id: 'monitoring', label: 'Monitoring / Metriken', group: 'Betrieb', color: '#22d3ee' },
  { id: 'backup', label: 'Backup / Sync', group: 'Betrieb', color: '#a3e635' },
  { id: 'ci', label: 'CI/CD / Deploy', group: 'Betrieb', color: '#f97316' },
];

/**
 * Felddefinitionen für Nodes. Ersetzen die früheren festen DB-Spalten
 * (ip/vlan/os/hostname/url): Werte liegen jetzt gesammelt in `node.fields`
 * (JSON), die Struktur beschreibt ausschließlich dieser Katalog. Damit kostet
 * ein neues Feld einen Eintrag hier statt einer Schema-Änderung — und für
 * Setups ohne Netzwerkbezug bleiben die Netzwerkfelder einfach leer.
 *
 * Eigenschaften:
 *   key         Schlüssel in `node.fields` (stabil, nicht umbenennen)
 *   type        text | url | number | select | date  (steuert Eingabe & Validierung)
 *   group       Abschnitt im Deep-Dive-Panel
 *   mono        Monospace-Darstellung (IPs, Hostnamen)
 *   showOnNode  Wert wird direkt auf der Canvas unter dem Node-Namen angezeigt
 *   options     nur bei type=select: erlaubte Werte (leer bleibt immer erlaubt)
 *   unit        nur bei type=number: Einheit hinter dem Eingabefeld
 *   wide        Feld belegt im Panel die volle Breite statt einer Rasterspalte
 *
 * Beeinflusst: validation.js (Typprüfung), NodePanel.tsx (Eingabe),
 * InfraNode.tsx (showOnNode), lib/catalog.ts (Suche).
 */
export const FIELDS = [
  // Allgemein — in jeder Domäne sinnvoll
  { key: 'url', label: 'URL', type: 'url', group: 'Allgemein', mono: true, wide: true, placeholder: 'https://…' },
  { key: 'owner', label: 'Verantwortlich', type: 'text', group: 'Allgemein', placeholder: 'Team oder Person' },
  {
    key: 'environment', label: 'Umgebung', type: 'select', group: 'Allgemein',
    options: ['Produktion', 'Staging', 'Test', 'Entwicklung'],
  },
  {
    key: 'criticality', label: 'Kritikalität', type: 'select', group: 'Allgemein',
    options: ['Kritisch', 'Hoch', 'Mittel', 'Niedrig'],
  },
  // Netzwerk
  { key: 'ip', label: 'IP-Adresse', type: 'text', group: 'Netzwerk', mono: true, showOnNode: true, placeholder: '192.168.1.10' },
  { key: 'hostname', label: 'Hostname', type: 'text', group: 'Netzwerk', mono: true, showOnNode: true, placeholder: 'host.example.com' },
  { key: 'vlan', label: 'VLAN', type: 'text', group: 'Netzwerk', mono: true },
  { key: 'mac', label: 'MAC-Adresse', type: 'text', group: 'Netzwerk', mono: true, placeholder: 'aa:bb:cc:dd:ee:ff' },
  // System — Plattform statt Produktkategorie: "Proxmox VE", "AWS", "Kubernetes" …
  { key: 'platform', label: 'Plattform', type: 'text', group: 'System', wide: true, placeholder: 'Proxmox VE, AWS, Kubernetes …' },
  { key: 'os', label: 'Betriebssystem', type: 'text', group: 'System', placeholder: 'Debian 12' },
  { key: 'version', label: 'Version', type: 'text', group: 'System' },
  { key: 'cpu', label: 'CPU-Kerne', type: 'number', group: 'System' },
  { key: 'ram', label: 'Arbeitsspeicher', type: 'number', group: 'System', unit: 'GB' },
  { key: 'disk', label: 'Speicher', type: 'number', group: 'System', unit: 'GB' },
  // Betrieb
  { key: 'location', label: 'Standort / Region', type: 'text', group: 'Betrieb', wide: true, placeholder: 'Rack 2, eu-central-1 …' },
  { key: 'reviewedAt', label: 'Zuletzt geprüft', type: 'date', group: 'Betrieb' },
];

export const STATUS_IDS = STATUSES.map((s) => s.id);
export const LINE_STYLES = ['solid', 'dashed', 'dotted'];
/** Feldkatalog als Map — für die Validierung bekannter Schlüssel in `node.fields`. */
export const FIELDS_BY_KEY = new Map(FIELDS.map((f) => [f.key, f]));
