/** Netzwerkplan: Segmente, Geräte und wer wohin darf. */
export const network = {
  id: 'network',
  label: 'Netzwerkplan',
  description: 'WAN, Firewall, VLAN-Segmente und Endgeräte auf einer Ebene.',
  icon: 'router',
  color: '#0ea5e9',
  packs: ['network', 'security', 'infrastructure', 'operations'],
  footprint: { views: 1, nodes: 14 },

  build({ node, edge }) {
    node({ id: 'wan', name: 'Internet', category: 'internet', status: 'active', position: { x: 460, y: 20 } });
    node({ id: 'fw', name: 'Firewall', category: 'firewall', status: 'active', position: { x: 460, y: 160 }, fields: { ip: '192.168.1.1', platform: 'OPNsense', hostname: 'fw01.lan' } });
    node({ id: 'sw', name: 'Core-Switch', category: 'wifi-ap', status: 'active', position: { x: 460, y: 320 }, fields: { ip: '192.168.1.2', platform: 'UniFi', mac: 'aa:bb:cc:00:11:22' } });
    edge('wan', 'fw', { kind: 'https', label: 'WAN' });
    edge('fw', 'sw', { kind: 'tcp', label: 'Trunk (alle VLANs)' });

    // Ein Segment = eine Zone. Kinder liegen relativ zur Zone.
    const segment = (id, name, x, vlan) => {
      node({ id, name: `${name} (VLAN ${vlan})`, category: 'group', position: { x, y: 460 }, width: 300, height: 300, fields: { vlan } });
      return (childId, childName, category, y, fields = {}) =>
        node({ id: childId, name: childName, category, status: 'active', parentId: id, position: { x: 30, y }, fields: { vlan, ...fields } });
    };

    const mgmt = segment('seg-mgmt', 'Management', 40, '10');
    mgmt('srv', 'Server-Host', 'hypervisor', 60, { ip: '10.0.10.10' });
    mgmt('nas', 'NAS', 'storage', 150, { ip: '10.0.10.20' });
    mgmt('mon', 'Monitoring', 'monitoring', 240, { ip: '10.0.10.30' });

    const office = segment('seg-office', 'Büro', 380, '20');
    office('ap', 'Access Point', 'wifi-ap', 60, { ip: '10.0.20.2' });
    office('clients', 'Arbeitsplätze', 'client', 150, {});
    office('printer', 'Drucker', 'physical-device', 240, { ip: '10.0.20.50' });

    const guest = segment('seg-guest', 'Gäste & IoT', 720, '30');
    guest('guest-wifi', 'Gäste-WLAN', 'wifi-ap', 60, { ip: '10.0.30.2' });
    guest('iot', 'IoT-Geräte', 'physical-device', 150, {});

    edge('sw', 'seg-mgmt', { kind: 'tcp', label: 'VLAN 10' });
    edge('sw', 'seg-office', { kind: 'tcp', label: 'VLAN 20' });
    edge('sw', 'seg-guest', { kind: 'tcp', label: 'VLAN 30' });
    // Die interessante Aussage eines Netzplans ist, was NICHT erlaubt ist.
    edge('seg-guest', 'seg-mgmt', {
      kind: 'generic', label: 'gesperrt', lineStyle: 'dotted',
      notes: 'Gäste- und IoT-Segment hat **keinen** Zugriff auf Management.',
    });
  },
};
