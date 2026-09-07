import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,          -- sha256(token) hex; das Klartext-Token liegt nur im Cookie
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- Hochgeladene Bilder (eigene Node-Icons, Bilder in Notizen).
-- Bewusst IN der Datenbank statt auf der Platte: Projekte werden als JSON
-- zwischen Konten geteilt (Merge-Import). Lägen die Bilder daneben im
-- Dateisystem, verlöre eine geteilte Kopie ihre Icons; so reisen sie im Export
-- mit und das Backup bleibt "Datei kopieren".
CREATE TABLE IF NOT EXISTS assets (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  mime       TEXT NOT NULL,
  byte_size  INTEGER NOT NULL,
  bytes      BLOB NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assets_user ON assets(user_id);

CREATE TABLE IF NOT EXISTS projects (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  color         TEXT,
  icon          TEXT,
  -- Aktive Domain-Packs als JSON-Array. Bestimmt, welche Kategorien, Felder und
  -- Verbindungsarten dieses Projekt sieht (backend/src/catalog/index.js).
  -- Unbekannte IDs werden beim Lesen verworfen, ein Pack darf also verschwinden.
  packs         TEXT NOT NULL DEFAULT '[]',
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);

-- Read-only-Freigabelinks auf ein Projekt.
--
-- Wie bei sessions steht hier NUR der sha256-Hash des Tokens; das Klartext-
-- Token existiert allein im Link und wird nach dem Anlegen nie wieder
-- ausgegeben. Wer die Datenbank liest, kann daraus keinen gueltigen Link bauen.
CREATE TABLE IF NOT EXISTS share_links (
  id           TEXT PRIMARY KEY,       -- sha256(token) hex
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  label        TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL,
  expires_at   TEXT,                   -- NULL = laeuft nicht ab
  last_seen_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_share_links_project ON share_links(project_id);

CREATE TABLE IF NOT EXISTS views (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
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
  view_id        TEXT NOT NULL REFERENCES views(id) ON DELETE CASCADE,
  linked_view_id TEXT REFERENCES views(id) ON DELETE SET NULL,
  pos_x          REAL NOT NULL DEFAULT 0,
  pos_y          REAL NOT NULL DEFAULT 0,
  width          REAL,
  height         REAL,
  -- Eigenes Icon statt des Kategorie-Icons. Entweder ein Name aus dem
  -- Icon-Mapping des Frontends (z. B. 'server') oder 'asset:<id>' fuer ein
  -- hochgeladenes Bild. NULL = Icon der Kategorie.
  icon           TEXT,
  -- Eigene Farbe statt der Kategorie-Farbe. Erst damit lassen sich Zonen
  -- unterscheiden (DMZ rot, intern gruen) -- ueber die Kategorie haetten alle
  -- dieselbe. NULL = Farbe der Kategorie.
  color          TEXT,
  -- Typisierte Felder (IP, Hostname, Plattform, ...) als JSON-Objekt. Die Struktur
  -- definiert ausschliesslich backend/src/catalog/ (Kern + Domain-Packs) -- ein Feld
  -- kostet dort einen Eintrag und hier KEINE Schemaaenderung.
  fields         TEXT NOT NULL DEFAULT '{}',
  -- Freiform-Key-Value fuer alles, was der Katalog nicht kennt.
  custom_fields  TEXT NOT NULL DEFAULT '{}',
  notes          TEXT NOT NULL DEFAULT '',
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nodes_parent ON nodes(parent_id);
CREATE INDEX IF NOT EXISTS idx_nodes_view ON nodes(view_id);

CREATE TABLE IF NOT EXISTS edges (
  id            TEXT PRIMARY KEY,
  source_id     TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  target_id     TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  view_id       TEXT NOT NULL REFERENCES views(id) ON DELETE CASCADE,
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
  return db;
}

/**
 * Stellt sicher, dass ein Projekt mindestens eine Root-Ebene besitzt, und liefert
 * deren ID. Das Projekt selbst gehört bereits einem Nutzer (Besitz wird transitiv
 * über project_id vererbt).
 */
export function ensureRootView(db, projectId) {
  const existing = db
    .prepare('SELECT id FROM views WHERE project_id = ? ORDER BY sort_order, created_at LIMIT 1')
    .get(projectId);
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  const ts = new Date().toISOString();
  db.prepare(
    `INSERT INTO views (id, project_id, name, parent_id, description, color, icon, sort_order, created_at, updated_at)
     VALUES (?, ?, 'Übersicht', NULL, '', '#38bdf8', 'layers', 0, ?, ?)`
  ).run(id, projectId, ts, ts);
  return id;
}

/** Entfernt abgelaufene Sessions (Aufräumen beim Start). */
export function purgeExpiredSessions(db) {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString());
}
