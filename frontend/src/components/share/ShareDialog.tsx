import { useEffect, useState } from 'react';
import { Check, Copy, Eye, Link2, Loader2, Trash2 } from 'lucide-react';
import { api } from '../../api/client';
import type { Project, ShareLink } from '../../api/types';
import { Modal } from '../ui/Modal';

/**
 * Freigabelinks eines Projekts verwalten.
 *
 * Der Link ist read-only und braucht kein Konto: wer ihn hat, sieht genau
 * dieses Projekt mit allen Ebenen. Das Klartext-Token kommt NUR in der Antwort
 * auf das Anlegen zurück — danach kennt der Server nur noch dessen Hash. Ein
 * verlorener Link lässt sich deshalb nicht wiederherstellen, nur ersetzen.
 * Genau das steht auch im Dialog, sonst sucht man später vergeblich danach.
 *
 * Beeinflusst: backend/src/routes/share.js (öffentliche Leseansicht),
 * backend/src/share.js (Token & Ablauf), share/SharedApp.tsx.
 */
const EXPIRY_OPTIONS = [
  { label: 'Never expires', days: null },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
] as const;

const shareUrl = (token: string) => `${window.location.origin}/s/${token}`;

export function ShareDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const [links, setLinks] = useState<ShareLink[] | null>(null);
  const [label, setLabel] = useState('');
  const [expiryDays, setExpiryDays] = useState<number | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api
      .listShares(project.id)
      .then((l) => !cancelled && setLinks(l))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Error'));
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const expiresAt =
        expiryDays === null
          ? null
          : new Date(Date.now() + expiryDays * 86_400_000).toISOString();
      const created = await api.createShare(project.id, { label: label.trim(), expiresAt });
      setLinks((l) => [created, ...(l ?? [])]);
      setFresh(created.token ?? null);
      setLabel('');
      setCopied(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the link');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (link: ShareLink) => {
    if (!window.confirm('Revoke this link? Anyone holding it loses access to the project.'))
      return;
    try {
      await api.revokeShare(project.id, link.id);
      setLinks((l) => (l ?? []).filter((x) => x.id !== link.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not revoke the link');
    }
  };

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Zwischenablage kann gesperrt sein (kein HTTPS, verweigerte Freigabe) —
      // der Link steht ohnehin als markierbarer Text im Dialog.
      setError('Copying failed — please select the link manually.');
    }
  };

  const dateOf = (iso: string) => new Date(iso).toLocaleDateString();

  return (
    <Modal title={`Share “${project.name}”`} onClose={onClose} maxWidth="max-w-lg">
      <div className="space-y-5">
        <p className="flex items-start gap-2 rounded-md border border-slate-800 bg-slate-950/50 px-2.5 py-2 text-[11px] leading-relaxed text-slate-400">
          <Eye size={13} className="mt-0.5 shrink-0 text-amber-300" />
          Anyone with the link can <strong className="text-slate-200">view</strong> this project —
          without an account, including every level and note. They cannot change or delete anything.
        </p>

        {error && (
          <p className="rounded-md border border-red-900/60 bg-red-500/10 px-2.5 py-2 text-[11px] text-red-300">
            {error}
          </p>
        )}

        {fresh && (
          <div className="rounded-md border border-sky-500/50 bg-sky-500/10 p-2.5">
            <p className="mb-1.5 text-[11px] font-medium text-sky-200">
              New link — copy it now, it is never shown again.
            </p>
            <div className="flex gap-1.5">
              <input
                readOnly
                value={shareUrl(fresh)}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full rounded-md border border-slate-700 bg-slate-950/70 px-2 py-1.5 font-mono text-[11px] text-slate-200"
              />
              <button
                type="button"
                onClick={() => void copy(shareUrl(fresh))}
                title="Copy link"
                className="flex shrink-0 items-center gap-1 rounded-md bg-sky-600 px-2.5 text-[11px] font-medium text-white hover:bg-sky-500"
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <span className="block text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Create a new link
          </span>
          <div className="flex gap-1.5">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={'Description (optional), e.g. “For the team”'}
              className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-950/70 px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none"
            />
            <select
              value={String(expiryDays)}
              onChange={(e) => setExpiryDays(e.target.value === 'null' ? null : Number(e.target.value))}
              className="shrink-0 rounded-md border border-slate-700 bg-slate-950/70 px-2 py-1.5 text-xs text-slate-300 focus:border-sky-500 focus:outline-none"
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
              className="flex shrink-0 items-center gap-1.5 rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500 disabled:bg-slate-800 disabled:text-slate-500"
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
              Create
            </button>
          </div>
        </div>

        <div>
          <span className="mb-2 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Existing links
          </span>
          {links === null ? (
            <p className="text-[11px] text-slate-600">Loading …</p>
          ) : links.length === 0 ? (
            <p className="text-[11px] text-slate-600">This project is not shared.</p>
          ) : (
            <div className="space-y-1">
              {links.map((link) => (
                <div
                  key={link.id}
                  className="group flex items-center gap-2 rounded-md border border-slate-800 px-2.5 py-2"
                >
                  <Link2 size={13} className="shrink-0 text-slate-500" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs text-slate-200">
                      {link.label || 'No description'}
                    </span>
                    <span className="block text-[10px] text-slate-500">
                      since {dateOf(link.createdAt)}
                      {link.expiresAt ? ` · expires ${dateOf(link.expiresAt)}` : ' · no expiry'}
                      {link.lastSeenAt
                        ? ` · last opened ${dateOf(link.lastSeenAt)}`
                        : ' · never opened'}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void revoke(link)}
                    title="Revoke link"
                    className="shrink-0 rounded p-1 text-slate-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
