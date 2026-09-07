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
  { label: 'Läuft nicht ab', days: null },
  { label: '7 Tage', days: 7 },
  { label: '30 Tage', days: 30 },
  { label: '90 Tage', days: 90 },
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
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Fehler'));
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
      setError(e instanceof Error ? e.message : 'Anlegen fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (link: ShareLink) => {
    if (!window.confirm('Diesen Link widerrufen? Wer ihn hat, sieht das Projekt danach nicht mehr.'))
      return;
    try {
      await api.revokeShare(project.id, link.id);
      setLinks((l) => (l ?? []).filter((x) => x.id !== link.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Widerrufen fehlgeschlagen');
    }
  };

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Zwischenablage kann gesperrt sein (kein HTTPS, verweigerte Freigabe) —
      // der Link steht ohnehin als markierbarer Text im Dialog.
      setError('Kopieren nicht möglich — Link bitte von Hand markieren.');
    }
  };

  const dateOf = (iso: string) => new Date(iso).toLocaleDateString('de-DE');

  return (
    <Modal title={`„${project.name}" teilen`} onClose={onClose} maxWidth="max-w-lg">
      <div className="space-y-5">
        <p className="flex items-start gap-2 rounded-md border border-slate-800 bg-slate-950/50 px-2.5 py-2 text-[11px] leading-relaxed text-slate-400">
          <Eye size={13} className="mt-0.5 shrink-0 text-amber-300" />
          Wer den Link hat, kann dieses Projekt <strong className="text-slate-200">ansehen</strong> —
          ohne Konto, mit allen Ebenen und Notizen. Ändern oder löschen kann er nichts.
        </p>

        {error && (
          <p className="rounded-md border border-red-900/60 bg-red-500/10 px-2.5 py-2 text-[11px] text-red-300">
            {error}
          </p>
        )}

        {fresh && (
          <div className="rounded-md border border-sky-500/50 bg-sky-500/10 p-2.5">
            <p className="mb-1.5 text-[11px] font-medium text-sky-200">
              Neuer Link — jetzt kopieren, er wird später nicht mehr angezeigt.
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
                title="Link kopieren"
                className="flex shrink-0 items-center gap-1 rounded-md bg-sky-600 px-2.5 text-[11px] font-medium text-white hover:bg-sky-500"
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? 'Kopiert' : 'Kopieren'}
              </button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <span className="block text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Neuen Link anlegen
          </span>
          <div className="flex gap-1.5">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={'Beschreibung (optional), z. B. „Für das Team"'}
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
              Anlegen
            </button>
          </div>
        </div>

        <div>
          <span className="mb-2 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Bestehende Links
          </span>
          {links === null ? (
            <p className="text-[11px] text-slate-600">Wird geladen …</p>
          ) : links.length === 0 ? (
            <p className="text-[11px] text-slate-600">Dieses Projekt ist nicht freigegeben.</p>
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
                      {link.label || 'Ohne Beschreibung'}
                    </span>
                    <span className="block text-[10px] text-slate-500">
                      seit {dateOf(link.createdAt)}
                      {link.expiresAt ? ` · läuft ab ${dateOf(link.expiresAt)}` : ' · unbefristet'}
                      {link.lastSeenAt
                        ? ` · zuletzt geöffnet ${dateOf(link.lastSeenAt)}`
                        : ' · noch nicht geöffnet'}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void revoke(link)}
                    title="Link widerrufen"
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
