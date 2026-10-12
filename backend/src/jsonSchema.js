/**
 * Zod (v3) -> JSON Schema (Draft 2020-12) für die Teilmenge, die validation.js nutzt.
 *
 * Wozu: validation.js ist die EINZIGE Quelle der Wahrheit für Request-Formen.
 * Die OpenAPI-Spezifikation (backend/src/openapi.js) und die Tool-Schemas des
 * MCP-Servers (backend/src/mcp/tools.js) werden daraus erzeugt statt von Hand
 * gepflegt - sonst veraltet die Doku bei jeder Schemaänderung still.
 *
 * Bewusst ohne Dependency (zod-to-json-schema): die benötigte Teilmenge ist
 * klein, und das Backend kommt absichtlich mit wenigen Paketen aus.
 *
 * Unbekannte Zod-Typen WERFEN, statt ein leeres Schema zu liefern: ein neuer
 * Typ in validation.js fällt so sofort in test/openapi.test.js auf und nicht
 * erst, wenn ein Client an einem nichtssagenden Schema scheitert.
 *
 * Nicht abbildbar sind refine/superRefine (z. B. "max. 100 Custom Fields",
 * Feldtypen aus dem Katalog). Die prüft weiterhin nur der Server; im Schema
 * steht das Basisschema.
 *
 * Beeinflusst: backend/src/openapi.js, backend/src/mcp/tools.js. Ein Upgrade
 * auf Zod 4 braucht hier eine Anpassung (dort gibt es z.toJSONSchema()).
 */

const STRING_FORMATS = { email: 'email', url: 'uri', uuid: 'uuid', datetime: 'date-time' };

function stringSchema(def) {
  const out = { type: 'string' };
  for (const check of def.checks) {
    if (check.kind === 'min') out.minLength = check.value;
    else if (check.kind === 'max') out.maxLength = check.value;
    else if (check.kind === 'length') out.minLength = out.maxLength = check.value;
    else if (check.kind === 'regex') out.pattern = check.regex.source;
    else if (STRING_FORMATS[check.kind]) out.format = STRING_FORMATS[check.kind];
    // trim/toLowerCase u. ä. normalisieren nur, sie schränken nichts ein.
  }
  return out;
}

function numberSchema(def) {
  const out = { type: 'number' };
  for (const check of def.checks) {
    if (check.kind === 'int') out.type = 'integer';
    else if (check.kind === 'min') out[check.inclusive ? 'minimum' : 'exclusiveMinimum'] = check.value;
    else if (check.kind === 'max') out[check.inclusive ? 'maximum' : 'exclusiveMaximum'] = check.value;
    else if (check.kind === 'multipleOf') out.multipleOf = check.value;
  }
  return out;
}

/** `null` zusätzlich erlauben - als Typ-Array, wo das geht, sonst per anyOf. */
function nullable(schema) {
  if (typeof schema.type === 'string') {
    const out = { ...schema, type: [schema.type, 'null'] };
    if (schema.enum) out.enum = [...schema.enum, null];
    return out;
  }
  return { anyOf: [schema, { type: 'null' }] };
}

function objectSchema(schema) {
  const properties = {};
  const required = [];
  for (const [key, value] of Object.entries(schema.shape)) {
    properties[key] = convert(value);
    // isOptional() = "undefined wird akzeptiert" - gilt für .optional() und .default().
    if (!value.isOptional()) required.push(key);
  }
  return {
    type: 'object',
    properties,
    ...(required.length ? { required } : {}),
    // Zod verwirft unbekannte Schlüssel stillschweigend; für Clients heißt das:
    // nur die dokumentierten Felder senden.
    additionalProperties: false,
  };
}

function convert(schema) {
  const def = schema._def;
  let out;
  switch (def.typeName) {
    case 'ZodOptional':
      out = convert(def.innerType);
      break;
    case 'ZodDefault':
      out = { ...convert(def.innerType), default: def.defaultValue() };
      break;
    case 'ZodNullable':
      out = nullable(convert(def.innerType));
      break;
    case 'ZodEffects':
      out = convert(def.schema);
      break;
    case 'ZodString':
      out = stringSchema(def);
      break;
    case 'ZodNumber':
      out = numberSchema(def);
      break;
    case 'ZodBoolean':
      out = { type: 'boolean' };
      break;
    case 'ZodEnum':
      out = { type: 'string', enum: [...def.values] };
      break;
    case 'ZodArray':
      out = { type: 'array', items: convert(def.type) };
      if (def.minLength) out.minItems = def.minLength.value;
      if (def.maxLength) out.maxItems = def.maxLength.value;
      break;
    case 'ZodRecord': {
      const keys = convert(def.keyType);
      out = { type: 'object', additionalProperties: convert(def.valueType) };
      const { type: _type, ...keyConstraints } = keys;
      if (Object.keys(keyConstraints).length) out.propertyNames = keyConstraints;
      break;
    }
    case 'ZodObject':
      out = objectSchema(schema);
      break;
    default:
      throw new Error(`toJsonSchema: unsupported Zod type "${def.typeName}"`);
  }
  // Die äußerste Beschreibung gewinnt (sie wird zuletzt gesetzt).
  if (def.description) out = { ...out, description: def.description };
  return out;
}

/**
 * Wandelt ein Zod-Schema in ein JSON-Schema um. Beschreibt die EINGABE: Felder
 * mit Default sind optional und tragen ihren Default.
 */
export function toJsonSchema(schema) {
  return convert(schema);
}
