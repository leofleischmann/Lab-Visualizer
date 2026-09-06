/** Kubernetes-Cluster: Namespaces als Zonen, Workloads darin. */
export const kubernetes = {
  id: 'kubernetes',
  label: 'Kubernetes-Cluster',
  description: 'Ingress, Namespaces, Deployments, Services und Volumes.',
  icon: 'hexagon',
  color: '#326ce5',
  packs: ['kubernetes', 'network', 'operations', 'infrastructure'],
  footprint: { views: 1, nodes: 13 },

  build({ node, edge }) {
    node({ id: 'users', name: 'Nutzer', category: 'client', status: 'active', position: { x: 460, y: 20 } });
    node({ id: 'ingress', name: 'Ingress Controller', category: 'k8s-ingress', status: 'active', position: { x: 460, y: 150 }, fields: { namespace: 'ingress-nginx', platform: 'ingress-nginx' } });
    edge('users', 'ingress', { kind: 'https', label: 'HTTPS :443' });

    // Namespace als Zone: die Gruppierung, die im Cluster tatsächlich zählt.
    node({ id: 'ns-app', name: 'Namespace: app', category: 'k8s-namespace', position: { x: 60, y: 300 }, width: 560, height: 330, fields: { namespace: 'app' } });
    const inApp = (o) => node({ ...o, parentId: 'ns-app', status: 'active', fields: { namespace: 'app', ...o.fields } });
    inApp({ id: 'svc-web', name: 'web (Service)', category: 'k8s-service', position: { x: 40, y: 60 } });
    inApp({ id: 'dep-web', name: 'web', category: 'k8s-workload', position: { x: 40, y: 190 }, fields: { image: 'ghcr.io/org/web:1.4.2', replicas: '3' } });
    inApp({ id: 'svc-api', name: 'api (Service)', category: 'k8s-service', position: { x: 300, y: 60 } });
    inApp({ id: 'dep-api', name: 'api', category: 'k8s-workload', position: { x: 300, y: 190 }, fields: { image: 'ghcr.io/org/api:2.0.1', replicas: '2' } });

    node({ id: 'ns-data', name: 'Namespace: data', category: 'k8s-namespace', position: { x: 680, y: 300 }, width: 300, height: 330, fields: { namespace: 'data' } });
    const inData = (o) => node({ ...o, parentId: 'ns-data', status: 'active', fields: { namespace: 'data', ...o.fields } });
    inData({ id: 'sts-db', name: 'postgres', category: 'k8s-workload', position: { x: 30, y: 60 }, fields: { image: 'postgres:16', replicas: '1', criticality: 'Kritisch' } });
    inData({ id: 'pvc', name: 'postgres-data', category: 'k8s-volume', position: { x: 30, y: 190 }, fields: { disk: '100' } });

    node({ id: 'ns-obs', name: 'Namespace: observability', category: 'k8s-namespace', position: { x: 60, y: 690 }, width: 560, height: 170, fields: { namespace: 'observability' } });
    node({ id: 'prom', name: 'Prometheus', category: 'monitoring', status: 'active', parentId: 'ns-obs', position: { x: 40, y: 60 }, fields: { namespace: 'observability' } });
    node({ id: 'graf', name: 'Grafana', category: 'monitoring', status: 'active', parentId: 'ns-obs', position: { x: 300, y: 60 }, fields: { namespace: 'observability' } });

    edge('ingress', 'svc-web', { kind: 'http', label: 'example.com' });
    edge('ingress', 'svc-api', { kind: 'http', label: 'api.example.com' });
    edge('svc-web', 'dep-web', { kind: 'generic', label: 'selector' });
    edge('svc-api', 'dep-api', { kind: 'generic', label: 'selector' });
    edge('dep-web', 'svc-api', { kind: 'api', label: 'interner Aufruf' });
    edge('dep-api', 'sts-db', { kind: 'tcp', label: ':5432' });
    edge('sts-db', 'pvc', { kind: 'dependency', label: 'mount', lineStyle: 'dashed' });
    edge('prom', 'dep-api', { kind: 'monitoring', label: 'scrape', lineStyle: 'dashed' });
    edge('graf', 'prom', { kind: 'data-flow', label: 'Datenquelle' });
  },
};
