/** Netzwerkplan: Segmente, Geräte und wer wohin darf. */
export const network = {
  id: 'network',
  label: 'Network plan',
  description: 'WAN, firewall, VLAN segments and end devices on one level.',
  icon: 'router',
  color: '#0ea5e9',
  packs: ['network', 'security', 'infrastructure', 'operations'],
  footprint: { views: 1, nodes: 14 },

  build({ node, edge }) {
    node({ id: 'wan', name: 'Internet', category: 'internet', status: 'active', position: { x: 460, y: 20 } });
    node({ id: 'fw', name: 'Firewall', category: 'firewall', status: 'active', position: { x: 460, y: 160 }, fields: { ip: '192.168.1.1', platform: 'OPNsense', hostname: 'fw01.lan' } });
    node({ id: 'sw', name: 'Core switch', category: 'wifi-ap', status: 'active', position: { x: 460, y: 320 }, fields: { ip: '192.168.1.2', platform: 'UniFi', mac: 'aa:bb:cc:00:11:22' } });
    edge('wan', 'fw', { kind: 'https', label: 'WAN' });
    edge('fw', 'sw', { kind: 'tcp', label: 'Trunk (all VLANs)' });

    // Ein Segment = eine Zone. Kinder liegen relativ zur Zone.
    const segment = (id, name, x, vlan) => {
      node({ id, name: `${name} (VLAN ${vlan})`, category: 'group', position: { x, y: 460 }, width: 300, height: 300, fields: { vlan } });
      return (childId, childName, category, y, fields = {}) =>
        node({ id: childId, name: childName, category, status: 'active', parentId: id, position: { x: 30, y }, fields: { vlan, ...fields } });
    };

    const mgmt = segment('seg-mgmt', 'Management', 40, '10');
    mgmt('srv', 'Server host', 'hypervisor', 60, { ip: '10.0.10.10' });
    mgmt('nas', 'NAS', 'storage', 150, { ip: '10.0.10.20' });
    mgmt('mon', 'Monitoring', 'monitoring', 240, { ip: '10.0.10.30' });

    const office = segment('seg-office', 'Office', 380, '20');
    office('ap', 'Access Point', 'wifi-ap', 60, { ip: '10.0.20.2' });
    office('clients', 'Workstations', 'client', 150, {});
    office('printer', 'Printer', 'physical-device', 240, { ip: '10.0.20.50' });

    const guest = segment('seg-guest', 'Guests & IoT', 720, '30');
    guest('guest-wifi', 'Guest Wi-Fi', 'wifi-ap', 60, { ip: '10.0.30.2' });
    guest('iot', 'IoT devices', 'physical-device', 150, {});

    edge('sw', 'seg-mgmt', { kind: 'tcp', label: 'VLAN 10' });
    edge('sw', 'seg-office', { kind: 'tcp', label: 'VLAN 20' });
    edge('sw', 'seg-guest', { kind: 'tcp', label: 'VLAN 30' });
    // Die interessante Aussage eines Netzplans ist, was NICHT erlaubt ist.
    edge('seg-guest', 'seg-mgmt', {
      kind: 'generic', label: 'blocked', lineStyle: 'dotted',
      notes: 'The guest and IoT segment has **no** access to management.',
    });
  },
};
