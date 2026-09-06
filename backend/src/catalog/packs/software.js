/**
 * Software-Architektur in Anlehnung an das C4-Modell. Passt zur bestehenden
 * Ebenen-Hierarchie: Kontext -> System -> Komponente sind hier drei Ebenen.
 */
export const software = {
  id: 'software',
  label: 'Software-Architektur',
  description: 'Systeme, Anwendungen, Komponenten, Schnittstellen und Akteure.',
  icon: 'puzzle',

  categories: [
    { id: 'software-system', label: 'System', group: 'Architektur', color: '#a78bfa', icon: 'boxes' },
    { id: 'component', label: 'Komponente / Modul', group: 'Architektur', color: '#c084fc', icon: 'puzzle' },
    { id: 'api-endpoint', label: 'Schnittstelle / API', group: 'Architektur', color: '#38bdf8', icon: 'plug' },
    { id: 'message-queue', label: 'Queue / Event-Bus', group: 'Architektur', color: '#f59e0b', icon: 'inbox' },
    { id: 'external-system', label: 'Fremdsystem', group: 'Architektur', color: '#94a3b8', icon: 'external-link' },
    { id: 'actor', label: 'Akteur / Rolle', group: 'Architektur', color: '#e2e8f0', icon: 'user-round' },
    { id: 'ai-service', label: 'KI / LLM-Dienst', group: 'Architektur', color: '#ec4899', icon: 'brain' },
  ],

  edgeKinds: [{ id: 'event', label: 'Event / Nachricht', group: 'Architektur', color: '#f59e0b' }],

  fields: [
    { key: 'repository', label: 'Repository', type: 'url', group: 'Architektur', mono: true, wide: true, placeholder: 'https://github.com/…' },
    { key: 'language', label: 'Sprache / Framework', type: 'text', group: 'Architektur', placeholder: 'TypeScript, Go …' },
  ],
};
