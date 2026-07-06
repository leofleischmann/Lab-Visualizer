import { create } from 'zustand';
import { api, ApiRequestError, setUnauthorizedHandler } from '../api/client';
import type { User } from '../api/types';

type AuthStatus = 'loading' | 'authed' | 'anon';

type AuthStore = {
  user: User | null;
  status: AuthStatus;
  error: string | null;

  /** Beim App-Start: bestehende Session prüfen. */
  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  setError: (message: string | null) => void;
};

const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message : 'Unbekannter Fehler';

export const useAuthStore = create<AuthStore>((set) => {
  // Läuft die Session serverseitig ab, meldet der API-Client 401 → zurück zum Login.
  setUnauthorizedHandler(() => set({ user: null, status: 'anon' }));

  return {
    user: null,
    status: 'loading',
    error: null,

    bootstrap: async () => {
      try {
        const { user } = await api.me();
        set({ user, status: 'authed', error: null });
      } catch (err) {
        if (err instanceof ApiRequestError && err.status === 401) {
          set({ user: null, status: 'anon', error: null });
        } else {
          // Netzwerk-/Serverfehler: nicht eingeloggt annehmen, Fehler zeigen.
          set({ user: null, status: 'anon', error: errorMessage(err) });
        }
      }
    },

    login: async (email, password) => {
      try {
        const { user } = await api.login(email, password);
        set({ user, status: 'authed', error: null });
        return true;
      } catch (err) {
        set({ error: errorMessage(err) });
        return false;
      }
    },

    register: async (email, password) => {
      try {
        const { user } = await api.register(email, password);
        set({ user, status: 'authed', error: null });
        return true;
      } catch (err) {
        set({ error: errorMessage(err) });
        return false;
      }
    },

    logout: async () => {
      try {
        await api.logout();
      } catch {
        /* Auch bei Fehler lokal ausloggen. */
      }
      set({ user: null, status: 'anon', error: null });
    },

    setError: (message) => set({ error: message }),
  };
});
