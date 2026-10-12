import { schemaRows, type JsonSchema, type OpenApiDoc } from '../../lib/openapi';

/**
 * Eigenschaften eines JSON-Schemas als Tabelle (Request-Bodies, Datenmodelle).
 * Referenzierte Schemas erscheinen als Link auf ihren Eintrag unter "Schemas".
 */
export function SchemaTable({ doc, schema }: { doc: OpenApiDoc; schema: JsonSchema | undefined }) {
  const rows = schemaRows(doc, schema);
  if (rows.length === 0) return <p className="text-[11px] text-slate-500">No properties.</p>;

  return (
    <div className="overflow-x-auto rounded-md border border-slate-800">
      <table className="w-full text-left text-[11px]">
        <thead className="bg-slate-900/80 text-[10px] uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-2.5 py-1.5 font-medium">Property</th>
            <th className="px-2.5 py-1.5 font-medium">Type</th>
            <th className="px-2.5 py-1.5 font-medium">Description</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/80">
          {rows.map((row) => (
            <tr key={row.name} className="align-top">
              <td className="whitespace-nowrap px-2.5 py-1.5 font-mono text-slate-200" style={{ paddingLeft: 10 + row.depth * 14 }}>
                {row.depth > 0 ? row.name.slice(row.name.lastIndexOf('.') + 1) : row.name}
                {row.required && <span className="ml-1 text-amber-400" title="required">*</span>}
              </td>
              <td className="whitespace-nowrap px-2.5 py-1.5 font-mono text-sky-300">
                <TypeLink type={row.type} doc={doc} />
              </td>
              <td className="px-2.5 py-1.5 text-slate-400">
                {row.description}
                {row.constraints.length > 0 && (
                  <span className="mt-0.5 block font-mono text-[10px] text-slate-500">{row.constraints.join(' · ')}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Schema-Namen in einer Typangabe ("Node[]", "Position") zu Ankern machen. */
export function TypeLink({ type, doc }: { type: string; doc: OpenApiDoc }) {
  const parts = type.split(/([A-Za-z]+)/);
  return (
    <>
      {parts.map((part, i) =>
        doc.components.schemas[part] ? (
          <a key={i} href={`#schema-${part}`} className="underline decoration-sky-700 underline-offset-2 hover:text-sky-200">
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}
