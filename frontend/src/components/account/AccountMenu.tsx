import { useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  KeyRound,
  LogOut,
  RotateCw,
  Trash2,
  UserRound,
} from 'lucide-react';
import { useAuthStore } from '../../store/auth';
import { Modal } from '../ui/Modal';
import { LegalLinks } from '../ui/LegalLinks';

/**
 * Konto-Menü in der TopBar: Passwort ändern, Konto löschen, Abmelden —
 * plus die Obergrenzen dieser Instanz, falls welche gesetzt sind.
 */
export function AccountMenu() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const limits = useAuthStore((s) => s.limits);

  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<'password' | 'delete' | null>(null);

  if (!user) return null;

  // Auf einer unlimitierten (z. B. selbst gehosteten) Instanz gibt es nichts anzuzeigen.
  const limitSummary = [
    [limits?.maxProjectsPerUser, 'Projekt', 'Projekte'],
    [limits?.maxViewsPerProject, 'Ebene', 'Ebenen'],
    [limits?.maxNodesPerProject, 'Node', 'Nodes'],
  ]
    .filter(([value]) => typeof value === 'number')
    .map(([value, one, many]) => `${value} ${value === 1 ? one : many}`)
    .join(' · ');

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-md border border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-sky-500 hover:text-sky-300"
        title="Konto"
      >
        <UserRound size={14} />
        <span className="hidden max-w-[12rem] truncate xl:block">{user.email}</span>
        <ChevronDown size={13} className="text-slate-500" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-40 w-64 rounded-lg border border-slate-700 bg-slate-900 p-1.5 shadow-2xl shadow-black/60">
            <div className="border-b border-slate-800 px-2.5 py-2">
              <p className="truncate text-xs font-medium text-slate-200">{user.email}</p>
              {limitSummary && (
                <p className="mt-0.5 text-[10px] text-slate-500">
                  Grenzen dieser Instanz: {limitSummary}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setDialog('password');
                setOpen(false);
              }}
              className="mt-1 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs text-slate-300 transition-colors hover:bg-slate-800"
            >
              <KeyRound size={13} className="text-slate-500" /> Passwort ändern
            </button>
            <button
              type="button"
              onClick={() => {
                setDialog('delete');
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs text-red-400 transition-colors hover:bg-red-500/10"
            >
              <Trash2 size={13} /> Konto löschen …
            </button>

            <div className="mt-1 border-t border-slate-800 pt-1">
              <button
                type="button"
                onClick={() => void logout()}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs text-slate-300 transition-colors hover:bg-slate-800"
              >
                <LogOut size={13} className="text-slate-500" /> Abmelden
              </button>

              <LegalLinks className="mt-1.5 border-t border-slate-800 pt-2" />
            </div>
          </div>
        </>
      )}

      {dialog === 'password' && <PasswordDialog onClose={() => setDialog(null)} />}
      {dialog === 'delete' && <DeleteAccountDialog onClose={() => setDialog(null)} />}
    </div>
  );
}

function PasswordDialog({ onClose }: { onClose: () => void }) {
  const changePassword = useAuthStore((s) => s.changePassword);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next.length < 8) return setError('Das neue Passwort braucht mindestens 8 Zeichen.');
    if (next !== repeat) return setError('Die neuen Passwörter stimmen nicht überein.');
    setBusy(true);
    const ok = await changePassword(current, next);
    setBusy(false);
    if (ok) {
      setDone(true);
      setTimeout(onClose, 1200);
    } else {
      // Fehlertext kommt aus dem Auth-Store (z. B. „Aktuelles Passwort ist falsch").
      setError(useAuthStore.getState().error ?? 'Passwort konnte nicht geändert werden.');
      useAuthStore.getState().setError(null);
    }
  };

  return (
    <Modal title="Passwort ändern" onClose={onClose}>
      {done ? (
        <p className="flex items-center gap-2 rounded-md border border-emerald-700/50 bg-emerald-950/50 px-3 py-2.5 text-xs text-emerald-300">
          <Check size={14} /> Passwort geändert. Andere Geräte wurden abgemeldet.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Aktuelles Passwort
            <input
              type="password"
              autoComplete="current-password"
              required
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition-colors focus:border-sky-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Neues Passwort
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              placeholder="Mindestens 8 Zeichen"
              className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition-colors focus:border-sky-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Neues Passwort wiederholen
            <input
              type="password"
              autoComplete="new-password"
              required
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
              className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition-colors focus:border-sky-500"
            />
          </label>
          {error && (
            <p className="flex items-start gap-2 rounded-md border border-red-900/60 bg-red-950/60 px-3 py-2 text-xs text-red-300">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {error}
            </p>
          )}
          <p className="text-[10px] leading-relaxed text-slate-600">
            Aus Sicherheitsgründen werden nach der Änderung alle anderen Sitzungen beendet.
          </p>
          <button
            type="submit"
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-md bg-sky-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-700"
          >
            {busy && <RotateCw size={13} className="animate-spin" />} Passwort ändern
          </button>
        </form>
      )}
    </Modal>
  );
}

function DeleteAccountDialog({ onClose }: { onClose: () => void }) {
  const deleteAccount = useAuthStore((s) => s.deleteAccount);
  const email = useAuthStore((s) => s.user?.email ?? '');
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (confirmText.trim().toLowerCase() !== email.toLowerCase()) {
      return setError('Bitte gib zur Bestätigung deine E-Mail-Adresse ein.');
    }
    setBusy(true);
    const ok = await deleteAccount(password);
    setBusy(false);
    if (!ok) {
      setError(useAuthStore.getState().error ?? 'Konto konnte nicht gelöscht werden.');
      useAuthStore.getState().setError(null);
    }
    // Bei Erfolg wechselt die App automatisch zum Login (status → anon).
  };

  return (
    <Modal title="Konto unwiderruflich löschen" onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <p className="rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2.5 text-xs leading-relaxed text-red-300">
          Dein Konto und <strong>alle</strong> Projekte, Ebenen, Nodes und Verbindungen werden
          dauerhaft gelöscht. Das kann nicht rückgängig gemacht werden — exportiere vorher ein
          Backup, falls du die Daten behalten willst.
        </p>
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          E-Mail zur Bestätigung ({email})
          <input
            type="text"
            required
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={email}
            spellCheck={false}
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition-colors focus:border-red-500"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Passwort
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition-colors focus:border-red-500"
          />
        </label>
        {error && (
          <p className="flex items-start gap-2 rounded-md border border-red-900/60 bg-red-950/60 px-3 py-2 text-xs text-red-300">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="flex items-center justify-center gap-2 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-slate-700"
        >
          {busy ? <RotateCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
          Konto endgültig löschen
        </button>
      </form>
    </Modal>
  );
}
