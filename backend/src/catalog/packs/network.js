/** Netzwerk, Routing und die konkreten Übertragungsprotokolle. */
export const network = {
  id: 'network',
  label: 'Netzwerk',
  description: 'Router, Proxies, VPN, DNS — plus Protokolle als Verbindungsarten.',
  icon: 'router',

  categories: [
    { id: 'router', label: 'Router / Gateway', group: 'Netzwerk', color: '#a3a3a3', icon: 'router' },
    { id: 'wifi-ap', label: 'Switch / Access Point', group: 'Netzwerk', color: '#0ea5e9', icon: 'wifi' },
    { id: 'reverse-proxy', label: 'Reverse Proxy', group: 'Netzwerk', color: '#2dd4bf', icon: 'arrow-left-right' },
    { id: 'tunnel', label: 'Tunnel', group: 'Netzwerk', color: '#f6821f', icon: 'cable' },
    { id: 'vpn', label: 'VPN', group: 'Netzwerk', color: '#818cf8', icon: 'lock' },
    { id: 'dns', label: 'DNS / DHCP', group: 'Netzwerk', color: '#60a5fa', icon: 'network' },
  ],

  edgeKinds: [
    { id: 'http', label: 'HTTP', group: 'Netzwerk', color: '#60a5fa' },
    { id: 'https', label: 'HTTPS', group: 'Netzwerk', color: '#34d399' },
    { id: 'tcp', label: 'TCP', group: 'Netzwerk', color: '#94a3b8' },
    { id: 'udp', label: 'UDP', group: 'Netzwerk', color: '#c084fc' },
    { id: 'dns', label: 'DNS', group: 'Netzwerk', color: '#fbbf24' },
    { id: 'tunnel', label: 'Tunnel', group: 'Netzwerk', color: '#f6821f' },
    { id: 'vpn', label: 'VPN / WireGuard', group: 'Netzwerk', color: '#818cf8' },
    { id: 'mail', label: 'E-Mail / SMTP', group: 'Netzwerk', color: '#e879f9' },
  ],

  fields: [
    { key: 'ip', label: 'IP-Adresse', type: 'text', group: 'Netzwerk', mono: true, showOnNode: true, placeholder: '192.168.1.10' },
    { key: 'hostname', label: 'Hostname', type: 'text', group: 'Netzwerk', mono: true, showOnNode: true, placeholder: 'host.example.com' },
    { key: 'vlan', label: 'VLAN', type: 'text', group: 'Netzwerk', mono: true },
    { key: 'mac', label: 'MAC-Adresse', type: 'text', group: 'Netzwerk', mono: true, placeholder: 'aa:bb:cc:dd:ee:ff' },
  ],
};
