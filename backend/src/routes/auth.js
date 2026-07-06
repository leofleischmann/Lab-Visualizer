import { Router } from 'express';
import crypto from 'node:crypto';
import { registerSchema, loginSchema, parseOrThrow, ApiError } from '../validation.js';
import { seedExampleForUser } from '../seed.js';
import {
  hashPassword,
  verifyPassword,
  DUMMY_HASH,
  createSession,
  destroySession,
  resolveSession,
  setSessionCookie,
  clearSessionCookie,
  parseCookies,
  sessionCookieName,
  rateLimit,
} from '../auth.js';

// Registrierung standardmäßig offen; kann per Env gesperrt werden.
const ALLOW_REGISTRATION = process.env.ALLOW_REGISTRATION !== 'false';

export function authRouter(db) {
  const router = Router();

  // Brute-Force-Schutz: wenige Versuche pro IP und Zeitfenster.
  const limiter = rateLimit({ max: 20, windowMs: 15 * 60 * 1000 });

  // POST /api/auth/register — neuen Account anlegen, Beispielprojekt seeden, einloggen
  router.post('/register', limiter, async (req, res, next) => {
    try {
      if (!ALLOW_REGISTRATION) throw new ApiError(403, 'Registrierung ist deaktiviert');
      const { email, password } = parseOrThrow(registerSchema, req.body);
      if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
        throw new ApiError(409, 'Diese E-Mail ist bereits registriert');
      }
      const id = crypto.randomUUID();
      const ts = new Date().toISOString();
      const passwordHash = await hashPassword(password);
      db.transaction(() => {
        db.prepare(
          'INSERT INTO users (id, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
        ).run(id, email, passwordHash, ts, ts);
        seedExampleForUser(db, id);
      })();
      const { token } = createSession(db, id);
      setSessionCookie(req, res, token);
      res.status(201).json({ user: { id, email } });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/auth/login — anmelden
  router.post('/login', limiter, async (req, res, next) => {
    try {
      const { email, password } = parseOrThrow(loginSchema, req.body);
      const user = db.prepare('SELECT id, email, password_hash FROM users WHERE email = ?').get(email);
      // Auch bei unbekannter E-Mail einen (Dummy-)Hash verifizieren → gleiche Antwortzeit.
      const ok = await verifyPassword(password, user ? user.password_hash : DUMMY_HASH);
      if (!user || !ok) throw new ApiError(401, 'Ungültige Zugangsdaten');
      const { token } = createSession(db, user.id);
      setSessionCookie(req, res, token);
      res.json({ user: { id: user.id, email: user.email } });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/auth/logout — Session serverseitig löschen
  router.post('/logout', (req, res) => {
    destroySession(db, parseCookies(req)[sessionCookieName]);
    clearSessionCookie(req, res);
    res.status(204).end();
  });

  // GET /api/auth/me — aktueller Nutzer (Frontend-Bootstrap)
  router.get('/me', (req, res) => {
    const session = resolveSession(db, parseCookies(req)[sessionCookieName]);
    if (!session) {
      clearSessionCookie(req, res);
      return res.status(401).json({ error: 'Nicht angemeldet' });
    }
    if (session.renewed) setSessionCookie(req, res, parseCookies(req)[sessionCookieName]);
    res.json({ user: { id: session.userId, email: session.email } });
  });

  return router;
}
