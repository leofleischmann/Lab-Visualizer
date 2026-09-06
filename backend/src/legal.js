import fs from 'node:fs';
import path from 'node:path';

/**
 * Rechtstexte (Impressum, Datenschutzerklärung) — pro Instanz, nicht im Code.
 *
 * Wer Lab Visualizer öffentlich anbietet, braucht in vielen Rechtsräumen eigene
 * Rechtstexte mit den EIGENEN Angaben. Sie dürfen deshalb weder mitgeliefert noch
 * fest verdrahtet sein: Jede Instanz legt ihre Dateien unter `$DATA_DIR/legal/`
 * ab (per Docker also im gemounteten `./data`-Volume, das nicht im Git liegt):
 *
 *   data/legal/impressum.md
 *   data/legal/datenschutz.md
 *
 * Vorlagen zum Ausfüllen liegen in `docs/legal/`. Fehlt eine Datei, blendet die
 * Oberfläche den jeweiligen Link einfach aus — beim reinen Self-Hosting im
 * eigenen Netz braucht es sie in der Regel nicht.
 */

const DOCUMENTS = [
  { id: 'impressum', file: 'impressum.md', title: 'Impressum' },
  { id: 'privacy', file: 'datenschutz.md', title: 'Datenschutzerklärung' },
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
    const file = path.join(dir, doc.file);
    try {
      const { size } = fs.statSync(file);
      if (size === 0 || size > MAX_BYTES) continue;
      const markdown = fs.readFileSync(file, 'utf8').trim();
      if (markdown) found.push({ id: doc.id, title: doc.title, markdown });
    } catch {
      // Datei fehlt oder ist nicht lesbar → Link wird nicht angeboten.
    }
  }
  return found;
}
