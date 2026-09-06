/**
 * Template-Registry: Startinhalt für neue Projekte.
 *
 * Ein Template beschreibt, womit ein Projekt beginnt — welche Domain-Packs
 * aktiv sind und welche Ebenen/Nodes/Kanten angelegt werden. Damit ist der
 * Einstieg nicht mehr „leere Canvas oder Homelab", sondern die Domäne, in der
 * jemand tatsächlich arbeitet.
 *
 * Ein neues Template = eine Datei hier + ein Eintrag in TEMPLATES. Die Packs
 * eines Templates müssen in backend/src/catalog/index.js existieren; ein Test
 * prüft das, damit ein Template nicht Kategorien setzt, die das Projekt
 * anschliessend gar nicht sieht.
 *
 * Beeinflusst: backend/src/routes/projects.js (POST /projects mit `template`),
 * backend/src/routes/meta.js (GET /meta/templates), backend/src/seed.js
 * (Registrierung), backend/src/limits.js (Startprüfung der Instanz-Limits),
 * frontend/src/components/projects/NewProjectDialog.tsx.
 *
 * WICHTIG: Dieses Modul importiert store.js — store.js darf daher NIEMALS
 * Templates importieren (Zirkelbezug). Angewendet wird ein Template deshalb in
 * der Route, nicht in store.createProject.
 */
import * as store from '../store.js';
import { homelab } from './homelab.js';
import { cloud } from './cloud.js';
import { kubernetes } from './kubernetes.js';
import { software } from './software.js';
import { business } from './business.js';
import { network } from './network.js';

/** Leeres Projekt: nur die Root-Ebene, die jedes Projekt ohnehin bekommt. */
const empty = {
  id: 'empty',
  label: 'Leeres Projekt',
  description: 'Nur eine leere Übersichtsebene — alles selbst aufbauen.',
  icon: 'square-dashed',
  color: '#64748b',
  packs: ['infrastructure', 'network', 'operations'],
  footprint: { views: 1, nodes: 0 },
  build: () => {},
};

/** Reihenfolge = Reihenfolge im Auswahl-Dialog. */
export const TEMPLATES = [empty, homelab, network, cloud, kubernetes, software, business];

const BY_ID = new Map(TEMPLATES.map((t) => [t.id, t]));

export const DEFAULT_TEMPLATE_ID = 'empty';
/** Template, das jedes neu registrierte Konto als Beispiel bekommt. */
export const REGISTRATION_TEMPLATE_ID = 'homelab';

export function getTemplate(id) {
  return BY_ID.get(id) ?? null;
}

/** Templates als Auswahlliste für die UI (ohne die Baufunktion). */
export function listTemplates() {
  return TEMPLATES.map(({ id, label, description, icon, color, packs, footprint }) => ({
    id,
    label,
    description,
    icon,
    color,
    packs,
    footprint,
  }));
}

/**
 * Grösster Fussabdruck über alle Templates. Eine Instanz mit engeren Limits
 * kann nicht jedes Template anlegen — `assertTemplateFitsLimits` fängt das pro
 * Anlegevorgang ab, diese Funktion dient der Diagnose.
 */
export function maxTemplateFootprint() {
  return {
    projects: 1,
    viewsPerProject: Math.max(...TEMPLATES.map((t) => t.footprint.views)),
    nodesPerProject: Math.max(...TEMPLATES.map((t) => t.footprint.nodes)),
  };
}

/**
 * Wendet ein Template auf ein frisch angelegtes Projekt an.
 *
 * Die Helfer spiegeln bewusst die Struktur der Templates: `view()` legt eine
 * Detailebene an, `node()`/`edge()` arbeiten mit Kurz-IDs, die intern pro
 * Projekt eindeutig gemacht werden (mehrere Konten, gleiches Template).
 *
 * Der Aufrufer ist für die Transaktion zuständig (siehe routes/projects.js):
 * schlägt ein Limit mitten im Aufbau zu, soll kein halbes Projekt zurückbleiben.
 */
export function applyTemplate(db, userId, project, templateId) {
  const template = getTemplate(templateId);
  if (!template) return;

  const root = store
    .listViews(db, userId, { projectId: project.id })
    .find((v) => v.parentId === null);

  // IDs müssen global eindeutig sein (Primärschlüssel), das Template kennt aber
  // nur sprechende Kurznamen. Deterministisch aus der Projekt-ID abgeleitet.
  const nid = (key) => `tpl-${project.id.slice(0, 8)}-${key}`;

  const view = (data) =>
    store.createView(db, userId, { projectId: project.id, parentId: root.id, ...data });

  // store.createNode wendet (anders als die Routen) keine Zod-Defaults an —
  // daher hier einen gültigen Standardstatus für status-lose Nodes (Zonen).
  // `parentId` wird mitübersetzt: Templates arbeiten durchgehend mit Kurz-IDs.
  const node = ({ id, parentId, ...data }) =>
    store.createNode(db, userId, {
      id: nid(id),
      status: 'unknown',
      viewId: root.id,
      ...(parentId ? { parentId: nid(parentId) } : {}),
      ...data,
    });

  // Ohne viewId leitet store.createEdge die Ebene aus dem Quell-Node ab —
  // Templates müssen sie daher nicht mitführen.
  const edge = (sourceId, targetId, options = {}) =>
    store.createEdge(db, userId, {
      sourceId: nid(sourceId),
      targetId: nid(targetId),
      ...options,
    });

  template.build({ root, view, node, edge, nid });
}
