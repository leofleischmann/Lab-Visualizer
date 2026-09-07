/**
 * Katalog-Registry: setzt aus dem Kern und den gewählten Domain-Packs den
 * Katalog eines Projekts zusammen.
 *
 * Warum Packs: der Katalog soll jede Art von Setup tragen, aber niemandem eine
 * Palette mit 60 Einträgen vorsetzen, von denen 12 passen. Ein Projekt wählt
 * seine Packs (projects.packs), und /api/meta/catalog?projectId=… liefert genau
 * deren Bausteine.
 *
 * Ein neues Pack = eine Datei unter ./packs/ + ein Eintrag in PACKS. Sonst
 * nichts: Palette, Panel, Validierung und Suche folgen automatisch.
 *
 * Beeinflusst: backend/src/validation.js (Status-Enum + Feldprüfung gegen die
 * VEREINIGUNG aller Packs), backend/src/routes/meta.js, backend/src/store.js
 * (projects.packs), backend/src/templates/* (jedes Template nennt seine Packs),
 * frontend/src/lib/catalog.ts (Icons müssen dort im ICONS-Mapping existieren).
 */
import { core } from './core.js';
import { infrastructure } from './packs/infrastructure.js';
import { network } from './packs/network.js';
import { security } from './packs/security.js';
import { operations } from './packs/operations.js';
import { cloud } from './packs/cloud.js';
import { kubernetes } from './packs/kubernetes.js';
import { software } from './packs/software.js';
import { business } from './packs/business.js';
import { homelab } from './packs/homelab.js';

/** Reihenfolge bestimmt die Reihenfolge in Palette und Selects. */
export const PACKS = [
  infrastructure,
  network,
  security,
  operations,
  cloud,
  kubernetes,
  software,
  business,
  homelab,
];

export const PACK_IDS = PACKS.map((p) => p.id);
const PACKS_BY_ID = new Map(PACKS.map((p) => [p.id, p]));

/**
 * Packs eines Projekts, das keins gewählt hat. Bewusst der klassische
 * Server-Zuschnitt — das ist der häufigste Einstieg; alles andere kommt über
 * ein Template (siehe backend/src/templates/).
 */
export const DEFAULT_PACKS = ['infrastructure', 'network', 'operations'];

/**
 * Status gelten projektübergreifend: sie sind ein geschlossenes Enum
 * (validation.js) und dürfen daher nicht von der Pack-Auswahl abhängen —
 * sonst wäre ein Node beim Abwählen eines Packs plötzlich ungültig.
 */
export const STATUSES = [
  { id: 'active', label: 'Active', color: '#22c55e' },
  { id: 'inactive', label: 'Inactive', color: '#64748b' },
  { id: 'planned', label: 'Planned', color: '#38bdf8' },
  { id: 'maintenance', label: 'Maintenance', color: '#a78bfa' },
  { id: 'error', label: 'Error / outage', color: '#ef4444' },
  { id: 'unknown', label: 'Unknown', color: '#d97706' },
];

export const STATUS_IDS = STATUSES.map((s) => s.id);
export const LINE_STYLES = ['solid', 'dashed', 'dotted'];

/** Unbekannte/ungültige IDs werden verworfen; Duplikate fallen weg. */
export function normalizePacks(packs) {
  if (!Array.isArray(packs)) return [...DEFAULT_PACKS];
  return [...new Set(packs.filter((id) => PACKS_BY_ID.has(id)))];
}

/** Erster Eintrag pro id/key gewinnt — der Kern lässt sich nicht überschreiben. */
function mergeUnique(lists, idKey) {
  const seen = new Set();
  const result = [];
  for (const item of lists.flat()) {
    if (seen.has(item[idKey])) continue;
    seen.add(item[idKey]);
    result.push(item);
  }
  return result;
}

/**
 * Baut den Katalog für eine Pack-Auswahl. `packs = null` liefert ALLES
 * (Kern + sämtliche Packs) — das nutzen Skripte und Agenten, die die
 * vollständige Referenz brauchen, ohne ein Projekt zu kennen.
 *
 * Zwei Listen, zwei Zwecke:
 *   categories/edgeKinds/fields  — was das Projekt ANBIETET (Palette, Auswahl)
 *   inactive.*                   — Definitionen für alles Übrige
 *
 * `inactive` ist nötig, weil vorhandene Daten ein abgewähltes Pack überleben:
 * ohne die Definitionen würde ein Node aus einem deaktivierten Pack als graues
 * Standardsymbol mit roher ID statt Icon, Farbe und Label erscheinen — ein
 * Pack-Wechsel würde das Diagramm also optisch zerlegen. Die UI zeichnet damit
 * weiterhin korrekt, bietet die Bausteine aber nicht mehr zum Anlegen an.
 *
 * Beeinflusst: frontend/src/lib/catalog.ts (categoryOf/kindOf lesen beide
 * Listen, groupedCategories & Co. nur die aktive).
 */
export function buildCatalog(packs = null) {
  const activeIds = new Set(packs === null ? PACK_IDS : normalizePacks(packs));
  const active = PACKS.filter((p) => activeIds.has(p.id));
  const inactive = PACKS.filter((p) => !activeIds.has(p.id));
  const sources = [core, ...active];
  const pick = (list, key) => mergeUnique(list.map((p) => p[key]), key === 'fields' ? 'key' : 'id');
  // Der Kern ist immer aktiv, taucht in `inactive` also nie auf.
  const activeCategories = pick(sources, 'categories');
  const activeKinds = pick(sources, 'edgeKinds');
  const activeFields = pick(sources, 'fields');
  const without = (all, current, idKey) => {
    const have = new Set(current.map((e) => e[idKey]));
    return all.filter((e) => !have.has(e[idKey]));
  };
  return {
    categories: activeCategories,
    statuses: STATUSES,
    edgeKinds: activeKinds,
    lineStyles: LINE_STYLES,
    fields: activeFields,
    packs: active.map((p) => p.id),
    inactive: {
      categories: without(pick(inactive, 'categories'), activeCategories, 'id'),
      edgeKinds: without(pick(inactive, 'edgeKinds'), activeKinds, 'id'),
      fields: without(pick(inactive, 'fields'), activeFields, 'key'),
    },
  };
}

/** Packs als Auswahlliste für die UI (ohne den immer aktiven Kern). */
export function listPacks() {
  return PACKS.map((p) => ({
    id: p.id,
    label: p.label,
    description: p.description,
    icon: p.icon,
    categories: p.categories.length,
    fields: p.fields.length,
  }));
}

/**
 * Alle je definierten Felder über sämtliche Packs.
 *
 * Die Validierung prüft bewusst gegen diese VEREINIGUNG statt gegen die Packs
 * des jeweiligen Projekts: sonst würde ein Import scheitern oder ein Wert beim
 * Abwählen eines Packs nachträglich ungültig. Ein Feld eines inaktiven Packs
 * ist damit gültig, nur eben nicht im Panel sichtbar.
 */
export const ALL_FIELDS = mergeUnique([core, ...PACKS].map((p) => p.fields), 'key');
export const FIELDS_BY_KEY = new Map(ALL_FIELDS.map((f) => [f.key, f]));
