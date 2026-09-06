import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Regression: frontend/src/lib/catalog.test.ts liest den Katalog und die
 * Template-Registry über die PAKETGRENZE, um deren Icon-Namen gegen das
 * Icon-Mapping der UI abzugleichen. Der Frontend-Job im CI installiert aber nur
 * frontend/node_modules — zieht diese Kette irgendwo ein npm-Paket herein
 * (früher: templates/index.js -> store.js -> validation.js -> zod), scheitert
 * er mit einem undurchsichtigen „Failed to resolve import".
 *
 * Die Prüfung steht hier statt im Frontend, weil sie Node-APIs braucht (fs,
 * path) und das Frontend-Paket dafür @types/node bräuchte — und weil sie die
 * Dateien betrifft, die hier liegen.
 *
 * Beeinflusst: backend/src/catalog/, backend/src/templates/. Wer dort etwas
 * importiert, das nicht relativ ist, bricht den Frontend-Job.
 */
const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../src');

/** Folgt relativen Imports und sammelt alle Bare-Specifier (= externe Module). */
function externalImports(entry) {
  const seen = new Set();
  const external = new Set();
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const m of readFileSync(file, 'utf8').matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)) {
      const spec = m[1];
      if (spec.startsWith('.')) walk(resolve(dirname(file), spec));
      else external.add(spec);
    }
  };
  walk(resolve(SRC, entry));
  return [...external];
}

test('catalog/index.js ist über die Paketgrenze lesbar (keine externen Imports)', () => {
  assert.deepEqual(externalImports('catalog/index.js'), []);
});

test('templates/index.js ist über die Paketgrenze lesbar (keine externen Imports)', () => {
  // Das Anwenden eines Templates braucht store.js und steht deshalb getrennt
  // in templates/apply.js — die Registry selbst bleibt reine Daten.
  assert.deepEqual(externalImports('templates/index.js'), []);
});
