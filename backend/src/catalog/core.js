/**
 * Kern-Katalog: immer aktiv, unabhängig von den gewählten Domain-Packs.
 *
 * Hier steht ausschliesslich, was in JEDER Domäne vorkommt — ein Datenspeicher,
 * eine Anwendung, ein Nutzer, eine Abhängigkeit. Alles Fachliche (Netzwerk,
 * Cloud, Kubernetes, Prozesse) gehört in ein Pack unter ./packs/.
 *
 * Beeinflusst: catalog/index.js (Merge-Reihenfolge: Kern zuerst, Packs können
 * ihn nicht überschreiben).
 */
export const core = {
  id: 'core',
  label: 'Kern',
  description: 'Grundbausteine, die in jedem Projekt verfügbar sind.',
  icon: 'shapes',

  categories: [
    // Bausteine
    { id: 'generic', label: 'Allgemein', group: 'Bausteine', color: '#9ca3af', icon: 'shapes' },
    { id: 'group', label: 'Gruppe / Zone', group: 'Bausteine', color: '#64748b', icon: 'folder' },
    { id: 'web-app', label: 'Anwendung / Website', group: 'Bausteine', color: '#a78bfa', icon: 'app-window' },
    { id: 'native-service', label: 'Dienst / Prozess', group: 'Bausteine', color: '#4ade80', icon: 'terminal' },
    { id: 'database', label: 'Datenbank', group: 'Bausteine', color: '#f472b6', icon: 'database' },
    { id: 'storage', label: 'Speicher / Ablage', group: 'Bausteine', color: '#14b8a6', icon: 'hard-drive' },
    // Aussenwelt
    { id: 'client', label: 'Client / Benutzer', group: 'Aussenwelt', color: '#e2e8f0', icon: 'users' },
    { id: 'internet', label: 'Internet / WAN', group: 'Aussenwelt', color: '#64748b', icon: 'globe' },
    { id: 'cloud-service', label: 'Externer Dienst', group: 'Aussenwelt', color: '#fb923c', icon: 'cloud' },
    { id: 'domain', label: 'Domain / DNS-Zone', group: 'Aussenwelt', color: '#93c5fd', icon: 'at-sign' },
    { id: 'email', label: 'E-Mail-Dienst', group: 'Aussenwelt', color: '#e879f9', icon: 'mail' },
    { id: 'notification', label: 'Benachrichtigungen', group: 'Aussenwelt', color: '#facc15', icon: 'bell' },
  ],

  // Beziehungen ohne Technikbezug — tragen Architektur-, Prozess- und
  // Organisationsdiagramme genauso wie Serverlandschaften.
  edgeKinds: [
    { id: 'generic', label: 'Allgemein', group: 'Allgemein', color: '#9ca3af' },
    { id: 'dependency', label: 'Abhängigkeit', group: 'Allgemein', color: '#f472b6' },
    { id: 'data-flow', label: 'Datenfluss', group: 'Allgemein', color: '#38bdf8' },
    { id: 'control', label: 'Steuerung', group: 'Allgemein', color: '#fbbf24' },
    { id: 'api', label: 'API-Aufruf', group: 'Allgemein', color: '#a78bfa' },
  ],

  fields: [
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
    // Das Produkt gehört ins Feld, nicht in die Kategorie: „Proxmox VE", „AWS",
    // „Kubernetes", „SAP" — derselbe Node-Typ trägt damit jeden Hersteller.
    // Der Platzhalter bleibt bewusst gemischt: das Feld ist im Kern und taucht
    // damit auch in Prozess- und Architekturprojekten auf.
    { key: 'platform', label: 'Plattform', type: 'text', group: 'Allgemein', wide: true, placeholder: 'z. B. Proxmox VE, AWS, Kubernetes, SAP' },
    { key: 'version', label: 'Version', type: 'text', group: 'Allgemein' },
    { key: 'location', label: 'Standort', type: 'text', group: 'Allgemein', placeholder: 'Rack 2, Büro Nord …' },
    { key: 'reviewedAt', label: 'Zuletzt geprüft', type: 'date', group: 'Allgemein' },
  ],
};
