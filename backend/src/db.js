import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS projects (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  color         TEXT,
  icon          TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS views (
  id            TEXT PRIMARY KEY,
  project_id    TEXT REFERENCES projects(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  parent_id     TEXT REFERENCES views(id) ON DELETE CASCADE,
  description   TEXT NOT NULL DEFAULT '',
  color         TEXT,
  icon          TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_views_parent ON views(parent_id);
CREATE INDEX IF NOT EXISTS idx_views_project ON views(project_id);

CREATE TABLE IF NOT EXISTS nodes (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  category       TEXT NOT NULL DEFAULT 'generic',
  status         TEXT NOT NULL DEFAULT 'unknown',
  parent_id      TEXT REFERENCES nodes(id) ON DELETE SET NULL,
  view_id        TEXT REFERENCES views(id) ON DELETE CASCADE,
  linked_view_id TEXT REFERENCES views(id) ON DELETE SET NULL,
  pos_x          REAL NOT NULL DEFAULT 0,
  pos_y          REAL NOT NULL DEFAULT 0,
  width          REAL,
  height         REAL,
  ip             TEXT,
  vlan           TEXT,
  os             TEXT,
  hostname       TEXT,
  url            TEXT,
  notes          TEXT NOT NULL DEFAULT '',
  custom_fields  TEXT NOT NULL DEFAULT '{}',
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nodes_parent ON nodes(parent_id);
CREATE INDEX IF NOT EXISTS idx_nodes_view ON nodes(view_id);

CREATE TABLE IF NOT EXISTS edges (
  id            TEXT PRIMARY KEY,
  source_id     TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  target_id     TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  view_id       TEXT REFERENCES views(id) ON DELETE CASCADE,
  label         TEXT NOT NULL DEFAULT '',
  kind          TEXT NOT NULL DEFAULT 'generic',
  line_style    TEXT NOT NULL DEFAULT 'solid',
  animated      INTEGER NOT NULL DEFAULT 0,
  notes         TEXT NOT NULL DEFAULT '',
  routing       TEXT NOT NULL DEFAULT '{"mode":"auto","waypoints":[]}',
  custom_fields TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id);
CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id);
CREATE INDEX IF NOT EXISTS idx_edges_view ON edges(view_id);
`;

/**
 * Öffnet (oder erstellt) die SQLite-Datenbank und legt das Schema an.
 * @param {string} [dbFile] Pfad zur DB-Datei oder ':memory:' für Tests.
 */
export function createDb(dbFile) {
  const file =
    dbFile ||
    process.env.DB_FILE ||
    path.join(process.env.DATA_DIR || './data', 'labviz.db');
  if (file !== ':memory:') {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

/** Kleiner Key-Value-Speicher für App-Metadaten (z. B. „seeded"-Flag). */
export function getMeta(db, key) {
  return db.prepare('SELECT value FROM meta WHERE key = ?').get(key)?.value ?? null;
}

export function setMeta(db, key, value) {
  db.prepare(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, value);
}

/**
 * Stellt sicher, dass mindestens ein Projekt existiert, und liefert dessen ID.
 */
export function ensureDefaultProject(db) {
  const existing = db
    .prepare('SELECT id FROM projects ORDER BY sort_order, created_at LIMIT 1')
    .get();
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  const ts = new Date().toISOString();
  db.prepare(
    `INSERT INTO projects (id, name, color, icon, sort_order, created_at, updated_at)
     VALUES (?, 'Mein Homelab', '#38bdf8', 'boxes', 0, ?, ?)`
  ).run(id, ts, ts);
  return id;
}

/**
 * Stellt sicher, dass im (Default-)Projekt mindestens eine Root-Ebene existiert,
 * und liefert deren ID. Verhindert den Zustand „keine Ebene vorhanden".
 */
export function ensureRootView(db, projectId) {
  const project = projectId ?? ensureDefaultProject(db);
  const existing = db
    .prepare('SELECT id FROM views WHERE project_id = ? ORDER BY sort_order, created_at LIMIT 1')
    .get(project);
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  const ts = new Date().toISOString();
  db.prepare(
    `INSERT INTO views (id, project_id, name, parent_id, description, color, icon, sort_order, created_at, updated_at)
     VALUES (?, ?, 'Übersicht', NULL, '', '#38bdf8', 'layers', 0, ?, ?)`
  ).run(id, project, ts, ts);
  return id;
}

function migrate(db) {
  // Bestandsmigration: routing-Spalte für alte Edge-Tabellen
  const edgeCols = db.prepare('PRAGMA table_info(edges)').all();
  if (!edgeCols.some((c) => c.name === 'routing')) {
    db.exec(
      `ALTER TABLE edges ADD COLUMN routing TEXT NOT NULL DEFAULT '{"mode":"auto","waypoints":[]}'`
    );
  }

  // Ebenen (views): fehlende Spalten ergänzen (ohne inline-FK, um ALTER-Grenzen
  // von SQLite zu vermeiden; frische DBs erhalten die FKs über das Schema oben).
  const nodeCols = db.prepare('PRAGMA table_info(nodes)').all();
  if (!nodeCols.some((c) => c.name === 'view_id')) {
    db.exec('ALTER TABLE nodes ADD COLUMN view_id TEXT');
  }
  if (!nodeCols.some((c) => c.name === 'linked_view_id')) {
    db.exec('ALTER TABLE nodes ADD COLUMN linked_view_id TEXT');
  }
  if (!edgeCols.some((c) => c.name === 'view_id')) {
    db.exec('ALTER TABLE edges ADD COLUMN view_id TEXT');
  }

  // Projekte: fehlende view.project_id-Spalte ergänzen und Ebenen zuordnen.
  const viewCols = db.prepare('PRAGMA table_info(views)').all();
  if (!viewCols.some((c) => c.name === 'project_id')) {
    db.exec('ALTER TABLE views ADD COLUMN project_id TEXT');
  }
  const projectId = ensureDefaultProject(db);
  db.prepare('UPDATE views SET project_id = ? WHERE project_id IS NULL').run(projectId);

  // Verwaiste Nodes/Edges der Root-Ebene zuordnen (verlustfreier Backfill).
  const rootId = ensureRootView(db, projectId);
  db.prepare('UPDATE nodes SET view_id = ? WHERE view_id IS NULL').run(rootId);
  db.prepare('UPDATE edges SET view_id = ? WHERE view_id IS NULL').run(rootId);
}
