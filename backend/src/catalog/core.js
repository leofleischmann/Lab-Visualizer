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
  label: 'Core',
  description: 'Base building blocks available in every project.',
  icon: 'shapes',

  categories: [
    // Bausteine
    { id: 'generic', label: 'Generic', group: 'Building blocks', color: '#9ca3af', icon: 'shapes' },
    { id: 'group', label: 'Group / Zone', group: 'Building blocks', color: '#64748b', icon: 'folder' },
    { id: 'web-app', label: 'Application / Website', group: 'Building blocks', color: '#a78bfa', icon: 'app-window' },
    { id: 'native-service', label: 'Service / Process', group: 'Building blocks', color: '#4ade80', icon: 'terminal' },
    { id: 'database', label: 'Database', group: 'Building blocks', color: '#f472b6', icon: 'database' },
    { id: 'storage', label: 'Storage', group: 'Building blocks', color: '#14b8a6', icon: 'hard-drive' },
    // Aussenwelt
    { id: 'client', label: 'Client / User', group: 'External world', color: '#e2e8f0', icon: 'users' },
    { id: 'internet', label: 'Internet / WAN', group: 'External world', color: '#64748b', icon: 'globe' },
    { id: 'cloud-service', label: 'External service', group: 'External world', color: '#fb923c', icon: 'cloud' },
    { id: 'domain', label: 'Domain / DNS zone', group: 'External world', color: '#93c5fd', icon: 'at-sign' },
    { id: 'email', label: 'Email service', group: 'External world', color: '#e879f9', icon: 'mail' },
    { id: 'notification', label: 'Notifications', group: 'External world', color: '#facc15', icon: 'bell' },
  ],

  // Beziehungen ohne Technikbezug — tragen Architektur-, Prozess- und
  // Organisationsdiagramme genauso wie Serverlandschaften.
  edgeKinds: [
    { id: 'generic', label: 'Generic', group: 'General', color: '#9ca3af' },
    { id: 'dependency', label: 'Dependency', group: 'General', color: '#f472b6' },
    { id: 'data-flow', label: 'Data flow', group: 'General', color: '#38bdf8' },
    { id: 'control', label: 'Control', group: 'General', color: '#fbbf24' },
    { id: 'api', label: 'API call', group: 'General', color: '#a78bfa' },
  ],

  fields: [
    { key: 'url', label: 'URL', type: 'url', group: 'General', mono: true, wide: true, placeholder: 'https://…' },
    { key: 'owner', label: 'Owner', type: 'text', group: 'General', placeholder: 'Team or person' },
    {
      key: 'environment', label: 'Environment', type: 'select', group: 'General',
      options: ['Production', 'Staging', 'Test', 'Development'],
    },
    {
      key: 'criticality', label: 'Criticality', type: 'select', group: 'General',
      options: ['Critical', 'High', 'Medium', 'Low'],
    },
    // Das Produkt gehört ins Feld, nicht in die Kategorie: „Proxmox VE", „AWS",
    // „Kubernetes", „SAP" — derselbe Node-Typ trägt damit jeden Hersteller.
    // Der Platzhalter bleibt bewusst gemischt: das Feld ist im Kern und taucht
    // damit auch in Prozess- und Architekturprojekten auf.
    { key: 'platform', label: 'Platform', type: 'text', group: 'General', wide: true, placeholder: 'e.g. Proxmox VE, AWS, Kubernetes, SAP' },
    { key: 'version', label: 'Version', type: 'text', group: 'General' },
    { key: 'location', label: 'Location', type: 'text', group: 'General', placeholder: 'Rack 2, north office …' },
    { key: 'reviewedAt', label: 'Last reviewed', type: 'date', group: 'General' },
  ],
};
