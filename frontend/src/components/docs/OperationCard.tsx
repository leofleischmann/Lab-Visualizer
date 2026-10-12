import { lazy, Suspense } from 'react';
import { ChevronRight } from 'lucide-react';
import {
  AUTH_LEVELS,
  curlExample,
  resolveResponse,
  typeLabel,
  type AuthLevel,
  type HttpMethod,
  type OpenApiDoc,
  type OperationEntry,
} from '../../lib/openapi';
import { CodeBlock } from '../ui/CodeBlock';
import { SchemaTable, TypeLink } from './SchemaTable';

const MarkdownPreview = lazy(() => import('../panel/MarkdownPreview'));

const METHOD_STYLE: Record<HttpMethod, string> = {
  get: 'bg-sky-500/15 text-sky-300',
  post: 'bg-emerald-500/15 text-emerald-300',
  put: 'bg-amber-500/15 text-amber-300',
  patch: 'bg-amber-500/15 text-amber-300',
  delete: 'bg-red-500/15 text-red-300',
};

const AUTH_STYLE: Record<AuthLevel, string> = {
  public: 'border-slate-700 text-slate-400',
  read: 'border-sky-800 text-sky-300',
  write: 'border-amber-800 text-amber-300',
  session: 'border-violet-800 text-violet-300',
  apiKey: 'border-emerald-800 text-emerald-300',
};

export function MethodBadge({ method }: { method: HttpMethod }) {
  return (
    <span className={`inline-block w-14 shrink-0 rounded px-1.5 py-0.5 text-center font-mono text-[10px] font-bold uppercase ${METHOD_STYLE[method]}`}>
      {method}
    </span>
  );
}

export function AuthBadge({ level }: { level: AuthLevel }) {
  return (
    <span title={AUTH_LEVELS[level].hint} className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${AUTH_STYLE[level]}`}>
      {AUTH_LEVELS[level].label}
    </span>
  );
}

/** Markdown-Beschreibung (lazy, wie überall in der App). */
export function DocText({ value }: { value: string }) {
  return (
    <div className="prose prose-invert prose-sm max-w-none text-[12px] prose-p:my-1.5 prose-code:text-sky-200 prose-code:before:content-none prose-code:after:content-none">
      <Suspense fallback={<p className="text-slate-400">{value}</p>}>
        <MarkdownPreview value={value} />
      </Suspense>
    </div>
  );
}

/**
 * Eine Operation der API: aufklappbar, mit Parametern, Request-Body,
 * Antworten und curl-Beispiel. Natives <details>, damit Strg+F im Browser
 * auch zugeklappte Inhalte findet.
 */
export function OperationCard({ doc, entry }: { doc: OpenApiDoc; entry: OperationEntry }) {
  const { method, path, op, aliases } = entry;
  const body = op.requestBody?.content['application/json'];
  const params = op.parameters ?? [];

  return (
    <details id={`op-${op.operationId}`} className="group scroll-mt-20 rounded-lg border border-slate-800 bg-slate-900/40 open:bg-slate-900/70">
      <summary className="flex cursor-pointer list-none items-center gap-2.5 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
        <ChevronRight size={14} className="shrink-0 text-slate-600 transition-transform group-open:rotate-90" />
        <MethodBadge method={method} />
        <code className="min-w-0 truncate font-mono text-[12px] text-slate-100">{path}</code>
        <span className="hidden min-w-0 flex-1 truncate text-[11px] text-slate-400 md:block">{op.summary}</span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {aliases.map((alias) => (
            <span key={alias} title={`${alias.toUpperCase()} behaves exactly like ${method.toUpperCase()}`} className="font-mono text-[9px] uppercase text-slate-500">
              +{alias}
            </span>
          ))}
          <AuthBadge level={op['x-auth']} />
        </span>
      </summary>

      <div className="space-y-4 border-t border-slate-800 px-4 py-4">
        <div>
          <p className="text-[13px] font-medium text-slate-100">{op.summary}</p>
          {op.description && <DocText value={op.description} />}
        </div>

        {params.length > 0 && (
          <section>
            <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Parameters</h4>
            <div className="overflow-x-auto rounded-md border border-slate-800">
              <table className="w-full text-left text-[11px]">
                <tbody className="divide-y divide-slate-800/80">
                  {params.map((p) => (
                    <tr key={`${p.in}-${p.name}`} className="align-top">
                      <td className="whitespace-nowrap px-2.5 py-1.5 font-mono text-slate-200">
                        {p.name}
                        {p.required && <span className="ml-1 text-amber-400">*</span>}
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-1.5 text-[10px] uppercase text-slate-500">{p.in}</td>
                      <td className="whitespace-nowrap px-2.5 py-1.5 font-mono text-sky-300">{typeLabel(p.schema)}</td>
                      <td className="px-2.5 py-1.5 text-slate-400">{p.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {body && (
          <section>
            <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Request body · <span className="font-mono normal-case text-sky-300"><TypeLink type={typeLabel(body.schema)} doc={doc} /></span>
            </h4>
            <SchemaTable doc={doc} schema={body.schema} />
          </section>
        )}

        <section>
          <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Responses</h4>
          <ul className="space-y-1">
            {Object.entries(op.responses).map(([status, raw]) => {
              const response = resolveResponse(doc, raw);
              const schema = response?.content?.['application/json']?.schema;
              const media = Object.keys(response?.content ?? {});
              return (
                <li key={status} className="flex items-baseline gap-2 text-[11px]">
                  <code className={`w-9 shrink-0 font-mono font-semibold ${status.startsWith('2') ? 'text-emerald-400' : 'text-red-300'}`}>
                    {status}
                  </code>
                  <span className="text-slate-400">
                    {response?.description}
                    {schema && (
                      <span className="ml-1.5 font-mono text-sky-300">
                        <TypeLink type={typeLabel(schema)} doc={doc} />
                      </span>
                    )}
                    {!schema && media.length > 0 && <span className="ml-1.5 font-mono text-slate-500">{media.join(', ')}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <section>
          <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Example</h4>
          <CodeBlock code={curlExample(doc, entry, window.location.origin)} />
        </section>
      </div>
    </details>
  );
}
