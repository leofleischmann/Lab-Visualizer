/**
 * Gemeinsame Test-Helfer: frische In-Memory-App mit einem angemeldeten Nutzer.
 *
 * Hinweis: `node --test` lädt alle .js-Dateien unter test/ - diese Datei
 * enthält bewusst keine Tests und erscheint deshalb nur als leerer Eintrag.
 *
 * Beeinflusst: test/api.test.js, test/apiKeys.test.js, test/mcp.test.js,
 * test/openapi.test.js.
 */
import crypto from 'node:crypto';
import { createApp } from '../src/app.js';
import { createSession } from '../src/auth.js';
import * as store from '../src/store.js';

/**
 * Legt einen Nutzer mit genau EINEM leeren Projekt (+ Root-Ebene) an - ohne den
 * Beispiel-Seed - und öffnet dafür eine Session. Liefert das Cookie.
 * Instanz-Limits sind in Tests standardmäßig aus (keine Env gesetzt); die
 * Limit-Tests setzen sie gezielt für die Dauer des jeweiligen Tests.
 */
export function bootstrapUser(database) {
  const userId = crypto.randomUUID();
  const ts = new Date().toISOString();
  database
    .prepare(
      'INSERT INTO users (id, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    )
    .run(userId, `u-${userId.slice(0, 8)}@test.local`, 'scrypt$1$00$00', ts, ts);
  store.createProject(database, userId, { name: 'Test' });
  const { token } = createSession(database, userId);
  return { userId, cookie: `sid=${token}` };
}

/**
 * Startet eine frische, isolierte App mit einem angemeldeten Nutzer (ein leeres
 * Projekt + Root-Ebene) und liefert einen authentifizierten api-Helper + Cleanup.
 *
 *   call(method, path, body, cookie?)        JSON-Aufruf mit Session-Cookie
 *   request(method, path, { body, headers }) roher Aufruf ohne Cookie; liefert
 *                                            zusätzlich die Antwort-Header
 */
export async function freshApp() {
  const created = createApp({ dbFile: ':memory:' });
  const { cookie, userId } = bootstrapUser(created.db);
  const server = created.app.listen(0);
  await new Promise((resolve) => server.on('listening', resolve));
  const b = `http://127.0.0.1:${server.address().port}`;
  const request = async (method, path, { body, headers = {} } = {}) => {
    const h = { ...headers };
    if (body !== undefined && !h['Content-Type']) h['Content-Type'] = 'application/json';
    const res = await fetch(`${b}${path}`, {
      method,
      headers: h,
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const text = await res.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    return { status: res.status, body: parsed, headers: res.headers };
  };
  const call = async (method, path, body, cookieOverride = cookie) => {
    const headers = {};
    if (cookieOverride) headers.Cookie = cookieOverride;
    const res = await request(method, path, { body: body ?? undefined, headers });
    return { status: res.status, body: res.body };
  };
  return {
    app: created.app,
    mounts: created.mounts,
    call,
    request,
    base: b,
    db: created.db,
    cookie,
    userId,
    close: () => {
      server.close();
      created.db.close();
    },
  };
}
