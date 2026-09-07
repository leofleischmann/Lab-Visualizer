import type { Node, Edge } from '@xyflow/react';

export type Position = { x: number; y: number };

/**
 * Rechtstext dieser Instanz (Impressum / Datenschutz). Wird pro Instanz unter
 * `$DATA_DIR/legal/` hinterlegt; fehlt er, blendet die UI den Link aus.
 */
export type LegalDocument = {
  id: 'impressum' | 'privacy';
  title: string;
  markdown: string;
};

/** Angemeldeter Nutzer (Account). */
export type User = {
  id: string;
  email: string;
};

/**
 * Obergrenzen dieser Instanz (`null` = unbegrenzt). Beim Self-Hosting sind
 * standardmäßig alle Werte `null`; öffentliche Instanzen setzen sie per Env.
 */
export type InstanceLimits = {
  maxProjectsPerUser: number | null;
  maxViewsPerProject: number | null;
  maxNodesPerProject: number | null;
  maxAssetsPerUser: number | null;
};

/**
 * Hochgeladenes Bild (eigenes Node-Icon oder Bild in einer Notiz). Die Bytes
 * kommen nie über diese API, sondern über GET /api/assets/:id — so kann der
 * Browser sie cachen.
 */
export type Asset = {
  id: string;
  name: string;
  mime: string;
  byteSize: number;
  createdAt: string;
};

/** Projekt: komplett getrennter Arbeitsbereich (z. B. „Homelab", „Arbeit"). */
export type Project = {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  /**
   * Aktive Domain-Packs. Bestimmt, welche Kategorien, Felder und
   * Verbindungsarten dieses Projekt sieht — der Katalog kommt daher pro Projekt
   * über GET /projects/:id/catalog, nicht global.
   */
  packs: string[];
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type ProjectPatch = Partial<Omit<Project, 'id' | 'createdAt' | 'updatedAt'>>;

/** Domain-Pack: thematisches Bündel aus Kategorien, Feldern und Kantenarten. */
export type Pack = {
  id: string;
  label: string;
  description: string;
  icon: string;
  categories: number;
  fields: number;
};

/** Startvorlage für ein neues Projekt (Packs + fertiger Inhalt). */
export type Template = {
  id: string;
  label: string;
  description: string;
  icon: string;
  color: string;
  packs: string[];
  footprint: { views: number; nodes: number };
};

/** Ebene (View): benannter Canvas in einer Drill-down-Hierarchie eines Projekts. */
export type View = {
  id: string;
  projectId: string;
  name: string;
  parentId: string | null;
  description: string;
  color: string | null;
  icon: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type ViewPatch = Partial<Omit<View, 'id' | 'createdAt' | 'updatedAt'>>;

export type ApiNode = {
  id: string;
  name: string;
  category: string;
  status: string;
  parentId: string | null;
  /** Ebene, zu der dieser Node gehört. */
  viewId: string;
  /** Optionales Drill-down-Portal: Doppelklick öffnet diese (Detail-)Ebene. */
  linkedViewId: string | null;
  position: Position;
  width: number | null;
  height: number | null;
  /**
   * Eigenes Icon statt des Kategorie-Icons: ein Name aus dem Icon-Mapping
   * (`iconOf`) oder `asset:<id>` für ein hochgeladenes Bild. null = Kategorie.
   */
  icon: string | null;
  /**
   * Eigene Farbe statt der Kategorie-Farbe. Erst damit lassen sich Zonen
   * unterscheiden (DMZ rot, intern grün) — über die Kategorie hätten alle
   * dieselbe. null = Farbe der Kategorie.
   */
  color: string | null;
  /**
   * Typisierte Felder (IP, Hostname, Plattform, ...). Welche Schlüssel es gibt,
   * definiert allein der Katalog des Backends (`Catalog.fields`) — das Frontend
   * kennt keine festen Feldnamen mehr. Werte sind immer Strings; ein leerer
   * String bedeutet „nicht gesetzt".
   */
  fields: Record<string, string>;
  /** Freiform-Key-Value für alles, was der Katalog nicht kennt. */
  customFields: Record<string, string>;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type LineStyle = 'solid' | 'dashed' | 'dotted';

export type FlowPoint = { x: number; y: number };

/**
 * Manuelles Kanten-Routing (BPMN-ähnlich). Beeinflusst: InfraEdge, lib/edge/*
 * `labelT` verankert das Label auf dem Kantenpfad (0..1 entlang der Linie),
 * dadurch bleibt es immer an der Linie, auch wenn Nodes verschoben werden.
 */
export type EdgeRouting = {
  mode: 'auto' | 'manual';
  waypoints: FlowPoint[];
  labelT?: number | null;
};

export type ApiEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  /** Ebene, zu der diese Verbindung gehört (Quelle & Ziel liegen in derselben Ebene). */
  viewId: string;
  label: string;
  kind: string;
  lineStyle: LineStyle;
  animated: boolean;
  notes: string;
  routing: EdgeRouting;
  customFields: Record<string, string>;
  createdAt: string;
  updatedAt: string;
};

export type NodePatch = Partial<
  Omit<ApiNode, 'id' | 'createdAt' | 'updatedAt'>
>;

export type EdgePatch = Partial<
  Omit<ApiEdge, 'id' | 'createdAt' | 'updatedAt'>
>;

export type Category = {
  id: string;
  label: string;
  group: string;
  color: string;
  icon: string;
};

export type Status = { id: string; label: string; color: string };
export type EdgeKind = { id: string; label: string; group: string; color: string };

/** Eingabetyp eines Node-Feldes — steuert Eingabefeld und Validierung. */
export type FieldType = 'text' | 'url' | 'number' | 'select' | 'date';

/**
 * Definition eines typisierten Node-Feldes. Kommt aus backend/src/catalog/
 * (FIELDS); das Deep-Dive-Panel und die Node-Darstellung werden vollständig
 * daraus gebaut. Ein neues Feld = ein Eintrag im Backend-Katalog, keine
 * Frontend-Änderung.
 */
export type FieldDef = {
  key: string;
  label: string;
  type: FieldType;
  group: string;
  /** Monospace-Darstellung (IPs, Hostnamen). */
  mono?: boolean;
  /** Wert wird direkt auf der Canvas unter dem Node-Namen angezeigt. */
  showOnNode?: boolean;
  placeholder?: string;
  /** Nur bei type='select': erlaubte Werte. */
  options?: string[];
  /** Nur bei type='number': Einheit hinter dem Eingabefeld. */
  unit?: string;
  /** Feld belegt im Panel die volle Breite statt einer Rasterspalte. */
  wide?: boolean;
};

export type Catalog = {
  categories: Category[];
  statuses: Status[];
  edgeKinds: EdgeKind[];
  lineStyles: LineStyle[];
  fields: FieldDef[];
  /** Packs, aus denen dieser Katalog zusammengesetzt wurde. */
  packs: string[];
  /**
   * Definitionen aus NICHT aktiven Packs. Werden zum Darstellen vorhandener
   * Daten gebraucht (Icon, Farbe, Label), aber nicht zum Anlegen angeboten —
   * sonst würde ein abgewähltes Pack bestehende Diagramme optisch zerlegen.
   */
  inactive: {
    categories: Category[];
    edgeKinds: EdgeKind[];
    fields: FieldDef[];
  };
};

export type GraphPayload = {
  viewId?: string;
  projects?: Project[];
  views?: View[];
  nodes: ApiNode[];
  edges: ApiEdge[];
};

export type FlowNode = Node<{ entity: ApiNode }>;
export type FlowEdge = Edge<{ entity: ApiEdge }>;
