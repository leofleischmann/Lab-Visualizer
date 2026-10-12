import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { resolveApiKey, API_KEY_PREFIX } from './apiKeys.js';
import { debugLog } from './debug.js';

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
//
// Zwei Wege zur Anmeldung, beide setzen req.userId / req.userEmail / req.auth:
//
//   Session-Cookie `sid`          Browser-UI. req.auth = { method: 'session', scope: 'write' }
//   Authorization: Bearer lvk_…   Skripte, Integrationen, MCP (backend/src/apiKeys.js).
//                                 req.auth = { method: 'apiKey', scope, keyId }
//
// Als API-Key zählt NUR `Authorization: Bearer lvk_…`. Andere Header (Basic-Auth
// eines vorgeschalteten Reverse-Proxys, Bearer-Token eines OAuth2-Proxys) werden
// ignoriert: der Browser schickt sie dort bei JEDEM Request mit, die Web-UI
// muss dann weiter über ihr Cookie laufen - und der CSRF-Schutz darf für sie
// nicht entfallen (Basic-Auth hängt der Browser auch an fremde Formulare an).
//
// Ein gesendeter API-Key hat Vorrang und fällt NIE auf das Cookie zurück:
// ein ungültiger Key ist ein 401, auch wenn zufällig eine Session besteht -
// sonst würde ein falsch konfiguriertes Skript unbemerkt mit Browser-Rechten laufen.
//
// Beeinflusst: backend/src/app.js (welche Route welche Middleware bekommt),
// backend/src/routes/auth.js (/auth/me), backend/src/mcp/ (nur Bearer),
// backend/src/openapi.js (securitySchemes und x-auth je Operation).

/** Methoden, die ein `read`-Key benutzen darf. */
const READ_METHODS = new Set(['GET', 'HEAD']);

/**
 * API-Key aus dem Authorization-Header (`Bearer lvk_…`), sonst null. Ob der Key
 * gültig ist, prüft erst resolveApiKey.
 */
export function apiKeyFromRequest(req) {
  const match = /^Bearer\s+(\S+)\s*$/i.exec(req.get('authorization') ?? '');
  return match && match[1].startsWith(API_KEY_PREFIX) ? match[1] : null;
}

/** 401 für einen fehlenden oder ungültigen API-Key (RFC 6750). */
function rejectApiKey(res, message) {
  res.set('WWW-Authenticate', 'Bearer realm="Lab Visualizer", error="invalid_token"');
  return res.status(401).json({ error: message });
}

/**
 * Löst den Bearer-Header auf und setzt req.auth. Antwortet selbst mit 401 und
 * liefert dann false.
 */
function applyApiKey(db, req, res, token) {
  const key = resolveApiKey(db, token);
  if (!key) {
    debugLog('auth', 'rejected API key', { path: req.originalUrl });
    rejectApiKey(res, 'Invalid or expired API key');
    return false;
  }
  req.userId = key.userId;
  req.userEmail = key.email;
  req.auth = { method: 'apiKey', scope: key.scope, keyId: key.keyId };
  return true;
}

/**
 * Verlangt eine gültige Session ODER einen API-Key. Ein `read`-Key darf nur
 * lesende Methoden benutzen (403 + code "insufficient_scope").
 */
export function requireAuth(db) {
  return (req, res, next) => {
    const apiKey = apiKeyFromRequest(req);
    if (apiKey !== null) {
      if (!applyApiKey(db, req, res, apiKey)) return;
      if (req.auth.scope === 'read' && !READ_METHODS.has(req.method)) {
        return res.status(403).json({
          error: 'This API key is read-only. Create a key with the "write" scope to change data.',
          code: 'insufficient_scope',
        });
      }
      return next();
    }
    const token = parseCookies(req)[COOKIE_NAME];
    const session = resolveSession(db, token);
    if (!session) {
      clearSessionCookie(req, res);
      // Ein fremder Authorization-Header deutet auf einen falsch übergebenen Key hin.
      const hint = req.get('authorization') ? ' - send an API key as "Authorization: Bearer lvk_…"' : '';
      return res.status(401).json({ error: `Not signed in${hint}` });
    }
    if (session.renewed) setSessionCookie(req, res, token);
    req.userId = session.userId;
    req.userEmail = session.email;
    req.auth = { method: 'session', scope: 'write' };
    next();
  };
}

/**
 * Nur mit Session, nie mit API-Key: für die Verwaltung der Keys selbst. Läuft
 * NACH requireAuth.
 */
export function requireSession(req, res, next) {
  if (req.auth?.method !== 'session') {
    return res.status(403).json({
      error: 'API keys cannot be managed with an API key. Sign in to the web app instead.',
      code: 'session_required',
    });
  }
  next();
}

/**
 * Nur API-Key (Bearer), keine Session: für den MCP-Server. MCP-Clients sind
 * Programme; ein Cookie-Zugang würde dort nur CSRF und DNS-Rebinding eine Tür
 * öffnen. Der Scope wird nicht an der HTTP-Methode geprüft (MCP ist immer
 * POST), sondern pro Tool (backend/src/mcp/tools.js).
 */
export function requireApiKey(db) {
  return (req, res, next) => {
    const apiKey = apiKeyFromRequest(req);
    if (apiKey === null) {
      return rejectApiKey(res, 'An API key is required: send "Authorization: Bearer lvk_…"');
    }
    if (!applyApiKey(db, req, res, apiKey)) return;
    next();
  };
}

/** Zusätzlich erlaubte Cross-Origins (CORS_ORIGIN, kommagetrennt). */
function allowedCrossOrigins() {
  return (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Darf ein Request mit diesem Origin-Header schreiben? Ohne Origin (curl,
 * Skripte) ja; sonst muss er zum Host passen oder in CORS_ORIGIN stehen.
 * Ohne den CORS_ORIGIN-Abgleich wäre die Option für schreibende Requests
 * wirkungslos: der Browser darf dann zwar quer zugreifen, der Guard lehnt aber ab.
 *
 * Beeinflusst: originGuard (CSRF) und backend/src/routes/mcp.js (Origin-Prüfung,
 * von der MCP-Spezifikation verlangt).
 */
export function isOriginAllowed(req) {
  const origin = req.get('origin');
  if (!origin) return true;
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  return parsed.host === req.get('host') || allowedCrossOrigins().includes(parsed.origin);
}

/**
 * CSRF-Schutz: Bei zustandsändernden Methoden muss der Origin (falls vom Browser
 * gesendet) zum Host passen. Programmatische Clients (curl, Skripte) senden keinen
 * Origin und werden durchgelassen - sie benötigen ohnehin gültige Zugangsdaten.
 *
 * Requests mit API-Key (`Bearer lvk_…`) sind nicht CSRF-fähig: ein Browser hängt
 * einen Bearer-Header nie von selbst an, und eine fremde Seite kann ihn nur über
 * einen CORS-Preflight setzen, den der Server ohne CORS_ORIGIN nicht beantwortet.
 * Sie werden daher nicht am Origin gemessen (nötig für browserbasierte
 * Integrationen). Ein Basic-Auth-Header zählt ausdrücklich NICHT dazu.
 */
export function originGuard(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  if (apiKeyFromRequest(req) !== null) return next();
  if (!isOriginAllowed(req)) {
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
