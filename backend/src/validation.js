import { z } from 'zod';
import { STATUS_IDS, LINE_STYLES, FIELDS_BY_KEY, PACK_IDS } from './catalog/index.js';

/** Scopes eines API-Keys. Hier statt in apiKeys.js, damit es keinen Zirkelimport gibt. */
export const API_KEY_SCOPES = ['read', 'write'];

/**
 * Fehler mit HTTP-Status, wird vom zentralen Error-Handler in JSON übersetzt.
 * `code` ist maschinenlesbar (z. B. "limit_reached", "insufficient_scope") und
 * landet in der Antwort sowie beim MCP-Server im Tool-Fehler.
 */
export class ApiError extends Error {
  constructor(status, message, details, code) {
    super(message);
    this.status = status;
    this.details = details;
    if (code) this.code = code;
  }
}

/**
 * Hinweis zu `.describe()`: Die Beschreibungen sind NUTZERSICHTBAR. Sie landen
 * über backend/src/jsonSchema.js in der OpenAPI-Spezifikation (/api/openapi.json,
 * Doku-Seite /docs) und in den Tool-Schemas des MCP-Servers, die ein KI-Agent
 * liest. Daher Englisch und so formuliert, dass ein Client ohne weiteren
 * Kontext das Feld richtig befüllt. Auf die Validierung haben sie keinen Einfluss.
 */
export const idSchema = z.string().regex(/^[A-Za-z0-9_.:-]{1,64}$/, 'ID darf nur Buchstaben, Zahlen, "_", ".", ":" und "-" enthalten (max. 64 Zeichen)');

const positionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

/** Beschreibung aller ID-Felder, die beim Anlegen optional sind. */
const NEW_ID = 'Stable, readable ID (letters, digits, "_", ".", ":", "-"; max. 64), e.g. "nginx". Generated (UUID) when omitted.';
const COLOR = 'Hex color, e.g. "#38bdf8".';

const customFieldsSchema = z
  .record(z.string().min(1).max(100), z.string().max(4000))
  .refine((obj) => Object.keys(obj).length <= 100, 'At most 100 custom fields per object')
  .describe(
    'Free-form key/value pairs for everything the catalog does not know; the key is the label (max. 100). Replaced as a whole on update.'
  );

/**
 * Typisierte Node-Felder (`node.fields`). Werte werden immer als String gespeichert;
 * die Prüfung richtet sich nach der Definition im Katalog (catalog.js FIELDS).
 *
 * Unbekannte Schlüssel werden bewusst DURCHGELASSEN statt abgelehnt: sonst würde
 * der Import eines Projekts scheitern, dessen Felddefinition diese Instanz (noch)
 * nicht kennt. Sie werden gespeichert und bleiben erhalten, das Panel zeigt sie
 * erst, wenn der Katalog sie kennt.
 *
 * Geprüft wird gegen die VEREINIGUNG aller Packs (catalog/index.js ALL_FIELDS),
 * nicht gegen die Packs des Projekts — sonst würde ein Wert ungültig, sobald
 * jemand ein Pack abwählt.
 *
 * Beeinflusst: catalog/index.js (Quelle der Wahrheit), store.js (Serialisierung
 * nach JSON), frontend/src/components/panel/NodePanel.tsx.
 */
const fieldValueChecks = {
  number: (value) =>
    Number.isFinite(Number(value)) ? null : 'must be a number',
  date: (value) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) ? null : 'must be a date in YYYY-MM-DD format',
  url: (value) =>
    /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? null : 'must start with a scheme such as https://',
};

const fieldsSchema = z
  .record(z.string().min(1).max(100), z.string().max(4000))
  .refine((obj) => Object.keys(obj).length <= 100, 'At most 100 fields per node')
  .describe(
    'Typed fields by catalog key, e.g. {"ip": "10.0.0.5", "os": "Debian 12"}. All values are strings, "" means not set. Keys and types come from the catalog (GET /meta/catalog); unknown keys are kept. Replaced as a whole on update.'
  )
  .superRefine((obj, ctx) => {
    for (const [key, value] of Object.entries(obj)) {
      const def = FIELDS_BY_KEY.get(key);
      // Leerer Wert = Feld nicht gesetzt, jeder Typ akzeptiert das.
      if (!def || value === '') continue;
      if (def.type === 'select') {
        if (!def.options.includes(value)) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `"${def.label}" must be one of: ${def.options.join(', ')}`,
          });
        }
        continue;
      }
      const problem = fieldValueChecks[def.type]?.(value);
      if (problem) {
        ctx.addIssue({ code: 'custom', path: [key], message: `"${def.label}" ${problem}` });
      }
    }
  });

// ── Auth ────────────────────────────────────────────────────────

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address').max(254),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(200, 'Password is too long')
    .describe('At least 8 characters.'),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address').max(254),
  password: z.string().min(1, 'Password must not be empty').max(200),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is missing').max(200),
  newPassword: z
    .string()
    .min(8, 'New password must be at least 8 characters')
    .max(200, 'New password is too long'),
});

export const accountDeleteSchema = z.object({
  password: z.string().min(1, 'Password is missing').max(200),
});

export const projectCreateSchema = z.object({
  id: idSchema.optional().describe(NEW_ID),
  name: z.string().min(1, 'Name must not be empty').max(200).describe('Display name.'),
  color: z.string().max(32).nullable().optional().describe(COLOR),
  icon: z.string().max(50).nullable().optional().describe('Icon name, e.g. "boxes".'),
  sortOrder: z.number().int().optional().describe('Position in the project list (ascending).'),
  /** Aktive Domain-Packs; bestimmt Palette, Panel-Felder und Verbindungsarten. */
  packs: z
    .array(z.enum(PACK_IDS))
    .max(PACK_IDS.length)
    .optional()
    .describe(
      'Active domain packs: decide which categories, fields and edge kinds the project offers (GET /meta/packs). The core pack is always on. Turning a pack off deletes nothing.'
    ),
  /**
   * Nur beim Anlegen: Startinhalt aus backend/src/templates/. Das Template
   * setzt auch die Packs, sofern `packs` nicht ausdrücklich mitgesendet wird.
   */
  template: z
    .string()
    .min(1)
    .max(50)
    .optional()
    .describe(
      'Create only: starter template id (GET /meta/templates), e.g. "homelab" or "empty". Builds its levels, nodes and edges and adopts its packs unless packs is given.'
    ),
});

// `template` ist eine Anlege-Option, kein Feld des Projekts — ein PATCH darf
// den Inhalt eines bestehenden Projekts nicht nachträglich überschreiben.
export const projectUpdateSchema = projectCreateSchema
  .omit({ id: true, template: true })
  .partial();

export const viewCreateSchema = z.object({
  id: idSchema.optional().describe(NEW_ID),
  projectId: idSchema
    .optional()
    .describe('Project of the level. Inherited from parentId when set; default: the first project.'),
  name: z.string().min(1, 'Name must not be empty').max(200).describe('Display name.'),
  parentId: idSchema
    .nullable()
    .optional()
    .describe('Parent level in the drill-down hierarchy (same project); null = root level.'),
  description: z.string().max(200000).default('').describe('Markdown description of the level.'),
  color: z.string().max(32).nullable().optional().describe(COLOR),
  icon: z.string().max(50).nullable().optional().describe('Icon name, e.g. "layers".'),
  sortOrder: z.number().int().optional().describe('Position among its siblings (ascending).'),
});

export const viewUpdateSchema = viewCreateSchema.omit({ id: true }).partial();

export const nodeCreateSchema = z.object({
  id: idSchema.optional().describe(NEW_ID),
  name: z.string().min(1, 'Name must not be empty').max(200).describe('Display name.'),
  category: z
    .string()
    .min(1)
    .max(50)
    .default('generic')
    .describe(
      'Building block, e.g. "database", "hypervisor" or "group" (a zone). Any string is accepted; known ids come from the catalog. Products belong in fields.platform, not here.'
    ),
  status: z.enum(STATUS_IDS).default('unknown').describe('Operational status, set manually or by scripts.'),
  parentId: idSchema
    .nullable()
    .optional()
    .describe(
      'Zone (a node with category "group") containing this node. Must be on the same level; position is then relative to the zone.'
    ),
  viewId: idSchema
    .optional()
    .describe("Level the node belongs to. Default: the parent's level, else the root level of the first project."),
  linkedViewId: idSchema
    .nullable()
    .optional()
    .describe('Drill-down portal: the detail level this node opens. This is how levels are connected, not edges.'),
  position: positionSchema
    .default({ x: 0, y: 0 })
    .describe('Canvas position in px, relative to the parent zone when parentId is set.'),
  width: z.number().positive().max(100000).nullable().optional().describe('Width in px (zones only).'),
  height: z.number().positive().max(100000).nullable().optional().describe('Height in px (zones only).'),
  /**
   * Eigenes Icon statt des Kategorie-Icons: ein Name aus dem Icon-Mapping des
   * Frontends ('server') oder 'asset:<id>' fuer ein hochgeladenes Bild.
   * Bewusst nicht gegen eine Liste geprueft — das Frontend faellt bei
   * unbekannten Namen auf das Kategorie-Icon zurueck, und eine Prueffunktion
   * hier muesste das Icon-Mapping der UI im Backend spiegeln.
   */
  icon: z
    .string()
    .max(100)
    .nullable()
    .optional()
    .describe('Own icon instead of the category icon: an icon name or "asset:<imageId>". null = category icon.'),
  /** Eigene Farbe statt der Kategorie-Farbe; null = Kategorie. */
  color: z.string().max(32).nullable().optional().describe('Own color instead of the category color. null = category color.'),
  fields: fieldsSchema.default({}),
  notes: z.string().max(200000).default('').describe('Markdown documentation (GFM), max. 200 KB.'),
  customFields: customFieldsSchema.default({}),
});

export const nodeUpdateSchema = nodeCreateSchema.omit({ id: true }).partial();

const routingSchema = z
  .object({
    mode: z.enum(['auto', 'manual']).default('auto').describe('"auto" routes around nodes; "manual" follows waypoints.'),
    waypoints: z.array(positionSchema).max(32).default([]).describe('Absolute canvas points for manual routing.'),
    /** Label-Anker auf dem Kantenpfad (0..1 entlang der Linie) */
    labelT: z
      .number()
      .min(0)
      .max(1)
      .nullable()
      .optional()
      .describe('Label position along the line: 0 = source, 1 = target, default 0.5.'),
  })
  .describe('Line routing. Auto-layout resets it on every edge of the level.');

export const edgeCreateSchema = z.object({
  id: idSchema.optional().describe(NEW_ID),
  sourceId: idSchema.describe('Source node ID.'),
  targetId: idSchema.describe('Target node ID. Must be on the same level as the source.'),
  viewId: idSchema.optional().describe('Ignored: an edge always lives on the level of its nodes.'),
  label: z.string().max(500).default('').describe('Text on the line, e.g. "HTTPS :443".'),
  kind: z
    .string()
    .min(1)
    .max(50)
    .default('generic')
    .describe('Connection kind id from the catalog, e.g. "https", "tcp" or "dependency". Any string is accepted.'),
  lineStyle: z.enum(LINE_STYLES).default('solid').describe('Line style.'),
  animated: z.boolean().default(false).describe('Animated line (e.g. for live data flows).'),
  notes: z.string().max(200000).default('').describe('Markdown documentation (GFM).'),
  routing: routingSchema.default({ mode: 'auto', waypoints: [] }),
  customFields: customFieldsSchema.default({}),
});

export const edgeUpdateSchema = edgeCreateSchema.omit({ id: true }).partial();

export const positionsSchema = z.object({
  positions: z
    .array(
      z.object({
        id: idSchema,
        x: z.number().finite(),
        y: z.number().finite(),
        width: z.number().positive().max(100000).nullable().optional(),
        height: z.number().positive().max(100000).nullable().optional(),
      })
    )
    .min(1)
    .max(10000),
});

const importTimestamps = {
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
};

/**
 * Bild im Export/Import. Ohne diesen Teil verlöre ein zwischen Konten geteiltes
 * Projekt seine eigenen Icons — genau der Grund, warum die Bilder in der
 * Datenbank liegen und nicht im Dateisystem.
 */
const assetImportSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(200),
  dataUrl: z.string().min(1).max(8_000_000),
  createdAt: z.string().datetime().optional(),
});

export const importSchema = z.object({
  /** replace = eigene Daten komplett ersetzen; merge = additiv mit neuen IDs anfügen */
  mode: z
    .enum(['replace', 'merge'])
    .default('replace')
    .describe(
      '"replace" deletes ALL of your data and replaces it with the payload. "merge" adds the payload as new projects with fresh IDs and leaves existing data untouched.'
    ),
  assets: z.array(assetImportSchema).max(2000).default([]),
  projects: z.array(projectCreateSchema.extend({ id: idSchema, ...importTimestamps })).max(1000).default([]),
  views: z.array(viewCreateSchema.extend({ id: idSchema, ...importTimestamps })).max(10000).default([]),
  nodes: z.array(nodeCreateSchema.extend({ id: idSchema, ...importTimestamps })).max(50000),
  edges: z.array(edgeCreateSchema.extend(importTimestamps)).max(200000).default([]),
});

/** Upload eines Bildes als Data-URL. Der Typ wird serverseitig an den Magic
 *  Bytes erkannt (backend/src/assets.js), der hier genannte ist unerheblich. */
export const assetCreateSchema = z.object({
  name: z.string().trim().min(1, 'Name must not be empty').max(200).describe('File name, e.g. "proxmox.svg".'),
  // Grosszuegig bemessen: die harte Grenze ist MAX_ASSET_BYTES nach dem
  // Dekodieren, hier faengt nur offensichtlicher Unsinn ab.
  dataUrl: z
    .string()
    .min(1)
    .max(8_000_000)
    .describe(
      'Image as data URL ("data:image/png;base64,…"). The type is detected from the bytes: PNG, JPEG, WebP or SVG. Max. MAX_ASSET_BYTES (default 1 MB).'
    ),
});

/** Anlegen eines Freigabelinks. Beides optional: ohne Angabe laeuft er nie ab. */
export const shareCreateSchema = z.object({
  label: z.string().trim().max(200).default('').describe('Note for yourself, e.g. "For the team".'),
  expiresAt: z.string().datetime().nullable().optional().describe('ISO 8601 expiry; omit or null = never expires.'),
});

/** Anlegen eines API-Keys (backend/src/apiKeys.js). Das Token kommt nur in der Antwort. */
export const apiKeyCreateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name must not be empty')
    .max(100)
    .describe('What the key is for, e.g. "Monitoring script" or "Claude Code".'),
  scope: z
    .enum(API_KEY_SCOPES)
    .default('read')
    .describe('"read" allows GET requests and read-only MCP tools; "write" allows changing data too.'),
  expiresAt: z
    .string()
    .datetime()
    .nullable()
    .optional()
    .describe('ISO 8601 expiry; omit or null for a key that never expires.'),
});

export const layoutSchema = z.object({
  viewId: idSchema.optional().describe('Level to arrange. Default: the root level of the first project.'),
  maxCols: z.number().int().min(1).max(10).default(5).describe('Maximum number of units per row.'),
  profile: z.enum(['default', 'wide']).default('default').describe('"wide" leaves more room for long labels.'),
});

/** Validiert `data` gegen `schema`, wirft bei Fehlern eine ApiError(400). */
export function parseOrThrow(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    }));
    throw new ApiError(400, 'Validation failed', issues);
  }
  return result.data;
}
