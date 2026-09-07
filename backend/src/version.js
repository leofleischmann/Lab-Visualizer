/**
 * App-Version für Health-Check und Betrieb.
 *
 * Single source of truth: Datei `/VERSION` im Repo-Root.
 * Im Docker-Image setzt das Dockerfile `APP_VERSION` (Build-Arg).
 * Lokal ohne Docker wird `/VERSION` gelesen, sonst `backend/package.json`.
 *
 * Beeinflusst: GET /api/health, Backend-Dockerfile, Release-Workflow (.github/workflows/release.yml),
 * docker-compose Image-Tags, ggf. package.json-Versionen (beim Bump mitziehen).
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

  const fromRoot = readFileVersion(join(HERE, '..', '..', 'VERSION'));
  if (fromRoot) return fromRoot;

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
