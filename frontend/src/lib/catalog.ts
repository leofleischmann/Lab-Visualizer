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
import type { ApiNode, Catalog, Category, EdgeKind, FieldDef, Status } from '../api/types';

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
  return (
    catalog?.edgeKinds.find((k) => k.id === id) ?? {
      id,
      label: id,
      group: 'Sonstiges',
      color: '#9ca3af',
    }
  );
}

export function iconOf(name: string): LucideIcon {
  return ICONS[name] ?? Shapes;
}

/** Gruppiert Einträge nach `group`; die Reihenfolge des Katalogs bleibt erhalten. */
function groupBy<T extends { group: string }>(items: T[]): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const list = groups.get(item.group) ?? [];
    list.push(item);
    groups.set(item.group, list);
  }
  return [...groups.entries()];
}

/** Gruppiert Kategorien für Palette & Selects. */
export function groupedCategories(catalog: Catalog | null): [string, Category[]][] {
  return groupBy(catalog?.categories ?? []);
}

/** Gruppiert Verbindungsarten für das Kanten-Panel (Allgemein / Netzwerk / Betrieb). */
export function groupedEdgeKinds(catalog: Catalog | null): [string, EdgeKind[]][] {
  return groupBy(catalog?.edgeKinds ?? []);
}

/**
 * Gruppiert die Felddefinitionen für das Deep-Dive-Panel. Quelle ist allein der
 * Backend-Katalog (`/api/meta/catalog`) — hier stehen bewusst KEINE Feldnamen.
 */
export function groupedFields(catalog: Catalog | null): [string, FieldDef[]][] {
  return groupBy(catalog?.fields ?? []);
}

/**
 * Felder, die laut Katalog direkt auf der Canvas erscheinen (`showOnNode`) und
 * beim Node auch gefüllt sind. Ersetzt die früher fest verdrahtete Anzeige von
 * IP und Hostname.
 *
 * Beeinflusst: canvas/InfraNode.tsx, GlobalSearch.tsx.
 */
export function nodeBadges(catalog: Catalog | null, entity: ApiNode): { key: string; value: string }[] {
  return (catalog?.fields ?? [])
    .filter((f) => f.showOnNode)
    .map((f) => ({ key: f.key, value: entity.fields[f.key] ?? '' }))
    .filter((b) => b.value !== '');
}

/**
 * Volltext-Suche über Name, Kategorie und alle Feldwerte.
 *
 * Muss deckungsgleich mit der serverseitigen Suche in backend/src/store.js
 * (listNodes, json_each) bleiben — sonst liefern lokale Filterung und globale
 * Suche unterschiedliche Treffer. Einziger Unterschied: hier matcht zusätzlich
 * die Kategorie-ID sowie die SCHLÜSSEL der Custom Fields, weil der Nutzer sie
 * selbst benannt hat und sie in der UI als Label sichtbar sind.
 */
export function matchesSearch(entity: ApiNode, term: string): boolean {
  const needle = term.toLowerCase();
  const haystack = [
    entity.name,
    entity.category,
    ...Object.values(entity.fields),
    ...Object.entries(entity.customFields).flat(),
  ];
  return haystack.some((v) => v?.toLowerCase().includes(needle));
}
