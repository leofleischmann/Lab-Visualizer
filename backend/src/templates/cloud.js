/**
 * Cloud-Landing-Zone, anbieterneutral. Der konkrete Anbieter steht im Feld
 * `platform`, die Region in `region` — dieselbe Vorlage trägt AWS, Azure, GCP.
 */
export const cloud = {
  id: 'cloud',
  label: 'Cloud environment',
  description: 'Region, VPC, load balancer, managed services and object storage.',
  icon: 'cloud',
  color: '#fb923c',
  packs: ['cloud', 'network', 'security', 'operations'],
  footprint: { views: 2, nodes: 16 },

  build({ view, node, edge }) {
    const l2 = view({
      name: 'Application layer',
      description: 'What runs inside the private subnets.',
    });

    const region = { region: 'eu-central-1', platform: 'AWS' };

    node({ id: 'users', name: 'Users', category: 'client', status: 'active', position: { x: 460, y: 20 } });
    node({ id: 'dns', name: 'example.com', category: 'domain', status: 'active', position: { x: 140, y: 20 } });
    node({ id: 'cdn', name: 'CDN', category: 'cloud-service', status: 'active', position: { x: 460, y: 150 }, fields: { ...region } });

    node({ id: 'reg', name: 'Region eu-central-1', category: 'cloud-region', status: 'active', position: { x: 60, y: 280 }, width: 900, height: 420, fields: { ...region } });
    const inReg = (o) => node({ ...o, parentId: 'reg', status: 'active' });
    inReg({ id: 'vpc', name: 'VPC', category: 'cloud-network', position: { x: 40, y: 70 }, width: 820, height: 310, fields: { ...region, resourceId: 'vpc-0a1b2c3d' } });
    const inVpc = (o) => node({ ...o, parentId: 'vpc', status: 'active' });
    inVpc({ id: 'alb', name: 'Load Balancer', category: 'load-balancer', position: { x: 40, y: 60 }, fields: { ...region, cost: '25 EUR' } });
    inVpc({ id: 'app', name: 'App service', category: 'managed-service', linkedViewId: l2.id, position: { x: 320, y: 60 }, fields: { ...region, cost: '180 EUR' }, notes: '**Double-click** shows the application layer.' });
    inVpc({ id: 'fn', name: 'Image processing', category: 'serverless', position: { x: 600, y: 60 }, fields: { ...region, cost: '12 EUR' } });
    inVpc({ id: 'db', name: 'Managed PostgreSQL', category: 'managed-service', position: { x: 320, y: 200 }, fields: { ...region, platform: 'AWS RDS', cost: '210 EUR', criticality: 'Critical' } });
    inVpc({ id: 's3', name: 'Object Storage', category: 'object-storage', position: { x: 600, y: 200 }, fields: { ...region, cost: '35 EUR' } });

    node({ id: 'secrets', name: 'Secrets Manager', category: 'secrets', status: 'active', position: { x: 700, y: 150 }, fields: { ...region } });
    node({ id: 'logs', name: 'Logs & metrics', category: 'monitoring', status: 'active', position: { x: 60, y: 150 }, fields: { ...region, sla: '99.9 %' } });

    edge('dns', 'cdn', { kind: 'dns', label: 'DNS' });
    edge('users', 'cdn', { kind: 'https', label: 'HTTPS :443' });
    edge('cdn', 'alb', { kind: 'https', label: 'Origin' });
    edge('alb', 'app', { kind: 'http', label: ':8080' });
    edge('app', 'db', { kind: 'tcp', label: ':5432' });
    edge('app', 's3', { kind: 'api', label: 'Uploads' });
    edge('s3', 'fn', { kind: 'data-flow', label: 'Object created', animated: true });
    edge('app', 'secrets', { kind: 'dependency', label: 'DB credentials', lineStyle: 'dashed' });
    edge('app', 'logs', { kind: 'monitoring', label: 'Metrics', lineStyle: 'dashed' });

    // ── Ebene 2: Anwendungsschicht ──
    node({ id: 'api', name: 'API gateway', category: 'managed-service', status: 'active', viewId: l2.id, position: { x: 360, y: 40 }, fields: { ...region } });
    node({ id: 'svc-order', name: 'Orders', category: 'web-app', status: 'active', viewId: l2.id, position: { x: 140, y: 240 } });
    node({ id: 'svc-user', name: 'User management', category: 'web-app', status: 'active', viewId: l2.id, position: { x: 400, y: 240 } });
    node({ id: 'svc-bill', name: 'Billing', category: 'web-app', status: 'planned', viewId: l2.id, position: { x: 660, y: 240 } });
    edge('api', 'svc-order', { kind: 'api', label: '/orders' });
    edge('api', 'svc-user', { kind: 'api', label: '/users' });
    edge('api', 'svc-bill', { kind: 'api', label: '/billing' });
  },
};
