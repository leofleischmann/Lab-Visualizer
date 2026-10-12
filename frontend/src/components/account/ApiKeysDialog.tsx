import { useEffect, useState } from 'react';
import { AlertTriangle, BookOpen, KeySquare, Loader2, Trash2 } from 'lucide-react';
import { api } from '../../api/client';
import type { ApiKey, ApiKeyScope } from '../../api/types';
import { Modal } from '../ui/Modal';
import { CodeBlock } from '../ui/CodeBlock';
import { McpSnippets } from '../docs/McpSnippets';

/**
 * API-Keys verwalten: anlegen (Key wird genau EINMAL angezeigt), auflisten,
 * widerrufen - plus die fertige Konfiguration für MCP-Clients mit dem frisch
 * erzeugten Key.
 *
 * Die Verwaltung geht nur aus der Web-App (Session); das Backend lehnt sie mit
 * einem Key ab (code "session_required"), damit sich ein geleakter read-Key
 * keinen write-Key ausstellen kann.
 *
 * Beeinflusst: backend/src/apiKeys.js, backend/src/routes/apiKeys.js,
 * lib/mcpConfig.ts, components/docs/ (Doku-Seite /docs).
 */
const EXPIRY_OPTIONS = [
  { label: 'Never expires', days: null },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: '1 year', days: 365 },
] as const;

const SCOPE_OPTIONS: { value: ApiKeyScope; label: string; hint: string }[] = [
  { value: 'read', label: 'Read only', hint: 'GET requests and read-only MCP tools.' },
  { value: 'write', label: 'Read & write', hint: 'Can create, change and delete data.' },
];

const dateOf = (iso: string) => new Date(iso).toLocaleDateString();
const isExpired = (key: ApiKey) => !!key.expiresAt && Date.parse(key.expiresAt) <= Date.now();

export function ApiKeysDialog({ onClose }: { onClose: () => void }) {
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<ApiKeyScope>('read');
  const [expiryDays, setExpiryDays] = useState<number | null>(null);
  const [fresh, setFresh] = useState<ApiKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api
      .listApiKeys()
      .then((list) => {
        console.debug('[Debug ApiKeysDialog]: loaded', list.length, 'keys');
        if (!cancelled) setKeys(list);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Could not load API keys'));
    return () => {
      cancelled = true;
    };
  }, []);

  const create = async () => {
    if (!name.trim()) return setError('Please give the key a name, e.g. “Claude Code”.');
    setBusy(true);
    setError(null);
    try {
      const expiresAt =
        expiryDays === null ? null : new Date(Date.now() + expiryDays * 86_400_000).toISOString();
      const created = await api.createApiKey({ name: name.trim(), scope, expiresAt });
      console.debug('[Debug ApiKeysDialog]: created', { id: created.id, scope: created.scope, expiresAt });
      setKeys((list) => [created, ...(list ?? [])]);
      setFresh(created);
      setName('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the key');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (key: ApiKey) => {
    if (!window.confirm(`Revoke “${key.name}”? Scripts and agents using it lose access immediately.`)) return;
    try {
      await api.revokeApiKey(key.id);
      console.debug('[Debug ApiKeysDialog]: revoked', key.id);
      setKeys((list) => (list ?? []).filter((k) => k.id !== key.id));
      if (fresh?.id === key.id) setFresh(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not revoke the key');
    }
  };

  const inputClass =
    'rounded-md border border-slate-700 bg-slate-950/70 px-2 py-1.5 text-xs text-slate-200 focus:border-sky-500 focus:outline-none';

  return (
    <Modal title="API keys & MCP" onClose={onClose} maxWidth="max-w-xl">
      <div className="space-y-5">
        <p className="text-[11px] leading-relaxed text-slate-400">
          API keys connect scripts, integrations and AI agents (MCP) to your data. Send them as{' '}
          <code className="rounded bg-slate-800 px-1 text-slate-300">Authorization: Bearer lvk_…</code>. A key
          can never change your password, delete the account or create other keys.
        </p>

        {error && (
          <p className="flex items-start gap-2 rounded-md border border-red-900/60 bg-red-500/10 px-2.5 py-2 text-[11px] text-red-300">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {error}
          </p>
        )}

        {fresh?.token && (
          <div className="space-y-3 rounded-md border border-sky-500/50 bg-sky-500/10 p-3">
            <div>
              <p className="mb-1.5 text-[11px] font-medium text-sky-200">
                Key “{fresh.name}” created - copy it now, it is never shown again.
              </p>
              <CodeBlock code={fresh.token} />
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-medium text-slate-300">Connect an AI agent (MCP)</p>
              <McpSnippets apiKey={fresh.token} />
              {fresh.scope === 'read' && (
                <p className="mt-1.5 text-[10px] text-slate-500">
                  This key is read-only: the agent can look things up but not change anything.
                </p>
              )}
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-medium text-slate-300">Test it</p>
              <CodeBlock
                code={`curl -H "Authorization: Bearer ${fresh.token}" \\\n  ${window.location.origin}/api/auth/me`}
              />
            </div>
          </div>
        )}

        <div className="space-y-2">
          <span className="block text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Create a new key
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void create()}
            placeholder={'Name, e.g. “Claude Code” or “Monitoring script”'}
            maxLength={100}
            className={`w-full ${inputClass} placeholder:text-slate-600`}
          />
          <div className="flex flex-wrap gap-1.5">
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as ApiKeyScope)}
              title={SCOPE_OPTIONS.find((o) => o.value === scope)?.hint}
              className={inputClass}
            >
              {SCOPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select
              value={String(expiryDays)}
              onChange={(e) => setExpiryDays(e.target.value === 'null' ? null : Number(e.target.value))}
              className={inputClass}
            >
              {EXPIRY_OPTIONS.map((o) => (
                <option key={o.label} value={String(o.days)}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy}
              onClick={() => void create()}
              className="ml-auto flex items-center gap-1.5 rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500 disabled:bg-slate-800 disabled:text-slate-500"
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <KeySquare size={13} />}
              Create key
            </button>
          </div>
          <p className="text-[10px] text-slate-500">{SCOPE_OPTIONS.find((o) => o.value === scope)?.hint}</p>
        </div>

        <div>
          <span className="mb-2 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Your keys
          </span>
          {keys === null ? (
            <p className="text-[11px] text-slate-600">Loading …</p>
          ) : keys.length === 0 ? (
            <p className="text-[11px] text-slate-600">No API keys yet.</p>
          ) : (
            <div className="space-y-1">
              {keys.map((key) => (
                <div key={key.id} className="flex items-center gap-2 rounded-md border border-slate-800 px-2.5 py-2">
                  <KeySquare size={13} className="shrink-0 text-slate-500" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-xs text-slate-200">{key.name}</span>
                      <span
                        className={`shrink-0 rounded px-1 text-[9px] font-semibold uppercase ${
                          key.scope === 'write' ? 'bg-amber-500/15 text-amber-300' : 'bg-slate-700/60 text-slate-300'
                        }`}
                      >
                        {key.scope}
                      </span>
                      {isExpired(key) && (
                        <span className="shrink-0 rounded bg-red-500/15 px-1 text-[9px] font-semibold uppercase text-red-300">
                          expired
                        </span>
                      )}
                    </span>
                    <span className="block text-[10px] text-slate-500">
                      <code className="text-slate-400">{key.prefix}…</code> · created {dateOf(key.createdAt)}
                      {key.expiresAt ? ` · expires ${dateOf(key.expiresAt)}` : ''}
                      {key.lastUsedAt ? ` · last used ${dateOf(key.lastUsedAt)}` : ' · never used'}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void revoke(key)}
                    title="Revoke key"
                    className="shrink-0 rounded p-1 text-slate-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <a
          href="/docs"
          target="_blank"
          rel="noopener"
          className="flex items-center gap-1.5 text-[11px] font-medium text-sky-400 hover:text-sky-300"
        >
          <BookOpen size={13} /> API & MCP documentation
        </a>
      </div>
    </Modal>
  );
}
