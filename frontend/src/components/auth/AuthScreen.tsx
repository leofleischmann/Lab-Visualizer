import { useState, type FormEvent } from 'react';
import { AlertTriangle, LogIn, Network, RotateCw, UserPlus } from 'lucide-react';
import { useAuthStore } from '../../store/auth';
import { LegalLinks } from '../ui/LegalLinks';

type Mode = 'login' | 'register';

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const error = useAuthStore((s) => s.error);
  const setError = useAuthStore((s) => s.setError);

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    setError(null);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      if (mode === 'login') await login(email, password);
      else await register(email, password);
    } finally {
      setSubmitting(false);
    }
  };

  const isRegister = mode === 'register';

  return (
    <div className="flex h-full items-center justify-center bg-slate-950 px-4 text-slate-200">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-500/10 text-sky-400">
            <Network size={26} />
          </div>
          <h1 className="text-lg font-semibold text-slate-100">Lab Visualizer</h1>
          <p className="text-xs text-slate-500">
            {isRegister ? 'Create a new account' : 'Sign in to your account'}
          </p>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg border border-slate-800 bg-slate-900/60 p-1 text-xs font-medium">
          <button
            type="button"
            onClick={() => switchMode('login')}
            className={`flex items-center justify-center gap-1.5 rounded-md py-2 transition-colors ${
              !isRegister ? 'bg-sky-500/15 text-sky-300' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <LogIn size={13} /> Sign in
          </button>
          <button
            type="button"
            onClick={() => switchMode('register')}
            className={`flex items-center justify-center gap-1.5 rounded-md py-2 transition-colors ${
              isRegister ? 'bg-sky-500/15 text-sky-300' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <UserPlus size={13} /> Register
          </button>
        </div>

        <form
          onSubmit={onSubmit}
          className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-5"
        >
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Email
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition-colors focus:border-sky-500"
              placeholder="you@example.com"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Password
            <input
              type="password"
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              required
              minLength={isRegister ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition-colors focus:border-sky-500"
              placeholder={isRegister ? 'At least 8 characters' : '••••••••'}
            />
          </label>

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-red-900/60 bg-red-950/60 px-3 py-2 text-xs text-red-300">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-red-400" />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-1 flex items-center justify-center gap-2 rounded-md bg-sky-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-700"
          >
            {submitting ? (
              <>
                <RotateCw size={14} className="animate-spin" />
                Please wait …
              </>
            ) : isRegister ? (
              <>
                <UserPlus size={14} /> Create account
              </>
            ) : (
              <>
                <LogIn size={14} /> Sign in
              </>
            )}
          </button>
        </form>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-slate-600">
          Your projects are private and visible only to your account.
          {isRegister && (
            <>
              <br />
              Free and open source — no paid features, no subscription.
            </>
          )}
        </p>

        {/* Muss ohne Konto erreichbar sein — daher schon auf dem Login-Screen. */}
        <LegalLinks className="mt-3" />
      </div>
    </div>
  );
}
