/** Kubernetes-Objekte als eigene Abstraktionsebene über der Infrastruktur. */
export const kubernetes = {
  id: 'kubernetes',
  label: 'Kubernetes',
  description: 'Cluster, Namespaces, Workloads, Services und Volumes.',
  icon: 'hexagon',

  categories: [
    { id: 'k8s-cluster', label: 'Cluster', group: 'Kubernetes', color: '#326ce5', icon: 'hexagon' },
    { id: 'k8s-namespace', label: 'Namespace', group: 'Kubernetes', color: '#60a5fa', icon: 'folder-tree' },
    { id: 'k8s-workload', label: 'Deployment / StatefulSet', group: 'Kubernetes', color: '#7dd3fc', icon: 'boxes' },
    { id: 'k8s-service', label: 'Service', group: 'Kubernetes', color: '#2dd4bf', icon: 'share-2' },
    { id: 'k8s-ingress', label: 'Ingress / Gateway', group: 'Kubernetes', color: '#34d399', icon: 'arrow-left-right' },
    { id: 'k8s-volume', label: 'PersistentVolume', group: 'Kubernetes', color: '#14b8a6', icon: 'hard-drive' },
  ],

  edgeKinds: [],

  fields: [
    { key: 'namespace', label: 'Namespace', type: 'text', group: 'Kubernetes', mono: true, showOnNode: true },
    { key: 'image', label: 'Image', type: 'text', group: 'Kubernetes', mono: true, wide: true, placeholder: 'ghcr.io/org/app:1.4.2' },
    { key: 'replicas', label: 'Replicas', type: 'number', group: 'Kubernetes' },
  ],
};
