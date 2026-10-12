import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, Bot, FileJson, KeySquare, RotateCw, Search } from 'lucide-react';
import { api } from '../../api/client';
import { isOpenApiDoc, operationsByTag, type OpenApiDoc } from '../../lib/openapi';
import { mcpUrl } from '../../lib/mcpConfig';
import { CodeBlock } from '../ui/CodeBlock';
import { McpSnippets } from './McpSnippets';
import { AuthBadge, DocText, OperationCard } from './OperationCard';
import { SchemaTable } from './SchemaTable';

/**
 * Doku-Seite `/docs`: API-Referenz und MCP-Einrichtung dieser Instanz.
 *
 * Gerendert aus GET /api/openapi.json (backend/src/openapi.js) - die Seite
 * kennt keine Endpunkte selbst und kann daher nicht veralten. Bewusst ohne
 * Swagger UI & Co.: die App läuft offline, ohne CDN und unter einer strikten
 * CSP; ein eigener schlanker Renderer passt dazu und zum Look der App.
 *
 * Öffentlich (ohne Anmeldung) erreichbar, wie die Spezifikation selbst.
 * Der Einstieg steht in main.tsx (Pfadweiche), verlinkt aus dem Konto-Menü.
 *
 * Beeinflusst: lib/openapi.ts, lib/mcpConfig.ts, main.tsx.
 */
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-');

export function ApiDocs() {
  const [doc, setDoc] = useState<OpenApiDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    document.title = 'API · Lab Visualizer';
    let cancelled = false;
    setError(null);
    api
      .openApi()
      .then((spec) => {
        if (cancelled) return;
        if (!isOpenApiDoc(spec)) throw new Error('The server did not return an OpenAPI document.');
        console.debug('[Debug ApiDocs]: spec loaded', {
          version: spec.info.version,
          paths: Object.keys(spec.paths).length,
        });
        setDoc(spec);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Could not load the API description'));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // Sprung auf eine Operation (#op-…) klappt sie auf - auch beim ersten Laden.
  useEffect(() => {
    if (!doc) return;
    const openFromHash = () => {
      const el = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
      if (el instanceof HTMLDetailsElement) el.open = true;
      el?.scrollIntoView({ block: 'start' });
    };
    openFromHash();
    window.addEventListener('hashchange', openFromHash);
    return () => window.removeEventListener('hashchange', openFromHash);
  }, [doc]);

  const groups = useMemo(() => {
    if (!doc) return [];
    const needle = filter.trim().toLowerCase();
    return operationsByTag(doc)
      .map((group) => ({
        ...group,
        operations: needle
          ? group.operations.filter(({ method, path, op }) =>
              `${method} ${path} ${op.summary} ${op.operationId}`.toLowerCase().includes(needle)
            )
          : group.operations,
      }))
      .filter((group) => group.operations.length > 0);
  }, [doc, filter]);

  const mcpTools = useMemo(() => doc?.paths['/mcp']?.post?.['x-mcp']?.tools ?? [], [doc]);
  const origin = window.location.origin;

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-slate-950 px-6 text-center text-slate-400">
        <AlertTriangle size={22} className="text-red-400" />
        <p className="text-sm">{error}</p>
        <button
          type="button"
          onClick={() => setAttempt((n) => n + 1)}
          className="rounded-md border border-slate-700 px-3 py-1.5 text-xs hover:border-sky-500 hover:text-sky-300"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-slate-950 text-slate-500">
        <RotateCw size={22} className="animate-spin" />
        <p className="text-sm">Loading API description …</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-950 text-slate-200">
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-900/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <a href="/" className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-sky-300" title="Back to the app">
            <ArrowLeft size={14} />
          </a>
          <h1 className="text-sm font-semibold text-slate-100">{doc.info.title}</h1>
          <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">v{doc.info.version}</span>
          <a
            href="/api/openapi.json"
            target="_blank"
            rel="noopener"
            className="ml-auto flex items-center gap-1.5 rounded-md border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:border-sky-500 hover:text-sky-300"
          >
            <FileJson size={13} /> OpenAPI JSON
          </a>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-8 px-4 py-8">
        <nav className="sticky top-20 hidden max-h-[calc(100vh-6rem)] w-48 shrink-0 self-start overflow-y-auto text-[12px] lg:block">
          <NavLink href="#overview">Overview</NavLink>
          <NavLink href="#authentication">Authentication</NavLink>
          <NavLink href="#mcp">MCP for AI agents</NavLink>
          <p className="mb-1 mt-4 px-2 text-[10px] font-semibold uppercase tracking-wide text-slate-600">Endpoints</p>
          {operationsByTag(doc).map((group) => (
            <NavLink key={group.name} href={`#tag-${slug(group.name)}`}>
              {group.name}
            </NavLink>
          ))}
          <p className="mb-1 mt-4 px-2 text-[10px] font-semibold uppercase tracking-wide text-slate-600">Reference</p>
          <NavLink href="#schemas">Schemas</NavLink>
        </nav>

        <main className="min-w-0 flex-1 space-y-12">
          <section id="overview" className="scroll-mt-20 space-y-3">
            <h2 className="text-lg font-semibold text-slate-100">Overview</h2>
            {doc.info.description && <DocText value={doc.info.description} />}
            <div className="grid gap-2 sm:grid-cols-2">
              <Fact label="Base URL" value={`${origin}${doc.servers[0]?.url ?? '/api'}`} />
              <Fact label="MCP endpoint" value={mcpUrl(origin)} />
            </div>
            <p className="text-[12px] text-slate-400">
              Import <code className="text-sky-200">/api/openapi.json</code> into Postman, Insomnia or Bruno, or
              generate a typed client with any OpenAPI generator.
            </p>
          </section>

          <section id="authentication" className="scroll-mt-20 space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-100">
              <KeySquare size={17} className="text-sky-400" /> Authentication
            </h2>
            <ol className="list-decimal space-y-1 pl-5 text-[12px] text-slate-300">
              <li>Sign in to the web app and open the account menu {'->'} <strong>API keys &amp; MCP</strong>.</li>
              <li>Create a key with the scope you need. It is shown exactly once - store it like a password.</li>
              <li>
                Send it with every request as <code className="text-sky-200">Authorization: Bearer lvk_…</code>.
              </li>
            </ol>
            <CodeBlock
              label="Quick test"
              code={`export LABVIZ_API_KEY=lvk_your_api_key\ncurl -H "Authorization: Bearer $LABVIZ_API_KEY" ${origin}/api/auth/me`}
            />
            <div className="overflow-x-auto rounded-md border border-slate-800">
              <table className="w-full text-left text-[12px]">
                <tbody className="divide-y divide-slate-800/80">
                  <AuthRow level="public" text="No authentication: health, catalog, templates, legal texts, share links, this document." />
                  <AuthRow level="read" text="Any API key or a browser session. Read-only keys may only use GET." />
                  <AuthRow level="write" text={'API key with scope "write" or a browser session. A read-only key gets 403 with code "insufficient_scope".'} />
                  <AuthRow level="session" text={'Browser session only: password, account deletion and API key management. API keys get 403 ("session_required") or 401.'} />
                  <AuthRow level="apiKey" text="API key only: the MCP endpoint." />
                </tbody>
              </table>
            </div>
            <p className="text-[12px] text-slate-400">
              Errors always look like <code className="text-sky-200">{'{ "error": "…", "details": [], "code": "…" }'}</code>.
              Other accounts’ IDs answer <code className="text-sky-200">404</code>. Writes are rate-limited per IP (
              <code className="text-sky-200">429</code> + <code className="text-sky-200">Retry-After</code>); an
              instance limit answers <code className="text-sky-200">403</code> with{' '}
              <code className="text-sky-200">code: "limit_reached"</code> - do not retry those.
            </p>
          </section>

          <section id="mcp" className="scroll-mt-20 space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-100">
              <Bot size={17} className="text-sky-400" /> MCP for AI agents
            </h2>
            <p className="text-[12px] leading-relaxed text-slate-300">
              Lab Visualizer is a <strong>Model Context Protocol</strong> server: Claude, Cursor, VS Code and other
              MCP clients can read and document your infrastructure directly. Transport: Streamable HTTP at{' '}
              <code className="text-sky-200">{mcpUrl(origin)}</code>, authenticated with an API key. A read-only
              key only gets the read tools.
            </p>
            <McpSnippets />
            <div className="overflow-x-auto rounded-md border border-slate-800">
              <table className="w-full text-left text-[12px]">
                <thead className="bg-slate-900/80 text-[10px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-2.5 py-1.5 font-medium">Tool</th>
                    <th className="px-2.5 py-1.5 font-medium">Scope</th>
                    <th className="px-2.5 py-1.5 font-medium">What it does</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {mcpTools.map((tool) => (
                    <tr key={tool.name} className="align-top">
                      <td className="whitespace-nowrap px-2.5 py-1.5 font-mono text-slate-100">{tool.name}</td>
                      <td className="whitespace-nowrap px-2.5 py-1.5">
                        <span className={tool.scope === 'write' ? 'text-amber-300' : 'text-sky-300'}>{tool.scope}</span>
                        {tool.destructive && (
                          <span className="ml-1 text-[10px] text-red-300" title="May overwrite or delete existing data">
                            · destructive
                          </span>
                        )}
                      </td>
                      <td className="px-2.5 py-1.5 text-slate-400">{tool.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-semibold text-slate-100">Endpoints</h2>
              <label className="ml-auto flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs focus-within:border-sky-500">
                <Search size={13} className="text-slate-500" />
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter endpoints …"
                  className="w-48 bg-transparent text-slate-200 placeholder:text-slate-600 focus:outline-none"
                />
              </label>
            </div>
            {groups.length === 0 && <p className="text-[12px] text-slate-500">No endpoint matches “{filter}”.</p>}
            {groups.map((group) => (
              <section key={group.name} id={`tag-${slug(group.name)}`} className="scroll-mt-20 space-y-2">
                <h3 className="text-[15px] font-semibold text-slate-100">{group.name}</h3>
                {group.description && <p className="text-[12px] text-slate-400">{group.description}</p>}
                <div className="space-y-1.5">
                  {group.operations.map((entry) => (
                    <OperationCard key={`${entry.method} ${entry.path}`} doc={doc} entry={entry} />
                  ))}
                </div>
              </section>
            ))}
          </section>

          <section id="schemas" className="scroll-mt-20 space-y-2">
            <h2 className="text-lg font-semibold text-slate-100">Schemas</h2>
            <p className="text-[12px] text-slate-400">
              Data models in responses and request bodies. <span className="text-amber-400">*</span> = required.
            </p>
            {Object.entries(doc.components.schemas).map(([name, schema]) => (
              <details key={name} id={`schema-${name}`} className="group scroll-mt-20 rounded-lg border border-slate-800 bg-slate-900/40">
                <summary className="flex cursor-pointer list-none items-baseline gap-3 px-3 py-2 [&::-webkit-details-marker]:hidden">
                  <code className="font-mono text-[12px] font-semibold text-slate-100">{name}</code>
                  {schema.description && <span className="truncate text-[11px] text-slate-500">{schema.description}</span>}
                </summary>
                <div className="border-t border-slate-800 p-3">
                  <SchemaTable doc={doc} schema={schema} />
                </div>
              </details>
            ))}
          </section>
        </main>
      </div>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="block rounded px-2 py-1 text-slate-400 transition-colors hover:bg-slate-800/60 hover:text-slate-100">
      {children}
    </a>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/40 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="truncate font-mono text-[12px] text-slate-200">{value}</p>
    </div>
  );
}

function AuthRow({ level, text }: { level: Parameters<typeof AuthBadge>[0]['level']; text: string }) {
  return (
    <tr className="align-top">
      <td className="w-28 px-2.5 py-2">
        <AuthBadge level={level} />
      </td>
      <td className="px-2.5 py-2 text-slate-400">{text}</td>
    </tr>
  );
}
