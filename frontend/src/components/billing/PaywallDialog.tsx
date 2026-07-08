import { useState } from 'react';
import { Check, Crown, RotateCw, Sparkles } from 'lucide-react';
import { api, ApiRequestError } from '../../api/client';
import { useGraphStore } from '../../store/graph';
import { useAuthStore } from '../../store/auth';
import { Modal } from '../ui/Modal';

const FREE_FEATURES = [
  '1 Projekt',
  'Bis zu 3 Ebenen (Drill-down)',
  'Unbegrenzte Nodes & Verbindungen',
  'Volle REST-API & Export/Import',
];

const PRO_FEATURES = [
  'Unbegrenzte Projekte',
  'Unbegrenzte Ebenen pro Projekt',
  'Projekte teilen (Export & Merge-Import)',
  'Unterstützt die Weiterentwicklung',
];

/**
 * Upgrade-Dialog (Freemium-Paywall). Wird geöffnet, wenn das Backend ein
 * Plan-Limit meldet (402, code "plan_limit") oder manuell über das Konto-Menü.
 * Der Kauf selbst läuft über Stripe — bis die Integration aktiv ist, meldet
 * das Backend 501 und der Dialog zeigt einen entsprechenden Hinweis.
 */
export function PaywallDialog() {
  const paywall = useGraphStore((s) => s.paywall);
  const closePaywall = useGraphStore((s) => s.closePaywall);
  const plan = useAuthStore((s) => s.user?.plan ?? 'free');

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (paywall === null) return null;

  const handleUpgrade = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const { url } = await api.billingCheckout();
      if (url) {
        // Stripe-Checkout ist aktiv → weiterleiten.
        window.location.href = url;
        return;
      }
      setNotice('Die Zahlungsabwicklung ist noch nicht freigeschaltet.');
    } catch (err) {
      setNotice(
        err instanceof ApiRequestError && err.code === 'billing_not_configured'
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Upgrade derzeit nicht möglich.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Lab Visualizer Pro" onClose={closePaywall} maxWidth="max-w-2xl">
      {paywall && (
        <div className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-200">
          {paywall}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-4">
          <div className="mb-1 flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-slate-200">Free</h3>
            <span className="text-sm font-semibold text-slate-400">0 €</span>
          </div>
          <p className="mb-3 text-[11px] text-slate-500">Für den Einstieg ins Homelab.</p>
          <ul className="space-y-1.5">
            {FREE_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-1.5 text-xs text-slate-400">
                <Check size={13} className="mt-0.5 shrink-0 text-slate-500" /> {f}
              </li>
            ))}
          </ul>
          {plan === 'free' && (
            <p className="mt-3 rounded-md bg-slate-800/70 px-2 py-1 text-center text-[11px] text-slate-400">
              Dein aktueller Plan
            </p>
          )}
        </div>

        <div className="relative rounded-lg border border-sky-500/60 bg-sky-500/5 p-4 ring-1 ring-sky-500/30">
          <div className="mb-1 flex items-baseline justify-between">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-sky-300">
              <Crown size={14} /> Pro
            </h3>
            <span className="text-sm font-semibold text-slate-100">
              2,99 € <span className="text-[10px] font-normal text-slate-400">/ Monat</span>
            </span>
          </div>
          <p className="mb-3 text-[11px] text-slate-500">
            Für große Homelabs und professionelle IT-Teams.
          </p>
          <ul className="space-y-1.5">
            {PRO_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-1.5 text-xs text-slate-300">
                <Check size={13} className="mt-0.5 shrink-0 text-sky-400" /> {f}
              </li>
            ))}
          </ul>
          {plan === 'pro' ? (
            <p className="mt-3 rounded-md bg-sky-500/15 px-2 py-1 text-center text-[11px] font-medium text-sky-300">
              Dein aktueller Plan — danke!
            </p>
          ) : (
            <button
              type="button"
              onClick={() => void handleUpgrade()}
              disabled={busy}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md bg-sky-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-700"
            >
              {busy ? <RotateCw size={13} className="animate-spin" /> : <Sparkles size={13} />}
              Auf Pro upgraden
            </button>
          )}
        </div>
      </div>

      {notice && (
        <p className="mt-3 rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-[11px] leading-relaxed text-slate-400">
          {notice}
        </p>
      )}
      <p className="mt-3 text-center text-[10px] text-slate-600">
        Abrechnung monatlich über Stripe · jederzeit kündbar
      </p>
    </Modal>
  );
}
