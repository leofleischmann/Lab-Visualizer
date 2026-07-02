import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  AppWindow,
  Archive,
  ArrowLeftRight,
  AtSign,
  Bell,
  Box,
  Brain,
  Cable,
  Cloud,
  Container,
  Cpu,
  Database,
  Film,
  Fingerprint,
  Folder,
  Gamepad2,
  GitBranch,
  Globe,
  HardDrive,
  Home,
  KeyRound,
  Layers,
  Lightbulb,
  Lock,
  Mail,
  Monitor,
  Network,
  Router,
  Server,
  ServerCog,
  Shapes,
  Share2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Users,
  Wifi,
  Workflow,
  Zap,
} from 'lucide-react';
import type { ApiNode, Catalog, Category, EdgeKind, Status } from '../api/types';

const ICONS: Record<string, LucideIcon> = {
  activity: Activity,
  'app-window': AppWindow,
  archive: Archive,
  'arrow-left-right': ArrowLeftRight,
  'at-sign': AtSign,
  bell: Bell,
  box: Box,
  brain: Brain,
  cable: Cable,
  cloud: Cloud,
  container: Container,
  cpu: Cpu,
  database: Database,
  film: Film,
  fingerprint: Fingerprint,
  folder: Folder,
  'gamepad-2': Gamepad2,
  'git-branch': GitBranch,
  globe: Globe,
  'hard-drive': HardDrive,
  home: Home,
  'key-round': KeyRound,
  layers: Layers,
  lightbulb: Lightbulb,
  lock: Lock,
  mail: Mail,
  monitor: Monitor,
  network: Network,
  router: Router,
  server: Server,
  'server-cog': ServerCog,
  shapes: Shapes,
  'share-2': Share2,
  shield: Shield,
  'shield-alert': ShieldAlert,
  'shield-check': ShieldCheck,
  terminal: Terminal,
  users: Users,
  wifi: Wifi,
  workflow: Workflow,
  zap: Zap,
};

const FALLBACK_CATEGORY: Category = {
  id: 'generic',
  label: 'Allgemein',
  group: 'Sonstiges',
  color: '#9ca3af',
  icon: 'shapes',
};

export function categoryOf(catalog: Catalog | null, id: string): Category {
  return (
    catalog?.categories.find((c) => c.id === id) ?? { ...FALLBACK_CATEGORY, id, label: id }
  );
}

export function statusOf(catalog: Catalog | null, id: string): Status {
  return catalog?.statuses.find((s) => s.id === id) ?? { id, label: id, color: '#d97706' };
}

export function kindOf(catalog: Catalog | null, id: string): EdgeKind {
  return catalog?.edgeKinds.find((k) => k.id === id) ?? { id, label: id, color: '#9ca3af' };
}

export function iconOf(name: string): LucideIcon {
  return ICONS[name] ?? Shapes;
}

/** Gruppiert Kategorien für Palette & Selects (Reihenfolge des Katalogs bleibt erhalten). */
export function groupedCategories(catalog: Catalog | null): [string, Category[]][] {
  const groups = new Map<string, Category[]>();
  for (const cat of catalog?.categories ?? []) {
    const list = groups.get(cat.group) ?? [];
    list.push(cat);
    groups.set(cat.group, list);
  }
  return [...groups.entries()];
}

/** Volltext-Suche über die wichtigsten Node-Felder inkl. Custom Fields. */
export function matchesSearch(entity: ApiNode, term: string): boolean {
  const needle = term.toLowerCase();
  const haystack = [
    entity.name,
    entity.category,
    entity.ip,
    entity.hostname,
    entity.url,
    entity.os,
    entity.vlan,
    ...Object.entries(entity.customFields).flat(),
  ];
  return haystack.some((v) => v?.toLowerCase().includes(needle));
}
