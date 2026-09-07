import { z } from 'zod';
import { STATUS_IDS, LINE_STYLES, FIELDS_BY_KEY, PACK_IDS } from './catalog/index.js';

/** Fehler mit HTTP-Status, wird vom zentralen Error-Handler in JSON übersetzt. */
export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const idSchema = z.string().regex(/^[A-Za-z0-9_.:-]{1,64}$/, 'ID darf nur Buchstaben, Zahlen, "_", ".", ":" und "-" enthalten (max. 64 Zeichen)');

const positionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

const customFieldsSchema = z
  .record(z.string().min(1).max(100), z.string().max(4000))
  .refine((obj) => Object.keys(obj).length <= 100, 'Maximal 100 Custom Fields pro Objekt');

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
    Number.isFinite(Number(value)) ? null : 'muss eine Zahl sein',
  date: (value) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) ? null : 'muss ein Datum im Format JJJJ-MM-TT sein',
  url: (value) =>
    /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? null : 'muss mit einem Schema wie https:// beginnen',
};

const fieldsSchema = z
  .record(z.string().min(1).max(100), z.string().max(4000))
  .refine((obj) => Object.keys(obj).length <= 100, 'Maximal 100 Felder pro Node')
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
            message: `"${def.label}" muss einer von: ${def.options.join(', ')} sein`,
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
  email: z.string().trim().toLowerCase().email('Ungültige E-Mail-Adresse').max(254),
  password: z
    .string()
    .min(8, 'Passwort muss mindestens 8 Zeichen haben')
    .max(200, 'Passwort ist zu lang'),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Ungültige E-Mail-Adresse').max(254),
  password: z.string().min(1, 'Passwort darf nicht leer sein').max(200),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, 'Aktuelles Passwort fehlt').max(200),
  newPassword: z
    .string()
    .min(8, 'Neues Passwort muss mindestens 8 Zeichen haben')
    .max(200, 'Neues Passwort ist zu lang'),
});

export const accountDeleteSchema = z.object({
  password: z.string().min(1, 'Passwort fehlt').max(200),
});

export const projectCreateSchema = z.object({
  id: idSchema.optional(),
  name: z.string().min(1, 'Name darf nicht leer sein').max(200),
  color: z.string().max(32).nullable().optional(),
  icon: z.string().max(50).nullable().optional(),
  sortOrder: z.number().int().optional(),
  /** Aktive Domain-Packs; bestimmt Palette, Panel-Felder und Verbindungsarten. */
  packs: z.array(z.enum(PACK_IDS)).max(PACK_IDS.length).optional(),
  /**
   * Nur beim Anlegen: Startinhalt aus backend/src/templates/. Das Template
   * setzt auch die Packs, sofern `packs` nicht ausdrücklich mitgesendet wird.
   */
  template: z.string().min(1).max(50).optional(),
});

// `template` ist eine Anlege-Option, kein Feld des Projekts — ein PATCH darf
// den Inhalt eines bestehenden Projekts nicht nachträglich überschreiben.
export const projectUpdateSchema = projectCreateSchema
  .omit({ id: true, template: true })
  .partial();

export const viewCreateSchema = z.object({
  id: idSchema.optional(),
  projectId: idSchema.optional(),
  name: z.string().min(1, 'Name darf nicht leer sein').max(200),
  parentId: idSchema.nullable().optional(),
  description: z.string().max(200000).default(''),
  color: z.string().max(32).nullable().optional(),
  icon: z.string().max(50).nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export const viewUpdateSchema = viewCreateSchema.omit({ id: true }).partial();

export const nodeCreateSchema = z.object({
  id: idSchema.optional(),
  name: z.string().min(1, 'Name darf nicht leer sein').max(200),
  category: z.string().min(1).max(50).default('generic'),
  status: z.enum(STATUS_IDS).default('unknown'),
  parentId: idSchema.nullable().optional(),
  viewId: idSchema.optional(),
  linkedViewId: idSchema.nullable().optional(),
  position: positionSchema.default({ x: 0, y: 0 }),
  width: z.number().positive().max(100000).nullable().optional(),
  height: z.number().positive().max(100000).nullable().optional(),
  /**
   * Eigenes Icon statt des Kategorie-Icons: ein Name aus dem Icon-Mapping des
   * Frontends ('server') oder 'asset:<id>' fuer ein hochgeladenes Bild.
   * Bewusst nicht gegen eine Liste geprueft — das Frontend faellt bei
   * unbekannten Namen auf das Kategorie-Icon zurueck, und eine Prueffunktion
   * hier muesste das Icon-Mapping der UI im Backend spiegeln.
   */
  icon: z.string().max(100).nullable().optional(),
  /** Eigene Farbe statt der Kategorie-Farbe; null = Kategorie. */
  color: z.string().max(32).nullable().optional(),
  fields: fieldsSchema.default({}),
  notes: z.string().max(200000).default(''),
  customFields: customFieldsSchema.default({}),
});

export const nodeUpdateSchema = nodeCreateSchema.omit({ id: true }).partial();

const routingSchema = z.object({
  mode: z.enum(['auto', 'manual']).default('auto'),
  waypoints: z.array(positionSchema).max(32).default([]),
  /** Label-Anker auf dem Kantenpfad (0..1 entlang der Linie) */
  labelT: z.number().min(0).max(1).nullable().optional(),
});

export const edgeCreateSchema = z.object({
  id: idSchema.optional(),
  sourceId: idSchema,
  targetId: idSchema,
  viewId: idSchema.optional(),
  label: z.string().max(500).default(''),
  kind: z.string().min(1).max(50).default('generic'),
  lineStyle: z.enum(LINE_STYLES).default('solid'),
  animated: z.boolean().default(false),
  notes: z.string().max(200000).default(''),
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
  mode: z.enum(['replace', 'merge']).default('replace'),
  assets: z.array(assetImportSchema).max(2000).default([]),
  projects: z.array(projectCreateSchema.extend({ id: idSchema, ...importTimestamps })).max(1000).default([]),
  views: z.array(viewCreateSchema.extend({ id: idSchema, ...importTimestamps })).max(10000).default([]),
  nodes: z.array(nodeCreateSchema.extend({ id: idSchema, ...importTimestamps })).max(50000),
  edges: z.array(edgeCreateSchema.extend(importTimestamps)).max(200000).default([]),
});

/** Upload eines Bildes als Data-URL. Der Typ wird serverseitig an den Magic
 *  Bytes erkannt (backend/src/assets.js), der hier genannte ist unerheblich. */
export const assetCreateSchema = z.object({
  name: z.string().trim().min(1, 'Name darf nicht leer sein').max(200),
  // Grosszuegig bemessen: die harte Grenze ist MAX_ASSET_BYTES nach dem
  // Dekodieren, hier faengt nur offensichtlicher Unsinn ab.
  dataUrl: z.string().min(1).max(8_000_000),
});

/** Anlegen eines Freigabelinks. Beides optional: ohne Angabe laeuft er nie ab. */
export const shareCreateSchema = z.object({
  label: z.string().trim().max(200).default(''),
  expiresAt: z.string().datetime().nullable().optional(),
});

export const layoutSchema = z.object({
  viewId: idSchema.optional(),
  maxCols: z.number().int().min(1).max(10).default(5),
  profile: z.enum(['default', 'wide']).default('default'),
});

/** Validiert `data` gegen `schema`, wirft bei Fehlern eine ApiError(400). */
export function parseOrThrow(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    }));
    throw new ApiError(400, 'Validierung fehlgeschlagen', issues);
  }
  return result.data;
}
