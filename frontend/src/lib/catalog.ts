import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  AppWindow,
  Archive,
  ArrowLeftRight,
  AtSign,
  Bell,
  Box,
  Boxes,
  Brain,
  Briefcase,
  Building2,
  Cable,
  Cloud,
  CloudCog,
  Container,
  Cpu,
  Database,
  ExternalLink,
  FileText,
  Film,
  Fingerprint,
  Folder,
  FolderTree,
  Gamepad2,
  GitBranch,
  GitFork,
  Globe,
  HardDrive,
  Hexagon,
  Home,
  Inbox,
  KeyRound,
  Layers,
  Lightbulb,
  ListChecks,
  Lock,
  Mail,
  Monitor,
  Network,
  Package,
  Plug,
  Puzzle,
  Router,
  Server,
  ServerCog,
  Shapes,
  Share2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Split,
  SquareDashed,
  Terminal,
  UserRound,
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
  boxes: Boxes,
  brain: Brain,
  briefcase: Briefcase,
  'building-2': Building2,
  cable: Cable,
  cloud: Cloud,
  'cloud-cog': CloudCog,
  container: Container,
  cpu: Cpu,
  database: Database,
  'external-link': ExternalLink,
  'file-text': FileText,
  film: Film,
  fingerprint: Fingerprint,
  folder: Folder,
  'folder-tree': FolderTree,
  'gamepad-2': Gamepad2,
  'git-branch': GitBranch,
  'git-fork': GitFork,
  globe: Globe,
  'hard-drive': HardDrive,
  hexagon: Hexagon,
  home: Home,
  inbox: Inbox,
  'key-round': KeyRound,
  layers: Layers,
  lightbulb: Lightbulb,
  'list-checks': ListChecks,
  lock: Lock,
  mail: Mail,
  monitor: Monitor,
  network: Network,
  package: Package,
  plug: Plug,
  puzzle: Puzzle,
  router: Router,
  server: Server,
  'server-cog': ServerCog,
  shapes: Shapes,
  'share-2': Share2,
  shield: Shield,
  'shield-alert': ShieldAlert,
  'shield-check': ShieldCheck,
  split: Split,
  'square-dashed': SquareDashed,
  terminal: Terminal,
  'user-round': UserRound,
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

/**
 * Kategorie eines Nodes zum DARSTELLEN.
 *
 * Sucht bewusst auch in den inaktiven Packs: ein Node behält seine Kategorie,
 * wenn das Projekt deren Pack abwählt, und soll trotzdem sein Icon, seine Farbe
 * und sein Label behalten. Der graue Fallback greift nur noch für wirklich
 * eigene Kategorien (die der Katalog nirgends kennt).
 *
 * Zum ANBIETEN (Palette, Auswahlfeld) dagegen `groupedCategories` benutzen —
 * die liefert nur die aktiven.
 */
export function categoryOf(catalog: Catalog | null, id: string): Category {
  return (
    catalog?.categories.find((c) => c.id === id) ??
    catalog?.inactive.categories.find((c) => c.id === id) ?? {
      ...FALLBACK_CATEGORY,
      id,
      label: id,
    }
  );
}

/** true, wenn die Kategorie nur noch aus einem abgewählten Pack bekannt ist. */
export function isInactiveCategory(catalog: Catalog | null, id: string): boolean {
  return !!catalog?.inactive.categories.some((c) => c.id === id);
}

export function statusOf(catalog: Catalog | null, id: string): Status {
  return catalog?.statuses.find((s) => s.id === id) ?? { id, label: id, color: '#d97706' };
}

/** Verbindungsart zum DARSTELLEN — inaktive Packs eingeschlossen (siehe categoryOf). */
export function kindOf(catalog: Catalog | null, id: string): EdgeKind {
  return (
    catalog?.edgeKinds.find((k) => k.id === id) ??
    catalog?.inactive.edgeKinds.find((k) => k.id === id) ?? {
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

/**
 * Icon-Namen, die `iconOf` auflösen kann.
 *
 * Der Fallback in `iconOf` ist für EIGENE Kategorien der Nutzer gedacht, nicht
 * als Netz für Tippfehler im mitgelieferten Katalog — ein Icon-Name aus
 * backend/src/catalog/ würde sonst stillschweigend als graues Standard-Symbol
 * enden. `catalog.test.ts` gleicht beide Seiten deshalb ab.
 */
export const ICON_NAMES = Object.keys(ICONS);

/** Abschnitt im Panel für Werte, deren Pack das Projekt abgewählt hat. */
export const ORPHAN_GROUP = 'Weitere Felder';

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
 * Feldwerte eines Nodes, für die der AKTIVE Katalog keine Definition hat —
 * typischerweise Werte aus einem Pack, das dieses Projekt abgewählt hat, oder
 * aus dem Import eines fremden Projekts.
 *
 * Sie werden im Panel trotzdem angezeigt (als einfache Textfelder), damit ein
 * Pack-Wechsel keine Daten unsichtbar macht. Die Typprüfung übernimmt weiterhin
 * das Backend, das gegen ALLE Packs validiert (backend/src/validation.js).
 */
export function orphanFields(
  catalog: Catalog | null,
  fields: Record<string, string>
): FieldDef[] {
  // Ohne geladenen Katalog wäre JEDES Feld ein Waisenfeld — das Panel würde
  // während des Ladens kurz alle Werte in „Weitere Felder" schieben.
  if (!catalog) return [];
  const active = new Set(catalog.fields.map((f) => f.key));
  const byKey = new Map(catalog.inactive.fields.map((f) => [f.key, f]));
  return Object.keys(fields)
    .filter((key) => !active.has(key) && fields[key] !== '')
    .map((key) => {
      // Definition aus dem abgewählten Pack übernehmen (Label, Typ, Einheit) —
      // nur die Gruppe wird umgehängt. Ein Feld, das der Katalog gar nicht
      // kennt (Import aus fremder Instanz), fällt auf den rohen Schlüssel zurück.
      const known = byKey.get(key);
      return known
        ? { ...known, group: ORPHAN_GROUP }
        : { key, label: key, type: 'text' as const, group: ORPHAN_GROUP, wide: true };
    });
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
