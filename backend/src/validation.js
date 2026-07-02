import { z } from 'zod';
import { STATUS_IDS, LINE_STYLES } from './catalog.js';

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

const optionalText = (max) => z.string().max(max).nullable().optional();

export const nodeCreateSchema = z.object({
  id: idSchema.optional(),
  name: z.string().min(1, 'Name darf nicht leer sein').max(200),
  category: z.string().min(1).max(50).default('generic'),
  status: z.enum(STATUS_IDS).default('unknown'),
  parentId: idSchema.nullable().optional(),
  position: positionSchema.default({ x: 0, y: 0 }),
  width: z.number().positive().max(100000).nullable().optional(),
  height: z.number().positive().max(100000).nullable().optional(),
  ip: optionalText(100),
  vlan: optionalText(100),
  os: optionalText(200),
  hostname: optionalText(255),
  url: optionalText(2000),
  notes: z.string().max(200000).default(''),
  customFields: customFieldsSchema.default({}),
});

export const nodeUpdateSchema = nodeCreateSchema.omit({ id: true }).partial();

export const edgeCreateSchema = z.object({
  id: idSchema.optional(),
  sourceId: idSchema,
  targetId: idSchema,
  label: z.string().max(500).default(''),
  kind: z.string().min(1).max(50).default('generic'),
  lineStyle: z.enum(LINE_STYLES).default('solid'),
  animated: z.boolean().default(false),
  notes: z.string().max(200000).default(''),
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

export const importSchema = z.object({
  mode: z.enum(['replace']).default('replace'),
  nodes: z.array(nodeCreateSchema.extend({ id: idSchema, ...importTimestamps })).max(50000),
  edges: z.array(edgeCreateSchema.extend(importTimestamps)).max(200000).default([]),
});

export const layoutSchema = z.object({
  maxCols: z.number().int().min(1).max(10).default(5),
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
