/**
 * Hochgeladene Bilder: Typ-Erkennung, Grenzen und die Auslieferungs-Header.
 *
 * Beeinflusst: backend/src/routes/assets.js (Upload & Ausliefern),
 * backend/src/store.js (Ablage), frontend/src/lib/icons.tsx (Anzeige).
 *
 * SICHERHEIT — der Grund, warum dieses Modul existiert:
 *
 * 1. SVG ist ein AKTIVES Format. Es darf <script>, onload und externe
 *    Referenzen enthalten. Deshalb gilt an drei Stellen eine Regel:
 *      - Das Frontend bindet Assets ausschliesslich ueber <img src> ein, nie
 *        inline ins DOM. In einem <img> fuehrt der Browser kein Script aus.
 *      - Diese Datei liefert Antwort-Header, die auch den DIREKTEN Aufruf der
 *        Bild-URL entschaerfen (siehe assetHeaders).
 *      - Der Typ wird an den Magic Bytes erkannt, nicht am Content-Type des
 *        Clients: sonst koennte ein Angreifer SVG als "image/png" deklarieren.
 *
 * 2. Externe Bild-URLs sind bewusst NICHT vorgesehen. Sie wuerden die CSP in
 *    frontend/nginx.conf (img-src 'self' data:) aufweichen, das Versprechen
 *    "offline-faehig, keine externen CDNs" brechen und die IP jedes Betrachters
 *    an fremde Server verraten.
 */
import { ApiError } from './validation.js';

/** Erlaubte Bildtypen. Reihenfolge egal, Erkennung laeuft ueber die Signatur. */
export const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

const startsWith = (buf, bytes) =>
  buf.length >= bytes.length && bytes.every((b, i) => buf[i] === b);

/**
 * Erkennt den Bildtyp an der Signatur der Datei.
 * @returns {string|null} MIME-Typ oder null, wenn es kein erlaubtes Bild ist.
 */
export function sniffMime(buf) {
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  // WebP: "RIFF" .... "WEBP"
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && buf.length > 12 &&
      buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  // SVG ist Text: BOM und fuehrenden Leerraum/Kommentare ueberspringen.
  const head = buf.toString('utf8', 0, Math.min(buf.length, 1024)).replace(/^﻿/, '').trimStart();
  if (/^<(\?xml|!DOCTYPE\s+svg|svg[\s>])/i.test(head)) return 'image/svg+xml';
  return null;
}

/**
 * Antwort-Header fuer ein ausgeliefertes Asset.
 *
 * Die CSP hier greift, wenn jemand die Bild-URL DIREKT im Browser oeffnet: ein
 * SVG wuerde dann als Dokument gerendert und duerfte ohne diese Header Skripte
 * ausfuehren. `sandbox` nimmt ihm zusaetzlich den Origin.
 *
 * Assets sind unveraenderlich (nur anlegen und loeschen, kein Aendern), deshalb
 * darf der Browser sie dauerhaft cachen. `private`, weil sie zu einem Konto
 * gehoeren und ein geteilter Proxy sie nicht vorhalten soll.
 */
export function assetHeaders(asset) {
  return {
    'Content-Type': asset.mime,
    'Content-Length': String(asset.byteSize),
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    'Cache-Control': 'private, max-age=31536000, immutable',
    ETag: `"${asset.id}"`,
  };
}

/**
 * Liest einen Data-URL-Upload (`data:image/png;base64,…`) in einen Buffer.
 * Der im Data-URL genannte Typ wird ignoriert — massgeblich ist die Signatur.
 */
export function decodeDataUrl(dataUrl, maxBytes) {
  const match = /^data:([^;,]*)(;base64)?,/.exec(dataUrl);
  if (!match) throw new ApiError(400, 'Kein gültiger Data-URL');
  const payload = dataUrl.slice(match[0].length);
  const buf = match[2]
    ? Buffer.from(payload, 'base64')
    : Buffer.from(decodeURIComponent(payload), 'utf8');

  if (!buf.length) throw new ApiError(400, 'Die Datei ist leer');
  if (buf.length > maxBytes) {
    throw new ApiError(
      413,
      `Die Datei ist ${Math.round(buf.length / 1024)} kB gross — erlaubt sind ${Math.round(maxBytes / 1024)} kB.`
    );
  }
  const mime = sniffMime(buf);
  if (!mime) {
    throw new ApiError(400, `Kein unterstütztes Bildformat. Erlaubt: ${ALLOWED_MIME.join(', ')}`);
  }
  return { bytes: buf, mime };
}
