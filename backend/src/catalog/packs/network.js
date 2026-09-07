/** Netzwerk, Routing und die konkreten Übertragungsprotokolle. */
export const network = {
  id: 'network',
  label: 'Network',
  description: 'Routers, proxies, VPN, DNS — plus protocols as connection kinds.',
  icon: 'router',

  categories: [
    { id: 'router', label: 'Router / gateway', group: 'Network', color: '#a3a3a3', icon: 'router' },
    { id: 'wifi-ap', label: 'Switch / access point', group: 'Network', color: '#0ea5e9', icon: 'wifi' },
    { id: 'reverse-proxy', label: 'Reverse proxy', group: 'Network', color: '#2dd4bf', icon: 'arrow-left-right' },
    { id: 'tunnel', label: 'Tunnel', group: 'Network', color: '#f6821f', icon: 'cable' },
    { id: 'vpn', label: 'VPN', group: 'Network', color: '#818cf8', icon: 'lock' },
    { id: 'dns', label: 'DNS / DHCP', group: 'Network', color: '#60a5fa', icon: 'network' },
  ],

  edgeKinds: [
    { id: 'http', label: 'HTTP', group: 'Network', color: '#60a5fa' },
    { id: 'https', label: 'HTTPS', group: 'Network', color: '#34d399' },
    { id: 'tcp', label: 'TCP', group: 'Network', color: '#94a3b8' },
    { id: 'udp', label: 'UDP', group: 'Network', color: '#c084fc' },
    { id: 'dns', label: 'DNS', group: 'Network', color: '#fbbf24' },
    { id: 'tunnel', label: 'Tunnel', group: 'Network', color: '#f6821f' },
    { id: 'vpn', label: 'VPN / WireGuard', group: 'Network', color: '#818cf8' },
    { id: 'mail', label: 'Email / SMTP', group: 'Network', color: '#e879f9' },
  ],

  fields: [
    { key: 'ip', label: 'IP address', type: 'text', group: 'Network', mono: true, showOnNode: true, placeholder: '192.168.1.10' },
    { key: 'hostname', label: 'Hostname', type: 'text', group: 'Network', mono: true, showOnNode: true, placeholder: 'host.example.com' },
    { key: 'vlan', label: 'VLAN', type: 'text', group: 'Network', mono: true },
    { key: 'mac', label: 'MAC address', type: 'text', group: 'Network', mono: true, placeholder: 'aa:bb:cc:dd:ee:ff' },
  ],
};
