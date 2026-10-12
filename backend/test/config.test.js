import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Konfiguration: Jede Umgebungsvariable, die das Backend liest, muss in
 * docker-compose.yml an den Container durchgereicht werden. Sonst wirkt ein
 * Wert aus der .env im Docker-Betrieb schlicht nicht (so geschehen bei
 * MAX_ASSETS_PER_USER und MAX_ASSET_BYTES).
 *
 * Beeinflusst: docker-compose.yml, README.md (Konfigurationstabelle), .env.example.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = join(ROOT, 'backend/src');

/**
 * Setzt das Image selbst (backend/Dockerfile) oder ergibt im Container keinen
 * Sinn: PORT muss zum nginx-Proxy passen (backend:3000), DATA_DIR zum Volume.
 */
const IMAGE_LEVEL = new Set(['PORT', 'HOST', 'DATA_DIR', 'DB_FILE', 'NODE_ENV', 'APP_VERSION']);

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith('.js') ? [path] : [];
  });
}

/** Alle Variablennamen, die backend/src liest (process.env.X und envLimit('X')). */
function envVarsReadByBackend() {
  const names = new Set();
  for (const file of sourceFiles(SRC)) {
    const code = readFileSync(file, 'utf8');
    for (const m of code.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)|envLimit\('([A-Z][A-Z0-9_]*)'\)/g)) {
      names.add(m[1] ?? m[2]);
    }
  }
  return names;
}

test('config: docker-compose reicht jede Backend-Variable an den Container durch', () => {
  const compose = readFileSync(join(ROOT, 'docker-compose.yml'), 'utf8');
  const passed = new Set([...compose.matchAll(/^\s+- ([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]));
  const read = envVarsReadByBackend();
  assert.ok(read.has('MAX_ASSET_BYTES') && read.has('MAX_PROJECTS_PER_USER'), 'Scan findet die Variablen nicht');
  const missing = [...read].filter((name) => !IMAGE_LEVEL.has(name) && !passed.has(name)).sort();
  assert.deepEqual(missing, [], 'in docker-compose.yml (backend.environment) ergänzen');
});

test('config: jede durchgereichte Variable steht in der README-Tabelle', () => {
  const compose = readFileSync(join(ROOT, 'docker-compose.yml'), 'utf8');
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  const documented = new Set([...readme.matchAll(/^\| `([A-Z][A-Z0-9_]*)`/gm)].map((m) => m[1]));
  // MAX_IMPORT_BODY steht in derselben Zeile wie MAX_BODY.
  if (/`MAX_BODY` \/ `MAX_IMPORT_BODY`/.test(readme)) documented.add('MAX_IMPORT_BODY');
  const passed = [...compose.matchAll(/^\s+- ([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]);
  assert.deepEqual(passed.filter((name) => !documented.has(name)), []);
});
