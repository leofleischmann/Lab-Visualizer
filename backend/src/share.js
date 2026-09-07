/**
 * Read-only-Freigabelinks: ein Projekt ohne Konto lesbar machen.
 *
 * Beeinflusst: backend/src/routes/share.js (oeffentliche Route),
 * backend/src/routes/projects.js (Verwaltung), backend/src/db.js (share_links).
 *
 * SICHERHEIT — die Regeln, an denen so etwas ueblicherweise scheitert:
 *
 * 1. Das Klartext-Token steht NUR im Link. Gespeichert wird sein sha256-Hash,
 *    genau wie bei den Sitzungen (auth.js). Nach dem Anlegen gibt die API es
 *    nie wieder aus — wer den Link verliert, legt einen neuen an.
 * 2. Ein Link gibt GENAU EIN Projekt frei. Die oeffentliche Antwort enthaelt
 *    weder die E-Mail des Besitzers noch dessen andere Projekte, und Bilder
 *    sind nur abrufbar, wenn dieses Projekt sie auch benutzt (sonst waere der
 *    Link ein Leseschluessel fuer die ganze Bildbibliothek).
 * 3. Schreiben ist ueber diesen Weg nicht moeglich: die Route bietet nur GET.
 * 4. Ein Link kann jederzeit widerrufen werden und optional ablaufen.
 */
import crypto from 'node:crypto';

/** Laenge des Tokens in Bytes. 32 Byte = 256 Bit, wie bei den Sitzungen. */
const TOKEN_BYTES = 32;

export function createShareToken() {
  const token = crypto.randomBytes(TOKEN_BYTES).toString('base64url');
  return { token, hash: hashShareToken(token) };
}

export function hashShareToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Ein Link ist abgelaufen, wenn `expiresAt` gesetzt und vergangen ist. */
export function isExpired(link, now = new Date()) {
  return !!link.expiresAt && new Date(link.expiresAt) <= now;
}
