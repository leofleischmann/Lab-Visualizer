import fs from 'node:fs';
import path from 'node:path';

/**
 * Rechtstexte (Impressum, Datenschutz) — pro Instanz, nicht im Code.
 *
 * Wer Lab Visualizer öffentlich anbietet, braucht in vielen Rechtsräumen eigene
 * Rechtstexte mit den EIGENEN Angaben. Sie dürfen deshalb weder mitgeliefert noch
 * fest verdrahtet sein: Jede Instanz legt ihre Dateien unter `$DATA_DIR/legal/`
 * ab (per Docker also im gemounteten `./data`-Volume, das nicht im Git liegt):
 *
 *   data/legal/legal-notice.md
 *   data/legal/privacy.md
 *
 * Vorlagen zum Ausfüllen liegen in `docs/legal/`. Fehlt eine Datei, blendet die
 * Oberfläche den jeweiligen Link einfach aus — beim reinen Self-Hosting im
 * eigenen Netz braucht es sie in der Regel nicht.
 */

// Erster gefundener Dateiname gewinnt. Die deutschen Namen bleiben als Fallback
// stehen, damit bestehende Instanzen nach der Umbenennung nichts verlieren.
const DOCUMENTS = [
  { id: 'impressum', files: ['legal-notice.md', 'impressum.md'], title: 'Legal notice' },
  { id: 'privacy', files: ['privacy.md', 'datenschutz.md'], title: 'Privacy policy' },
];

/** Obergrenze, damit eine versehentlich riesige Datei nicht den Speicher flutet. */
const MAX_BYTES = 512 * 1024;

function legalDir() {
  return process.env.LEGAL_DIR || path.join(process.env.DATA_DIR || './data', 'legal');
}

/**
 * Liest die vorhandenen Rechtstexte. Fehlende Dateien sind kein Fehler — sie
 * bedeuten schlicht „diese Instanz veröffentlicht diesen Text nicht“.
 * @returns {Array<{id: string, title: string, markdown: string}>}
 */
export function readLegalDocuments() {
  const dir = legalDir();
  const found = [];
  for (const doc of DOCUMENTS) {
    for (const name of doc.files) {
      const file = path.join(dir, name);
      try {
        const { size } = fs.statSync(file);
        if (size === 0 || size > MAX_BYTES) continue;
        const markdown = fs.readFileSync(file, 'utf8').trim();
        if (markdown) {
          found.push({ id: doc.id, title: doc.title, markdown });
          break;
        }
      } catch {
        // Datei fehlt oder ist nicht lesbar → nächster Name, sonst kein Link.
      }
    }
  }
  return found;
}
