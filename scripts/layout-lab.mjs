/**
 * Wendet backend/src/layout.js auf networks/lab.json an.
 * Ausführen: node scripts/layout-lab.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeLayout } from '../backend/src/layout.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'networks', 'lab.json');

const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
data.nodes = computeLayout(data.nodes, data.edges ?? []);
data.exportedAt = new Date().toISOString();
fs.writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n');
console.log('[Debug layout-lab]: layout updated');
