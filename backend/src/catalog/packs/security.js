/** Schutz, Zugriff und Zertifikate. */
export const security = {
  id: 'security',
  label: 'Security',
  description: 'Firewall, IDS/IPS, SSO, secrets and TLS certificates.',
  icon: 'shield',

  categories: [
    { id: 'firewall', label: 'Firewall / WAF', group: 'Security', color: '#ef4444', icon: 'shield' },
    { id: 'ids', label: 'IDS / IPS', group: 'Security', color: '#f87171', icon: 'shield-alert' },
    { id: 'auth', label: 'Auth / SSO / zero trust', group: 'Security', color: '#f43f5e', icon: 'fingerprint' },
    { id: 'secrets', label: 'Secrets / password manager', group: 'Security', color: '#d946ef', icon: 'key-round' },
    { id: 'certificate', label: 'Certificate / TLS', group: 'Security', color: '#84cc16', icon: 'shield-check' },
  ],

  edgeKinds: [],

  // Ablaufdatum: der häufigste Grund, warum ein dokumentiertes Zertifikat
  // überhaupt dokumentiert wird.
  fields: [{ key: 'expiresAt', label: 'Expires', type: 'date', group: 'Security' }],
};
