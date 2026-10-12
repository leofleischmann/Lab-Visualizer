/**
 * API-Keys: dauerhafte Zugangsschluessel fuer Skripte, Integrationen und den
 * MCP-Server. Gesendet als `Authorization: Bearer lvk_…`.
 *
 * Beeinflusst: backend/src/auth.js (Bearer-Aufloesung in requireAuth /
 * requireApiKey), backend/src/routes/apiKeys.js (Verwaltung), backend/src/mcp/
 * (der Scope bestimmt die angebotenen Tools), backend/src/db.js (api_keys),
 * backend/src/openapi.js (Doku), frontend/src/components/account/ApiKeysDialog.tsx.
 *
 * SICHERHEIT - dieselben Regeln wie bei Sessions und Freigabelinks:
 *
 * 1. Gespeichert wird nur sha256(token). Das Token hat 256 Bit Zufall, ein
 *    langsamer Hash (scrypt) braeuchte es dafuer nicht. Die API gibt das
 *    Klartext-Token GENAU EINMAL aus - in der Antwort auf das Anlegen.
 * 2. Zwei Scopes: `read` erlaubt nur lesende Methoden (GET/HEAD) bzw. die
 *    lesenden MCP-Tools, `write` alles auf den Datenendpunkten.
 * 3. Kontoverwaltung (Passwort, Konto loeschen, API-Keys) geht NIE mit einem
 *    Key, nur mit einer Session - sonst koennte sich ein geleakter read-Key
 *    selbst einen write-Key ausstellen.
 * 4. Das Praefix `lvk_` macht geleakte Keys fuer Secret-Scanner erkennbar.
 */
import crypto from 'node:crypto';
import { ApiError, API_KEY_SCOPES } from './validation.js';
import { limitError } from './limits.js';
import { debugLog } from './debug.js';

export const API_KEY_PREFIX = 'lvk_';
// Die Scopes selbst stehen in validation.js (Zod-Enum), hier nur weitergereicht.
export { API_KEY_SCOPES };

/** 32 Byte = 256 Bit, wie bei Sessions und Freigabelinks. */
const TOKEN_BYTES = 32;

/** So viele Zeichen des Tokens (inkl. Praefix) bleiben zum Wiedererkennen stehen. */
const DISPLAY_PREFIX_LENGTH = 12;

/**
 * Technischer Riegel, keine Plan-Grenze: verhindert, dass ein Skript in einer
 * Schleife die Tabelle fuellt. Ueberschreiten -> 403 mit code "limit_reached".
 */
export const MAX_API_KEYS_PER_USER = 50;

/**
 * `last_used_at` hoechstens einmal pro Minute schreiben. Ohne diese Bremse
 * kostet jeder einzelne API-Aufruf (auch jeder Lesezugriff) einen Write.
 */
const LAST_USED_THROTTLE_MS = 60 * 1000;

export function hashApiKey(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function rowToApiKey(row) {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scope: row.scope,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    lastUsedAt: row.last_used_at,
  };
}

const isExpired = (expiresAt, now = Date.now()) => !!expiresAt && Date.parse(expiresAt) <= now;

export function listApiKeys(db, userId) {
  return db
    .prepare('SELECT * FROM api_keys WHERE user_id = ? ORDER BY created_at DESC')
    .all(userId)
    .map(rowToApiKey);
}

/**
 * Legt einen Key an und gibt das Klartext-Token EINMALIG zurueck. Ein
 * verlorener Key laesst sich nicht wiederherstellen, nur ersetzen.
 */
export function createApiKey(db, userId, { name, scope, expiresAt = null }) {
  const count = db.prepare('SELECT count(*) AS c FROM api_keys WHERE user_id = ?').get(userId).c;
  if (count >= MAX_API_KEYS_PER_USER) {
    throw limitError(`At most ${MAX_API_KEYS_PER_USER} API keys per account. Revoke unused keys first.`);
  }
  if (isExpired(expiresAt)) {
    throw new ApiError(400, 'expiresAt must be in the future');
  }
  const token = API_KEY_PREFIX + crypto.randomBytes(TOKEN_BYTES).toString('base64url');
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO api_keys (id, user_id, key_hash, prefix, name, scope, created_at, expires_at)
     VALUES (@id, @user_id, @key_hash, @prefix, @name, @scope, @created_at, @expires_at)`
  ).run({
    id,
    user_id: userId,
    key_hash: hashApiKey(token),
    prefix: token.slice(0, DISPLAY_PREFIX_LENGTH),
    name,
    scope,
    created_at: new Date().toISOString(),
    expires_at: expiresAt,
  });
  debugLog('apiKeys', 'created', { id, scope, expiresAt });
  return { ...rowToApiKey(db.prepare('SELECT * FROM api_keys WHERE id = ?').get(id)), token };
}

/** Widerruft einen Key. Fremde IDs verhalten sich wie nicht vorhanden (404). */
export function revokeApiKey(db, userId, id) {
  const result = db.prepare('DELETE FROM api_keys WHERE id = ? AND user_id = ?').run(id, userId);
  if (!result.changes) throw new ApiError(404, 'API key not found');
  debugLog('apiKeys', 'revoked', { id });
  return { revoked: 1 };
}

/**
 * Loest ein Klartext-Token auf. Unbekannt, falsches Format oder abgelaufen ->
 * null; der Aufrufer antwortet dann 401. Abgelaufene Keys bleiben bewusst
 * stehen (anders als Sessions): die UI zeigt sie als "expired", bis der Nutzer
 * sie widerruft - sonst verschwaende ein Key kommentarlos aus der Liste.
 * @returns {{keyId: string, userId: string, email: string, scope: 'read'|'write'} | null}
 */
export function resolveApiKey(db, token) {
  if (typeof token !== 'string' || !token.startsWith(API_KEY_PREFIX)) return null;
  const row = db
    .prepare(
      `SELECT k.id AS keyId, k.scope AS scope, k.expires_at AS expiresAt,
              k.last_used_at AS lastUsedAt, u.id AS userId, u.email AS email
       FROM api_keys k JOIN users u ON k.user_id = u.id WHERE k.key_hash = ?`
    )
    .get(hashApiKey(token));
  if (!row || isExpired(row.expiresAt)) return null;
  const now = Date.now();
  if (!row.lastUsedAt || now - Date.parse(row.lastUsedAt) > LAST_USED_THROTTLE_MS) {
    db.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?').run(
      new Date(now).toISOString(),
      row.keyId
    );
  }
  return { keyId: row.keyId, userId: row.userId, email: row.email, scope: row.scope };
}
