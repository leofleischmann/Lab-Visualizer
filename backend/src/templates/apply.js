/**
 * Wendet ein Template auf ein frisch angelegtes Projekt an.
 *
 * Bewusst getrennt von der Registry (./index.js): nur dieses Modul braucht
 * store.js. Die Registry bleibt dadurch abhängigkeitsfrei und über die
 * Paketgrenze lesbar — siehe Kopfkommentar dort.
 *
 * WICHTIG: store.js darf NIEMALS Templates importieren (Zirkelbezug).
 * Angewendet wird ein Template deshalb in der Route, nicht in
 * store.createProject.
 *
 * Beeinflusst: backend/src/routes/projects.js (POST /projects mit `template`),
 * backend/src/mcp/tools.js (create_project), backend/src/seed.js (Registrierung).
 */
import * as store from '../store.js';
import { getTemplate } from './index.js';
import { assertTemplateFitsLimits } from '../limits.js';
import { ApiError } from '../validation.js';

/**
 * Legt ein Projekt an - mit `template` zusätzlich dessen Startinhalt (Ebenen,
 * Nodes, Kanten). Ohne ausdrückliche `packs` übernimmt das Projekt die des
 * Templates. Gemeinsamer Weg für POST /api/projects und das MCP-Tool
 * `create_project`, damit beide sich nicht auseinanderentwickeln.
 *
 * Projekt und Template-Inhalt entstehen in EINER Transaktion: läuft der Aufbau
 * in ein Limit oder einen Validierungsfehler, bleibt kein halbes Projekt zurück.
 *
 * Beeinflusst: backend/src/routes/projects.js, backend/src/mcp/tools.js.
 */
export function createProjectWithTemplate(db, userId, { template: templateId, ...data }) {
  if (!templateId) return store.createProject(db, userId, data);
  const template = getTemplate(templateId);
  if (!template) throw new ApiError(400, `Unknown template "${templateId}"`);
  assertTemplateFitsLimits(template);
  return db.transaction(() => {
    const project = store.createProject(db, userId, {
      ...data,
      packs: data.packs ?? template.packs,
    });
    applyTemplate(db, userId, project, templateId);
    return store.getProject(db, userId, project.id);
  })();
}

/**
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
