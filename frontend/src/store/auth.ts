import { create } from 'zustand';
import { api, ApiRequestError, setUnauthorizedHandler } from '../api/client';
import type { InstanceLimits, User } from '../api/types';

type AuthStatus = 'loading' | 'authed' | 'anon';

type AuthStore = {
  user: User | null;
  /** Obergrenzen dieser Instanz (null-Felder = unbegrenzt). */
  limits: InstanceLimits | null;
  status: AuthStatus;
  error: string | null;

  /** Beim App-Start: bestehende Session prüfen. */
  bootstrap: () => Promise<void>;
  /** Nutzer und Instanz-Limits neu laden. */
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
  deleteAccount: (password: string) => Promise<boolean>;
  setError: (message: string | null) => void;
};

const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message : 'Unbekannter Fehler';

export const useAuthStore = create<AuthStore>((set) => {
  // Läuft die Session serverseitig ab, meldet der API-Client 401 → zurück zum Login.
  setUnauthorizedHandler(() => set({ user: null, limits: null, status: 'anon' }));

  return {
    user: null,
    limits: null,
    status: 'loading',
    error: null,

    bootstrap: async () => {
      try {
        const { user, limits } = await api.me();
        set({ user, limits, status: 'authed', error: null });
      } catch (err) {
        if (err instanceof ApiRequestError && err.status === 401) {
          set({ user: null, limits: null, status: 'anon', error: null });
        } else {
          // Netzwerk-/Serverfehler: nicht eingeloggt annehmen, Fehler zeigen.
          set({ user: null, limits: null, status: 'anon', error: errorMessage(err) });
        }
      }
    },

    refresh: async () => {
      try {
        const { user, limits } = await api.me();
        set({ user, limits });
      } catch {
        /* Session-Ablauf wird über den 401-Handler abgefangen. */
      }
    },

    login: async (email, password) => {
      try {
        const { user, limits } = await api.login(email, password);
        set({ user, limits, status: 'authed', error: null });
        return true;
      } catch (err) {
        set({ error: errorMessage(err) });
        return false;
      }
    },

    register: async (email, password) => {
      try {
        const { user, limits } = await api.register(email, password);
        set({ user, limits, status: 'authed', error: null });
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
      set({ user: null, limits: null, status: 'anon', error: null });
    },

    changePassword: async (currentPassword, newPassword) => {
      try {
        await api.changePassword(currentPassword, newPassword);
        return true;
      } catch (err) {
        set({ error: errorMessage(err) });
        return false;
      }
    },

    deleteAccount: async (password) => {
      try {
        await api.deleteAccount(password);
        set({ user: null, limits: null, status: 'anon', error: null });
        return true;
      } catch (err) {
        set({ error: errorMessage(err) });
        return false;
      }
    },

    setError: (message) => set({ error: message }),
  };
});
