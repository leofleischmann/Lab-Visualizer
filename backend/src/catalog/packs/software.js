/**
 * Software-Architektur in Anlehnung an das C4-Modell. Passt zur bestehenden
 * Ebenen-Hierarchie: Kontext -> System -> Komponente sind hier drei Ebenen.
 */
export const software = {
  id: 'software',
  label: 'Software architecture',
  description: 'Systems, applications, components, interfaces and actors.',
  icon: 'puzzle',

  categories: [
    { id: 'software-system', label: 'System', group: 'Architecture', color: '#a78bfa', icon: 'boxes' },
    { id: 'component', label: 'Component / module', group: 'Architecture', color: '#c084fc', icon: 'puzzle' },
    { id: 'api-endpoint', label: 'Interface / API', group: 'Architecture', color: '#38bdf8', icon: 'plug' },
    { id: 'message-queue', label: 'Queue / event bus', group: 'Architecture', color: '#f59e0b', icon: 'inbox' },
    { id: 'external-system', label: 'External system', group: 'Architecture', color: '#94a3b8', icon: 'external-link' },
    { id: 'actor', label: 'Actor / role', group: 'Architecture', color: '#e2e8f0', icon: 'user-round' },
    { id: 'ai-service', label: 'AI / LLM service', group: 'Architecture', color: '#ec4899', icon: 'brain' },
  ],

  edgeKinds: [{ id: 'event', label: 'Event / message', group: 'Architecture', color: '#f59e0b' }],

  fields: [
    { key: 'repository', label: 'Repository', type: 'url', group: 'Architecture', mono: true, wide: true, placeholder: 'https://github.com/…' },
    { key: 'language', label: 'Language / framework', type: 'text', group: 'Architecture', placeholder: 'TypeScript, Go …' },
  ],
};
