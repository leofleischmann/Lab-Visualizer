/** Schutz, Zugriff und Zertifikate. */
export const security = {
  id: 'security',
  label: 'Security',
  description: 'Firewall, IDS/IPS, SSO, Secrets und TLS-Zertifikate.',
  icon: 'shield',

  categories: [
    { id: 'firewall', label: 'Firewall / WAF', group: 'Security', color: '#ef4444', icon: 'shield' },
    { id: 'ids', label: 'IDS / IPS', group: 'Security', color: '#f87171', icon: 'shield-alert' },
    { id: 'auth', label: 'Auth / SSO / Zero Trust', group: 'Security', color: '#f43f5e', icon: 'fingerprint' },
    { id: 'secrets', label: 'Secrets / Passwort-Manager', group: 'Security', color: '#d946ef', icon: 'key-round' },
    { id: 'certificate', label: 'Zertifikat / TLS', group: 'Security', color: '#84cc16', icon: 'shield-check' },
  ],

  edgeKinds: [],

  // Ablaufdatum: der häufigste Grund, warum ein dokumentiertes Zertifikat
  // überhaupt dokumentiert wird.
  fields: [{ key: 'expiresAt', label: 'Läuft ab', type: 'date', group: 'Security' }],
};
