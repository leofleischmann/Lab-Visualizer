/**
 * Lesehilfen für die OpenAPI-Spezifikation (GET /api/openapi.json) - reine
 * Funktionen ohne React, damit die Doku-Seite schlank bleibt und testbar ist.
 *
 * Die Spezifikation baut backend/src/openapi.js; die Request-Schemas stammen
 * dort aus den Zod-Schemas. Eigene Erweiterungen, die hier gelesen werden:
 *   x-auth      public | read | write | session | apiKey (Zugriffsstufe)
 *   x-alias-of  PUT ist ein Alias von PATCH und wird nicht doppelt gezeigt
 *   x-mcp       Protokollversionen und Tool-Liste des MCP-Servers
 *
 * Beeinflusst: components/docs/*, backend/src/openapi.js (Erweiterungen).
 */

export type JsonSchema = {
  $ref?: string;
  type?: string | string[];
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  additionalProperties?: boolean | JsonSchema;
  enum?: unknown[];
  const?: unknown;
  default?: unknown;
  examples?: unknown[];
  format?: string;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  minItems?: number;
  maxItems?: number;
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
};

export type AuthLevel = 'public' | 'read' | 'write' | 'session' | 'apiKey';

export type Parameter = {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required?: boolean;
  description?: string;
  schema: JsonSchema;
};

export type ResponseObject = {
  description: string;
  content?: Record<string, { schema?: JsonSchema }>;
};

export type McpTool = {
  name: string;
  title: string;
  description: string;
  scope: 'read' | 'write';
  destructive: boolean;
};

export type Operation = {
  tags: string[];
  summary: string;
  description?: string;
  operationId: string;
  'x-auth': AuthLevel;
  'x-alias-of'?: string;
  'x-mcp'?: { protocolVersions: string[]; tools: McpTool[] };
  parameters?: Parameter[];
  requestBody?: { content: Record<string, { schema: JsonSchema; example?: unknown }> };
  responses: Record<string, ResponseObject | { $ref: string }>;
};

export const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export type OpenApiDoc = {
  openapi: string;
  info: { title: string; version: string; description?: string };
  servers: { url: string }[];
  tags: { name: string; description?: string }[];
  paths: Record<string, Partial<Record<HttpMethod, Operation>>>;
  components: {
    schemas: Record<string, JsonSchema>;
    responses: Record<string, ResponseObject>;
  };
};

export type OperationEntry = {
  method: HttpMethod;
  path: string;
  op: Operation;
  /** Weitere Methoden mit identischem Verhalten (PUT neben PATCH). */
  aliases: HttpMethod[];
};

/** Prüft grob, ob die Antwort wirklich eine OpenAPI-Spezifikation ist. */
export function isOpenApiDoc(value: unknown): value is OpenApiDoc {
  const doc = value as Partial<OpenApiDoc> | null;
  return !!doc && typeof doc.openapi === 'string' && !!doc.paths && !!doc.components?.schemas;
}

export const refName = (ref: string) => ref.slice(ref.lastIndexOf('/') + 1);

/** Folgt einem $ref auf components/schemas; alles andere bleibt, wie es ist. */
export function resolveSchema(doc: OpenApiDoc, schema: JsonSchema | undefined): JsonSchema | undefined {
  if (!schema?.$ref) return schema;
  return doc.components.schemas[refName(schema.$ref)];
}

export function resolveResponse(doc: OpenApiDoc, response: ResponseObject | { $ref: string }): ResponseObject {
  if ('$ref' in response) return doc.components.responses[refName(response.$ref)];
  return response;
}

/** Operationen gruppiert nach Tag, in der Reihenfolge der Tag-Liste. */
export function operationsByTag(doc: OpenApiDoc) {
  const groups = new Map(doc.tags.map((t) => [t.name, { ...t, operations: [] as OperationEntry[] }]));
  for (const [path, item] of Object.entries(doc.paths)) {
    for (const method of HTTP_METHODS) {
      const op = item[method];
      if (!op || op['x-alias-of']) continue;
      const aliases = HTTP_METHODS.filter((m) => item[m]?.['x-alias-of'] === method);
      groups.get(op.tags[0])?.operations.push({ method, path, op, aliases });
    }
  }
  return [...groups.values()].filter((g) => g.operations.length > 0);
}

/** Kurze Typangabe, z. B. "string | null", "Node[]", "map<string, string>". */
export function typeLabel(schema: JsonSchema | undefined): string {
  if (!schema) return 'any';
  if (schema.$ref) return refName(schema.$ref);
  if (schema.oneOf || schema.anyOf) return (schema.oneOf ?? schema.anyOf)!.map(typeLabel).join(' | ');
  if (schema.const !== undefined) return JSON.stringify(schema.const);
  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  const labels = types.map((type) => {
    if (type === 'array') return `${typeLabel(schema.items)}[]`;
    if (type === 'object' && typeof schema.additionalProperties === 'object') {
      return `map<string, ${typeLabel(schema.additionalProperties)}>`;
    }
    if (type === 'string' && schema.format && schema.format !== 'binary') return `string (${schema.format})`;
    return type;
  });
  return labels.join(' | ') || 'any';
}

/** Einschränkungen als lesbare Kurztexte. */
export function constraintsOf(schema: JsonSchema): string[] {
  const out: string[] = [];
  const values = schema.enum ?? (schema.type === 'array' ? schema.items?.enum : undefined);
  if (values) out.push(`one of: ${values.map((v) => JSON.stringify(v)).join(', ')}`);
  if (schema.default !== undefined) out.push(`default: ${JSON.stringify(schema.default)}`);
  if (schema.minLength !== undefined && schema.minLength > 0) out.push(`min. ${schema.minLength} chars`);
  if (schema.maxLength !== undefined) out.push(`max. ${schema.maxLength} chars`);
  if (schema.minimum !== undefined) out.push(`≥ ${schema.minimum}`);
  if (schema.exclusiveMinimum !== undefined) out.push(`> ${schema.exclusiveMinimum}`);
  if (schema.maximum !== undefined) out.push(`≤ ${schema.maximum}`);
  if (schema.exclusiveMaximum !== undefined) out.push(`< ${schema.exclusiveMaximum}`);
  if (schema.minItems) out.push(`min. ${schema.minItems} items`);
  if (schema.maxItems !== undefined) out.push(`max. ${schema.maxItems} items`);
  if (schema.pattern) out.push(`pattern: ${schema.pattern}`);
  return out;
}

export type SchemaRow = {
  /** Punkt-Pfad, z. B. "routing.waypoints". */
  name: string;
  depth: number;
  type: string;
  required: boolean;
  description?: string;
  constraints: string[];
};

/**
 * Eigenschaften eines Objekt-Schemas als Tabellenzeilen. Inline-Objekte und
 * Arrays aus Inline-Objekten werden bis `maxDepth` aufgeklappt, referenzierte
 * Schemas (Node, Edge …) nicht - die stehen als eigener Eintrag im Abschnitt
 * "Schemas".
 */
export function schemaRows(doc: OpenApiDoc, schema: JsonSchema | undefined, maxDepth = 2): SchemaRow[] {
  const rows: SchemaRow[] = [];
  const walk = (current: JsonSchema | undefined, prefix: string, depth: number) => {
    const resolved = depth === 0 ? resolveSchema(doc, current) : current;
    if (!resolved?.properties) return;
    const required = new Set(resolved.required ?? []);
    for (const [key, prop] of Object.entries(resolved.properties)) {
      const name = prefix ? `${prefix}.${key}` : key;
      rows.push({
        name,
        depth,
        type: typeLabel(prop),
        required: required.has(key),
        description: prop.description,
        constraints: constraintsOf(prop),
      });
      if (depth + 1 >= maxDepth) continue;
      if (!prop.$ref && prop.properties) walk(prop, name, depth + 1);
      // Arrays aus Inline-Objekten (z. B. positions[]) ebenso aufklappen.
      else if (prop.items && !prop.items.$ref && prop.items.properties) walk(prop.items, `${name}[]`, depth + 1);
    }
  };
  walk(schema, '', 0);
  return rows;
}

/** Beispiel-Body: das hinterlegte Beispiel, sonst ein Gerüst aus den Pflichtfeldern. */
export function exampleBody(doc: OpenApiDoc, schema: JsonSchema | undefined): unknown {
  const resolved = resolveSchema(doc, schema);
  if (!resolved) return undefined;
  if (resolved.examples?.length) return resolved.examples[0];
  if (resolved.oneOf) return exampleBody(doc, resolved.oneOf[0]);
  if (!resolved.properties) return undefined;
  const skeleton: Record<string, unknown> = {};
  for (const key of resolved.required ?? []) {
    const prop = resolved.properties[key];
    skeleton[key] = prop?.default ?? prop?.enum?.[0] ?? (prop?.type === 'string' ? `<${key}>` : null);
  }
  return skeleton;
}

/** Shell-sicheres Einfassen in einfache Anführungszeichen. */
const shellQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;

/**
 * curl-Aufruf für eine Operation. Der Key steht als Umgebungsvariable drin,
 * damit niemand ihn versehentlich in die Shell-History kopiert.
 */
export function curlExample(doc: OpenApiDoc, entry: OperationEntry, origin: string): string {
  const { method, path, op } = entry;
  const base = `${origin.replace(/\/+$/, '')}${doc.servers[0]?.url ?? '/api'}`;
  const url = `${base}${path}`.replace(/\{(\w+)\}/g, (_m, name: string) => `<${name}>`);
  const lines = [`curl -X ${method.toUpperCase()} ${shellQuote(url)}`];
  const auth = op['x-auth'];
  if (auth === 'read' || auth === 'write' || auth === 'apiKey') {
    lines.push(`-H "Authorization: Bearer $LABVIZ_API_KEY"`);
  } else if (auth === 'session') {
    lines.push('-b cookies.txt');
  }
  const body = op.requestBody?.content['application/json'];
  if (body) {
    const example = body.example ?? exampleBody(doc, body.schema);
    lines.push(`-H 'Content-Type: application/json'`);
    if (example !== undefined) lines.push(`-d ${shellQuote(JSON.stringify(example))}`);
  }
  return lines.join(' \\\n  ');
}

/** Bezeichnung und Erklärung der Zugriffsstufen (Badge auf jeder Operation). */
export const AUTH_LEVELS: Record<AuthLevel, { label: string; hint: string }> = {
  public: { label: 'public', hint: 'No authentication.' },
  read: { label: 'read', hint: 'API key (any scope) or session.' },
  write: { label: 'write', hint: 'API key with scope "write", or session.' },
  session: { label: 'web app only', hint: 'Session cookie only - API keys are rejected.' },
  apiKey: { label: 'API key', hint: 'API key only (Authorization: Bearer).' },
};
