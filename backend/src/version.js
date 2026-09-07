/**
 * Backend-Version für Health-Check und Betrieb.
 *
 * Single source of truth: `backend/VERSION` (muss zu `backend/package.json` passen).
 * Im Docker-Image setzt das Dockerfile `APP_VERSION` (Build-Arg).
 * Lokal ohne Docker wird `backend/VERSION` gelesen, sonst `package.json`.
 *
 * Frontend hat eine eigene Version (`frontend/VERSION`) und ein eigenes Image.
 * Beeinflusst: GET /api/health, Backend-Dockerfile, Release-Workflow,
 * docker-compose `BACKEND_VERSION`.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

function readFileVersion(path) {
  try {
    return readFileSync(path, 'utf8').trim();
  } catch {
    return null;
  }
}

export function getAppVersion() {
  if (process.env.APP_VERSION?.trim()) return process.env.APP_VERSION.trim();

  const fromFile = readFileVersion(join(HERE, '..', 'VERSION'));
  if (fromFile) return fromFile;

  const pkgRaw = readFileVersion(join(HERE, '..', 'package.json'));
  if (pkgRaw) {
    try {
      const v = JSON.parse(pkgRaw).version;
      if (typeof v === 'string' && v.trim()) return v.trim();
    } catch {
      /* ignore */
    }
  }

  return '0.0.0';
}
