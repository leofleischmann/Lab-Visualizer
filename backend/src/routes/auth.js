import { Router } from 'express';
import crypto from 'node:crypto';
import {
  registerSchema,
  loginSchema,
  passwordChangeSchema,
  accountDeleteSchema,
  parseOrThrow,
  ApiError,
} from '../validation.js';
import { seedExampleForUser } from '../seed.js';
import { getPlanLimits } from '../plans.js';
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
      const limits = getPlanLimits(db, id);
      res.status(201).json({
        user: { id, email, plan: limits.plan },
        limits: { maxProjects: limits.maxProjects, maxViewsPerProject: limits.maxViewsPerProject },
      });
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
      const limits = getPlanLimits(db, user.id);
      res.json({
        user: { id: user.id, email: user.email, plan: limits.plan },
        limits: { maxProjects: limits.maxProjects, maxViewsPerProject: limits.maxViewsPerProject },
      });
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

  // GET /api/auth/me — aktueller Nutzer inkl. Plan & Limits (Frontend-Bootstrap)
  router.get('/me', (req, res) => {
    const session = resolveSession(db, parseCookies(req)[sessionCookieName]);
    if (!session) {
      clearSessionCookie(req, res);
      return res.status(401).json({ error: 'Nicht angemeldet' });
    }
    if (session.renewed) setSessionCookie(req, res, parseCookies(req)[sessionCookieName]);
    const limits = getPlanLimits(db, session.userId);
    res.json({
      user: { id: session.userId, email: session.email, plan: limits.plan },
      limits: { maxProjects: limits.maxProjects, maxViewsPerProject: limits.maxViewsPerProject },
    });
  });

  // POST /api/auth/password — Passwort ändern; beendet alle ANDEREN Sessions.
  router.post('/password', limiter, async (req, res, next) => {
    try {
      const token = parseCookies(req)[sessionCookieName];
      const session = resolveSession(db, token);
      if (!session) throw new ApiError(401, 'Nicht angemeldet');
      const { currentPassword, newPassword } = parseOrThrow(passwordChangeSchema, req.body);
      const user = db
        .prepare('SELECT password_hash FROM users WHERE id = ?')
        .get(session.userId);
      if (!user || !(await verifyPassword(currentPassword, user.password_hash))) {
        throw new ApiError(401, 'Aktuelles Passwort ist falsch');
      }
      const passwordHash = await hashPassword(newPassword);
      db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
        passwordHash,
        new Date().toISOString(),
        session.userId
      );
      // Sicherheitsnetz: alle anderen Geräte/Sessions sofort abmelden.
      db.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').run(
        session.userId,
        crypto.createHash('sha256').update(token).digest('hex')
      );
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/auth/account — Konto inkl. ALLER Daten löschen (Passwort nötig).
  router.delete('/account', limiter, async (req, res, next) => {
    try {
      const token = parseCookies(req)[sessionCookieName];
      const session = resolveSession(db, token);
      if (!session) throw new ApiError(401, 'Nicht angemeldet');
      const { password } = parseOrThrow(accountDeleteSchema, req.body);
      const user = db
        .prepare('SELECT password_hash FROM users WHERE id = ?')
        .get(session.userId);
      if (!user || !(await verifyPassword(password, user.password_hash))) {
        throw new ApiError(401, 'Passwort ist falsch');
      }
      // ON DELETE CASCADE räumt Sessions, Projekte, Ebenen, Nodes und Kanten ab.
      db.prepare('DELETE FROM users WHERE id = ?').run(session.userId);
      clearSessionCookie(req, res);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
