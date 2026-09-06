import { Server, ExternalLink } from 'lucide-react';
import { useGraphStore } from '../../store/graph';
import { useAuthStore } from '../../store/auth';
import { Modal } from './Modal';

const REPO_URL = 'https://github.com/leofleischmann/Lab-Visualizer';

/**
 * Hinweis, wenn eine Aktion an einer Obergrenze DIESER Instanz scheitert
 * (403, code "limit_reached"). Lab Visualizer ist kostenlos und quelloffen —
 * es gibt nichts zu kaufen; wer mehr braucht, hostet selbst (dort keine Limits).
 */
export function LimitDialog() {
  const notice = useGraphStore((s) => s.limitNotice);
  const close = useGraphStore((s) => s.closeLimitNotice);
  const limits = useAuthStore((s) => s.limits);

  if (notice === null) return null;

  const rows = [
    ['Projekte pro Konto', limits?.maxProjectsPerUser],
    ['Ebenen pro Projekt', limits?.maxViewsPerProject],
    ['Nodes pro Projekt', limits?.maxNodesPerProject],
  ] as const;
  const configured = rows.filter(([, value]) => typeof value === 'number');

  return (
    <Modal title="Grenze dieser Instanz erreicht" onClose={close}>
      {notice && (
        <div className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-200">
          {notice}
        </div>
      )}

      <p className="text-xs leading-relaxed text-slate-400">
        Das ist keine Bezahlschranke: Lab Visualizer ist vollständig kostenlos und quelloffen.
        Diese Grenzen gelten nur für den geteilten Server, damit er für alle nutzbar bleibt.
      </p>

      {configured.length > 0 && (
        <dl className="mt-3 divide-y divide-slate-800 rounded-lg border border-slate-700 bg-slate-950/50 text-xs">
          {configured.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between px-3 py-2">
              <dt className="text-slate-400">{label}</dt>
              <dd className="font-medium text-slate-200">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-4 rounded-lg border border-sky-500/40 bg-sky-500/5 p-3">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-sky-300">
          <Server size={13} /> Ohne Limits: selbst hosten
        </h3>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
          Auf einer eigenen Instanz gibt es keine Obergrenzen. Ein{' '}
          <code className="rounded bg-slate-800 px-1 py-0.5 text-[10px]">docker compose up</code>{' '}
          genügt — deine Daten kannst du hier exportieren und dort importieren.
        </p>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          className="mt-2.5 inline-flex items-center gap-1.5 rounded-md bg-sky-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-sky-400"
        >
          <ExternalLink size={12} /> Zur Anleitung auf GitHub
        </a>
      </div>
    </Modal>
  );
}
