import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);

// scrypt-Parameter: N=16384 (~16 MiB Speicher), r=8, p=1 → memory-hard, aber
// serverfreundlich. maxmem großzügig, damit spätere N-Erhöhungen nicht scheitern.
const SCRYPT_N = 16384;
const SCRYPT_KEYLEN = 64;
const SCRYPT_OPTS = { N: SCRYPT_N, maxmem: 64 * 1024 * 1024 };

const COOKIE_NAME = 'sid';
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_DAYS || 30) * 24 * 60 * 60 * 1000;

// ── Passwörter (scrypt, keine externe Dependency) ───────────────

/** Erzeugt einen Passwort-Hash im Format `scrypt$N$saltHex$hashHex`. */
export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt, SCRYPT_KEYLEN, SCRYPT_OPTS);
  return `scrypt$${SCRYPT_N}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

/** Prüft ein Passwort gegen einen gespeicherten Hash (konstante Zeit). */
export async function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt') return false;
  const N = Number(parts[1]);
  const salt = Buffer.from(parts[2], 'hex');
  const expected = Buffer.from(parts[3], 'hex');
  if (!Number.isInteger(N) || salt.length === 0 || expected.length === 0) return false;
  let derived;
  try {
    derived = await scrypt(password, salt, expected.length, { N, maxmem: SCRYPT_OPTS.maxmem });
  } catch {
    return false;
  }
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
}

/**
 * Fester Dummy-Hash, gegen den bei unbekannter E-Mail verifiziert wird, damit
 * Login-Antwortzeiten keine Rückschlüsse auf existierende Konten zulassen.
 */
export const DUMMY_HASH = (() => {
  const salt = Buffer.alloc(16, 0);
  const derived = crypto.scryptSync('invalid-password', salt, SCRYPT_KEYLEN, SCRYPT_OPTS);
  return `scrypt$${SCRYPT_N}$${salt.toString('hex')}$${derived.toString('hex')}`;
})();

// ── Sessions (serverseitig, Token nur im Cookie) ────────────────

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

/** Legt eine Session an und liefert das Klartext-Token (nur hier verfügbar). */
export function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  db.prepare(
    'INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
  ).run(
    hashToken(token),
    userId,
    new Date(now).toISOString(),
    new Date(now + SESSION_TTL_MS).toISOString()
  );
  return { token };
}

export function destroySession(db, token) {
  if (!token) return;
  db.prepare('DELETE FROM sessions WHERE id = ?').run(hashToken(token));
}

/**
 * Löst ein Session-Token zu einem Nutzer auf. Abgelaufene Sessions werden gelöscht.
 * Sliding-Renewal: läuft weniger als die halbe TTL, wird verlängert (`renewed`).
 * @returns {{userId: string, email: string, renewed: boolean} | null}
 */
export function resolveSession(db, token) {
  if (!token) return null;
  const id = hashToken(token);
  const row = db
    .prepare(
      `SELECT s.expires_at AS expiresAt, u.id AS userId, u.email AS email
       FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.id = ?`
    )
    .get(id);
  if (!row) return null;
  const expires = Date.parse(row.expiresAt);
  if (!(expires > Date.now())) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
    return null;
  }
  let renewed = false;
  if (expires - Date.now() < SESSION_TTL_MS / 2) {
    db.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').run(
      new Date(Date.now() + SESSION_TTL_MS).toISOString(),
      id
    );
    renewed = true;
  }
  return { userId: row.userId, email: row.email, renewed };
}

// ── Cookies ─────────────────────────────────────────────────────

/** Liest die Cookies eines Requests (ohne cookie-parser-Dependency). */
export function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (!key) continue;
    out[key] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

/**
 * Secure-Flag des Session-Cookies:
 * 1. explizit per `COOKIE_SECURE` (true/false),
 * 2. in Produktion (`NODE_ENV=production`) standardmäßig true — der öffentliche
 *    Zugriff läuft über HTTPS (Cloudflare), auch wenn der interne Tunnel-Hop http ist,
 * 3. sonst automatisch anhand der Verbindung (`req.secure`) für lokalen HTTP-Betrieb.
 */
function cookieSecure(req) {
  if (process.env.COOKIE_SECURE === 'true') return true;
  if (process.env.COOKIE_SECURE === 'false') return false;
  if (process.env.NODE_ENV === 'production') return true;
  return !!req.secure; // benötigt trust proxy + X-Forwarded-Proto hinter nginx
}

export function setSessionCookie(req, res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure(req),
    path: '/',
    maxAge: SESSION_TTL_MS,
  });
}

export function clearSessionCookie(req, res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure(req),
    path: '/',
  });
}

export const sessionCookieName = COOKIE_NAME;

// ── Middleware ──────────────────────────────────────────────────

/** Verlangt eine gültige Session; setzt req.userId / req.userEmail oder antwortet 401. */
export function requireAuth(db) {
  return (req, res, next) => {
    const token = parseCookies(req)[COOKIE_NAME];
    const session = resolveSession(db, token);
    if (!session) {
      clearSessionCookie(req, res);
      return res.status(401).json({ error: 'Nicht angemeldet' });
    }
    if (session.renewed) setSessionCookie(req, res, token);
    req.userId = session.userId;
    req.userEmail = session.email;
    next();
  };
}

/**
 * CSRF-Schutz: Bei zustandsändernden Methoden muss der Origin (falls vom Browser
 * gesendet) zum Host passen. Programmatische Clients (curl, Skripte) senden keinen
 * Origin und werden durchgelassen — sie benötigen ohnehin ein gültiges Session-Cookie.
 */
export function originGuard(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const origin = req.get('origin');
  if (!origin) return next();
  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    return res.status(403).json({ error: 'Invalid Origin header' });
  }
  if (originHost !== req.get('host')) {
    return res.status(403).json({ error: 'Origin not allowed (CSRF protection)' });
  }
  next();
}

/**
 * Einfaches In-Memory-Rate-Limit pro IP (fixed window). Schützt Login/Registrierung
 * vor Brute-Force. Für einen Single-Node-Self-Host ausreichend; kein externer Store.
 */
export function rateLimit({ max, windowMs }) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    // Hinter Cloudflare ist `CF-Connecting-IP` die echte Client-IP (Cloudflare
    // überschreibt einen ggf. mitgeschickten Wert). Das Backend ist nur über den
    // Tunnel/nginx erreichbar, daher ist der Header hier vertrauenswürdig.
    const cfIp = req.headers['cf-connecting-ip'];
    const key =
      (Array.isArray(cfIp) ? cfIp[0] : cfIp) || req.ip || req.socket?.remoteAddress || 'unknown';
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    // Gelegentliches Aufräumen, damit die Map nicht unbegrenzt wächst.
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    }
    if (entry.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ error: 'Too many attempts. Please try again later.' });
    }
    next();
  };
}
