/**
 * Tools des MCP-Servers - was ein KI-Agent mit Lab Visualizer tun kann.
 *
 * Jedes Tool ruft dieselben Funktionen wie die REST-Routen (store.js,
 * templates/apply.js) und validiert mit DENSELBEN Zod-Schemas aus
 * validation.js. Eingaben, Fehler, Besitzprüfung und Instanz-Limits verhalten
 * sich daher exakt wie über die REST-API; das JSON-Schema, das der Agent sieht,
 * wird aus dem Zod-Schema erzeugt (backend/src/jsonSchema.js).
 *
 * Bewusst NICHT als Tool angeboten:
 *   - Import/Export als Datei und das Hochladen von Bildern: Massendaten bzw.
 *     base64 gehören nicht in ein Sprachmodell-Kontextfenster.
 *   - Freigabelinks: ein Agent soll nichts ohne Konto öffentlich machen.
 *   - Kontoverwaltung und API-Keys (nur mit Browser-Session, siehe apiKeys.js).
 * Alles davon bleibt über die REST-API erreichbar.
 *
 * Scope: Tools mit `scope: 'write'` sieht und benutzt nur ein Key mit dem
 * Scope "write"; ein read-Key bekommt sie gar nicht erst gelistet.
 *
 * Beeinflusst: backend/src/mcp/server.js (tools/list, tools/call),
 * backend/src/openapi.js (Tool-Liste in der Doku), test/mcp.test.js,
 * AGENTS.md (Abschnitt MCP).
 */
import { z } from 'zod';
import * as store from '../store.js';
import { buildCatalog, STATUS_IDS } from '../catalog/index.js';
import { createProjectWithTemplate } from '../templates/apply.js';
import { toJsonSchema } from '../jsonSchema.js';
import {
  idSchema,
  projectCreateSchema,
  projectUpdateSchema,
  viewCreateSchema,
  viewUpdateSchema,
  nodeCreateSchema,
  nodeUpdateSchema,
  edgeCreateSchema,
  edgeUpdateSchema,
  layoutSchema,
} from '../validation.js';

// ── Annotationen (Hinweise für den Client, z. B. für Freigabe-Dialoge) ──
const READ_ONLY = { readOnlyHint: true, openWorldHint: false };
const CREATE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
// Ein Update überschreibt Werte (fields/customFields sogar als Ganzes) - im
// Sinne der Spezifikation also "destructive", aber wiederholbar.
const UPDATE = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false };
const DELETE = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false };

const projectIdArg = idSchema.describe('Project ID (from list_projects).');
const viewIdArg = idSchema.describe('Level (view) ID (from get_project).');
const nodeIdArg = idSchema.describe('Node ID.');
const edgeIdArg = idSchema.describe('Edge ID.');

/** Katalog ohne die `inactive`-Definitionen - die braucht nur die UI zum Zeichnen. */
function compactCatalog(packs) {
  const { inactive: _inactive, ...catalog } = buildCatalog(packs);
  return catalog;
}

/** Ebenen eines Projekts mit der Anzahl ihrer Nodes und Kanten. */
function viewsWithCounts(db, userId, projectId) {
  const count = (items) =>
    items.reduce((acc, item) => acc.set(item.viewId, (acc.get(item.viewId) ?? 0) + 1), new Map());
  const nodes = count(store.listNodes(db, userId, { projectId }));
  const edges = count(store.listEdges(db, userId, { projectId }));
  return store.listViews(db, userId, { projectId }).map((view) => ({
    ...view,
    nodeCount: nodes.get(view.id) ?? 0,
    edgeCount: edges.get(view.id) ?? 0,
  }));
}

/**
 * Tool-Definition:
 *   name, title, description   was der Agent liest (Englisch, wie die UI)
 *   scope                      'read' | 'write'
 *   input                      Zod-Schema (Validierung UND JSON-Schema)
 *   annotations                MCP-Tool-Annotationen
 *   run(ctx, args)             liefert ein JSON-Objekt; ctx = { db, userId }
 */
export const TOOLS = [
  // ── Lesen ─────────────────────────────────────────────────────
  {
    name: 'list_projects',
    title: 'List projects',
    description:
      'List all projects (separate workspaces) of the account. Start here, then use get_project to see the levels of one project.',
    scope: 'read',
    input: z.object({}),
    annotations: READ_ONLY,
    run: ({ db, userId }) => ({ projects: store.listProjects(db, userId) }),
  },
  {
    name: 'get_project',
    title: 'Get project',
    description:
      'Read one project with its levels (views): the drill-down hierarchy via parentId, plus nodeCount/edgeCount per level. With includeContent=true also returns every node and edge of all levels in one call.',
    scope: 'read',
    input: z.object({
      projectId: projectIdArg,
      includeContent: z
        .boolean()
        .default(false)
        .describe('Also return all nodes and edges of the project (can be large).'),
    }),
    annotations: READ_ONLY,
    run: ({ db, userId }, { projectId, includeContent }) => {
      const project = store.getProject(db, userId, projectId);
      const result = { project, views: viewsWithCounts(db, userId, projectId) };
      if (includeContent) {
        result.nodes = store.listNodes(db, userId, { projectId });
        result.edges = store.listEdges(db, userId, { projectId });
      }
      return result;
    },
  },
  {
    name: 'get_catalog',
    title: 'Get catalog',
    description:
      'Valid node categories, statuses, edge kinds, line styles and typed field definitions (key, label, type, options). With projectId: only what that project offers (its domain packs). Use these ids and keys when creating nodes and edges.',
    scope: 'read',
    input: z.object({
      projectId: idSchema
        .optional()
        .describe('Restrict to the packs of this project. Omit for the complete catalog.'),
    }),
    annotations: READ_ONLY,
    run: ({ db, userId }, { projectId }) =>
      compactCatalog(projectId ? store.getProject(db, userId, projectId).packs : null),
  },
  {
    name: 'get_graph',
    title: 'Get level graph',
    description:
      'Read one level (view) with all its nodes and edges. Child positions are relative to their parent zone.',
    scope: 'read',
    input: z.object({
      viewId: idSchema
        .optional()
        .describe('Level ID (from get_project). Default: the root level of the first project.'),
    }),
    annotations: READ_ONLY,
    run: ({ db, userId }, { viewId }) => {
      const graph = store.getGraph(db, userId, viewId);
      return {
        view: graph.viewId ? store.getView(db, userId, graph.viewId) : null,
        nodes: graph.nodes,
        edges: graph.edges,
      };
    },
  },
  {
    name: 'search_nodes',
    title: 'Search nodes',
    description:
      'Find nodes by text and/or filters. The query matches the name and all field and custom field VALUES (e.g. an IP address or "Debian"), not field keys. Combine with projectId to search every level of a project.',
    scope: 'read',
    input: z.object({
      query: z.string().max(200).optional().describe('Text to search for (case-insensitive substring).'),
      projectId: idSchema.optional().describe('Only nodes of this project (all levels).'),
      viewId: idSchema.optional().describe('Only nodes of this level.'),
      category: z.string().max(50).optional().describe('Only this category id.'),
      status: z.enum(STATUS_IDS).optional().describe('Only this status.'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(500)
        .default(100)
        .describe('Maximum number of nodes to return; "total" tells how many matched.'),
    }),
    annotations: READ_ONLY,
    // Begrenzt, weil ein Treffer samt Notizen groß sein kann - ein ungefiltertes
    // Ergebnis soll das Kontextfenster des Agenten nicht sprengen.
    run: ({ db, userId }, { query, limit, ...filters }) => {
      const nodes = store.listNodes(db, userId, { q: query, ...filters });
      return { nodes: nodes.slice(0, limit), total: nodes.length, truncated: nodes.length > limit };
    },
  },
  {
    name: 'get_node',
    title: 'Get node',
    description: 'Read one node with all fields and notes, plus every edge connected to it.',
    scope: 'read',
    input: z.object({ nodeId: nodeIdArg }),
    annotations: READ_ONLY,
    run: ({ db, userId }, { nodeId }) => ({
      node: store.getNode(db, userId, nodeId),
      edges: store.listEdges(db, userId, { nodeId }),
    }),
  },

  // ── Projekte ──────────────────────────────────────────────────
  {
    name: 'create_project',
    title: 'Create project',
    description:
      'Create a new project with an empty root level. With template (e.g. "homelab", "network", "cloud", "kubernetes", "software", "business", "empty") the starter content and its domain packs are created too.',
    scope: 'write',
    input: projectCreateSchema,
    annotations: CREATE,
    run: ({ db, userId }, args) => ({ project: createProjectWithTemplate(db, userId, args) }),
  },
  {
    name: 'update_project',
    title: 'Update project',
    description:
      'Rename a project or change its color, icon, order or domain packs. Only the given properties change. Turning a pack off deletes no data.',
    scope: 'write',
    input: z.object({ projectId: projectIdArg }).merge(projectUpdateSchema),
    annotations: UPDATE,
    run: ({ db, userId }, { projectId, ...patch }) => ({
      project: store.updateProject(db, userId, projectId, patch),
    }),
  },
  {
    name: 'delete_project',
    title: 'Delete project',
    description:
      'Permanently delete a project with ALL its levels, nodes and edges. Cannot be undone. The last remaining project cannot be deleted.',
    scope: 'write',
    input: z.object({ projectId: projectIdArg }),
    annotations: DELETE,
    run: ({ db, userId }, { projectId }) => ({
      deleted: store.deleteProject(db, userId, projectId),
    }),
  },

  // ── Ebenen ────────────────────────────────────────────────────
  {
    name: 'create_view',
    title: 'Create level',
    description:
      'Create a level (view) - a separate canvas in the drill-down hierarchy, e.g. "Server internals" below the overview. To make a node open it, set that node\'s linkedViewId to the new level.',
    scope: 'write',
    input: viewCreateSchema,
    annotations: CREATE,
    run: ({ db, userId }, args) => ({ view: store.createView(db, userId, args) }),
  },
  {
    name: 'update_view',
    title: 'Update level',
    description: 'Rename a level, change its description, styling or parent level. Only the given properties change.',
    scope: 'write',
    input: z.object({ viewId: viewIdArg }).merge(viewUpdateSchema.omit({ projectId: true })),
    annotations: UPDATE,
    run: ({ db, userId }, { viewId, ...patch }) => ({ view: store.updateView(db, userId, viewId, patch) }),
  },
  {
    name: 'delete_view',
    title: 'Delete level',
    description:
      'Permanently delete a level including all its sub-levels and their nodes and edges. Cannot be undone. The last level of a project cannot be deleted.',
    scope: 'write',
    input: z.object({ viewId: viewIdArg }),
    annotations: DELETE,
    run: ({ db, userId }, { viewId }) => ({ deleted: store.deleteView(db, userId, viewId) }),
  },

  // ── Nodes ─────────────────────────────────────────────────────
  {
    name: 'create_node',
    title: 'Create node',
    description:
      'Create a node (server, service, device, zone …) on a level. Take category ids and field keys from get_catalog. Zones: category "group" with width/height; create the zone first and put children in it via parentId (their position is then relative to the zone). Without positions, call auto_layout for the level afterwards.',
    scope: 'write',
    input: nodeCreateSchema,
    annotations: CREATE,
    run: ({ db, userId }, args) => ({ node: store.createNode(db, userId, args) }),
  },
  {
    name: 'update_node',
    title: 'Update node',
    description:
      'Partially update a node, e.g. its status. Only the given properties change - BUT fields and customFields are replaced as a whole: read the node with get_node and send the complete object. Changing viewId moves the node with its children to another level and drops edges that would cross levels.',
    scope: 'write',
    input: z.object({ nodeId: nodeIdArg }).merge(nodeUpdateSchema),
    annotations: UPDATE,
    run: ({ db, userId }, { nodeId, ...patch }) => ({ node: store.updateNode(db, userId, nodeId, patch) }),
  },
  {
    name: 'delete_node',
    title: 'Delete node',
    description:
      'Permanently delete a node. Its edges are removed; its children move to the node\'s parent without jumping on the canvas.',
    scope: 'write',
    input: z.object({ nodeId: nodeIdArg }),
    annotations: DELETE,
    run: ({ db, userId }, { nodeId }) => {
      store.deleteNode(db, userId, nodeId);
      return { deleted: { node: nodeId } };
    },
  },

  // ── Kanten ────────────────────────────────────────────────────
  {
    name: 'create_edge',
    title: 'Create edge',
    description:
      'Connect two nodes on the SAME level (e.g. a dependency or network connection). Cross-level relationships are modeled with a node\'s linkedViewId, not with edges. Take kind from the edge kinds in get_catalog.',
    scope: 'write',
    input: edgeCreateSchema.omit({ viewId: true }),
    annotations: CREATE,
    run: ({ db, userId }, args) => ({ edge: store.createEdge(db, userId, args) }),
  },
  {
    name: 'update_edge',
    title: 'Update edge',
    description:
      'Partially update an edge: label, kind, style, endpoints or notes. customFields is replaced as a whole. New endpoints must be on the same level.',
    scope: 'write',
    input: z.object({ edgeId: edgeIdArg }).merge(edgeUpdateSchema.omit({ viewId: true })),
    annotations: UPDATE,
    run: ({ db, userId }, { edgeId, ...patch }) => ({ edge: store.updateEdge(db, userId, edgeId, patch) }),
  },
  {
    name: 'delete_edge',
    title: 'Delete edge',
    description: 'Permanently delete an edge.',
    scope: 'write',
    input: z.object({ edgeId: edgeIdArg }),
    annotations: DELETE,
    run: ({ db, userId }, { edgeId }) => {
      store.deleteEdge(db, userId, edgeId);
      return { deleted: { edge: edgeId } };
    },
  },

  // ── Layout ────────────────────────────────────────────────────
  {
    name: 'auto_layout',
    title: 'Auto-arrange level',
    description:
      'Arrange all nodes of one level automatically and deterministically (layers along the edges, zones sized to fit). Overwrites positions and resets manual edge routing. Use it after creating several nodes without positions.',
    scope: 'write',
    input: layoutSchema,
    annotations: UPDATE,
    run: ({ db, userId }, args) => store.applyLayout(db, userId, args),
  },
];

export const TOOLS_BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]));

/** Darf ein Key mit `scope` dieses Tool benutzen? */
export const toolAllowed = (tool, scope) => tool.scope === 'read' || scope === 'write';

/**
 * Tool-Beschreibungen für tools/list (MCP-Format), gefiltert nach Scope. Das
 * JSON-Schema wird einmal erzeugt und zwischengespeichert.
 */
const DESCRIPTORS = new Map(
  TOOLS.map((tool) => [
    tool.name,
    {
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: toJsonSchema(tool.input),
      annotations: { title: tool.title, ...tool.annotations },
    },
  ])
);

export function listToolDescriptors(scope) {
  return TOOLS.filter((tool) => toolAllowed(tool, scope)).map((tool) => DESCRIPTORS.get(tool.name));
}
