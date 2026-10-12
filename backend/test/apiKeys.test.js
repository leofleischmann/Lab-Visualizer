import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshApp, bootstrapUser } from './helpers.js';
import { MAX_API_KEYS_PER_USER } from '../src/apiKeys.js';

/**
 * API-Keys: Ausgabe genau einmal, Scopes, keine Kontoverwaltung per Key,
 * Isolation und das Zusammenspiel mit dem CSRF-Schutz.
 *
 * Beeinflusst: backend/src/apiKeys.js, backend/src/auth.js, routes/apiKeys.js.
 */

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

async function createKey(app, data = { name: 'Test', scope: 'write' }) {
  const res = await app.call('POST', '/api/api-keys', data);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

test('api-keys: Token gibt es genau einmal, gespeichert wird nur der Hash', async () => {
  const app = await freshApp();
  try {
    const created = await createKey(app, { name: 'Monitoring', scope: 'read' });
    assert.match(created.token, /^lvk_[A-Za-z0-9_-]{43}$/);
    assert.equal(created.scope, 'read');
    assert.equal(created.prefix, created.token.slice(0, 12));
    assert.equal(created.lastUsedAt, null);

    const listed = (await app.call('GET', '/api/api-keys')).body;
    assert.equal(listed.length, 1);
    assert.equal(listed[0].token, undefined, 'Token darf nicht erneut ausgegeben werden');
    const row = app.db.prepare('SELECT * FROM api_keys').get();
    assert.notEqual(row.key_hash, created.token);
    assert.ok(!JSON.stringify(row).includes(created.token), 'Klartext-Token in der Datenbank');

    // Ohne Angabe: read (das Sichere ist der Standard).
    assert.equal((await createKey(app, { name: 'Default' })).scope, 'read');
  } finally {
    app.close();
  }
});

test('api-keys: Bearer authentifiziert, /auth/me verrät Methode und Scope', async () => {
  const app = await freshApp();
  try {
    const key = await createKey(app, { name: 'Skript', scope: 'write' });
    const me = await app.request('GET', '/api/auth/me', { headers: bearer(key.token) });
    assert.equal(me.status, 200);
    assert.equal(me.body.user.id, app.userId);
    assert.deepEqual(me.body.auth, { method: 'apiKey', scope: 'write', keyId: key.id });

    const session = await app.call('GET', '/api/auth/me');
    assert.deepEqual(session.body.auth, { method: 'session', scope: 'write' });

    const projects = await app.request('GET', '/api/projects', { headers: bearer(key.token) });
    assert.equal(projects.status, 200);
    assert.equal(projects.body.length, 1);

    // Benutzung wird vermerkt (gedrosselt, der erste Aufruf schreibt immer).
    assert.ok(app.db.prepare('SELECT last_used_at FROM api_keys WHERE id = ?').get(key.id).last_used_at);
  } finally {
    app.close();
  }
});

test('api-keys: read-Key darf nur lesen, write-Key auch schreiben', async () => {
  const app = await freshApp();
  try {
    const read = await createKey(app, { name: 'Lesen', scope: 'read' });
    const write = await createKey(app, { name: 'Schreiben', scope: 'write' });

    assert.equal((await app.request('GET', '/api/nodes', { headers: bearer(read.token) })).status, 200);
    const denied = await app.request('POST', '/api/nodes', { headers: bearer(read.token), body: { name: 'X' } });
    assert.equal(denied.status, 403);
    assert.equal(denied.body.code, 'insufficient_scope');
    for (const method of ['PATCH', 'PUT', 'DELETE']) {
      const res = await app.request(method, '/api/nodes/irgendwas', { headers: bearer(read.token), body: {} });
      assert.equal(res.status, 403, method);
    }

    const created = await app.request('POST', '/api/nodes', {
      headers: bearer(write.token),
      body: { id: 'per-key', name: 'Per Key' },
    });
    assert.equal(created.status, 201);
    assert.equal((await app.call('GET', '/api/nodes/per-key')).status, 200);
  } finally {
    app.close();
  }
});

test('api-keys: ungültiger Key ist 401 - auch wenn ein gültiges Cookie mitkommt', async () => {
  const app = await freshApp();
  try {
    const invalid = await app.request('GET', '/api/projects', { headers: bearer('lvk_falsch') });
    assert.equal(invalid.status, 401);
    assert.match(invalid.headers.get('www-authenticate'), /^Bearer /);

    // Kein stiller Rückfall auf die Session.
    const withCookie = await app.request('GET', '/api/projects', {
      headers: { ...bearer('lvk_falsch'), Cookie: app.cookie },
    });
    assert.equal(withCookie.status, 401);

    // Ohne Session hilft der Hinweis, wie ein Key übergeben wird.
    const basic = await app.request('GET', '/api/projects', { headers: { Authorization: 'Basic Zm9vOmJhcg==' } });
    assert.equal(basic.status, 401);
    assert.match(basic.body.error, /Bearer lvk_/);
  } finally {
    app.close();
  }
});

test('api-keys: fremde Authorization-Header (Basic-Auth-Proxy, OAuth2-Proxy) stören die Web-UI nicht', async () => {
  const app = await freshApp();
  try {
    // Ein vorgeschalteter Proxy mit Basic-Auth lässt den Browser den Header bei
    // JEDEM Request mitschicken - die Session muss trotzdem gelten.
    for (const authorization of ['Basic Zm9vOmJhcg==', 'Bearer eyJhbGciOiJSUzI1NiJ9.proxy-token']) {
      const res = await app.request('GET', '/api/projects', {
        headers: { Authorization: authorization, Cookie: app.cookie },
      });
      assert.equal(res.status, 200, authorization);
    }
  } finally {
    app.close();
  }
});

test('api-keys: Keys verwalten, Passwort und Konto gehen nur mit Session', async () => {
  const app = await freshApp();
  try {
    const write = await createKey(app, { name: 'Voll', scope: 'write' });
    const h = bearer(write.token);

    const list = await app.request('GET', '/api/api-keys', { headers: h });
    assert.equal(list.status, 403);
    assert.equal(list.body.code, 'session_required');
    const escalate = await app.request('POST', '/api/api-keys', { headers: h, body: { name: 'Neu', scope: 'write' } });
    assert.equal(escalate.status, 403);
    assert.equal((await app.request('DELETE', `/api/api-keys/${write.id}`, { headers: h })).status, 403);

    // Passwort/Konto lesen ausschließlich das Session-Cookie.
    const pw = await app.request('POST', '/api/auth/password', {
      headers: h,
      body: { currentPassword: 'x', newPassword: 'neuespasswort' },
    });
    assert.equal(pw.status, 401);
    assert.equal((await app.request('DELETE', '/api/auth/account', { headers: h, body: { password: 'x' } })).status, 401);
    assert.equal(app.db.prepare('SELECT count(*) AS c FROM users').get().c, 1);
  } finally {
    app.close();
  }
});

test('api-keys: Widerruf wirkt sofort, fremde Keys sind 404', async () => {
  const app = await freshApp();
  const other = bootstrapUser(app.db);
  try {
    const key = await createKey(app);
    assert.equal((await app.request('GET', '/api/projects', { headers: bearer(key.token) })).status, 200);

    // Fremdes Konto kann den Key weder sehen noch widerrufen.
    assert.deepEqual((await app.call('GET', '/api/api-keys', null, other.cookie)).body, []);
    assert.equal((await app.call('DELETE', `/api/api-keys/${key.id}`, null, other.cookie)).status, 404);

    assert.deepEqual((await app.call('DELETE', `/api/api-keys/${key.id}`)).body, { revoked: 1 });
    assert.equal((await app.request('GET', '/api/projects', { headers: bearer(key.token) })).status, 401);
    assert.equal((await app.call('DELETE', `/api/api-keys/${key.id}`)).status, 404);
  } finally {
    app.close();
  }
});

test('api-keys: Ablauf - vergangenes Datum abgelehnt, abgelaufener Key 401 und weiter gelistet', async () => {
  const app = await freshApp();
  try {
    const past = await app.call('POST', '/api/api-keys', {
      name: 'Alt',
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    assert.equal(past.status, 400);

    const key = await createKey(app, {
      name: 'Bald',
      scope: 'read',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    assert.equal((await app.request('GET', '/api/projects', { headers: bearer(key.token) })).status, 200);

    app.db
      .prepare('UPDATE api_keys SET expires_at = ? WHERE id = ?')
      .run(new Date(Date.now() - 1000).toISOString(), key.id);
    assert.equal((await app.request('GET', '/api/projects', { headers: bearer(key.token) })).status, 401);
    assert.equal((await app.call('GET', '/api/api-keys')).body.length, 1, 'abgelaufene Keys bleiben sichtbar');
  } finally {
    app.close();
  }
});

test('api-keys: Isolation - ein Key sieht nur die Daten seines Kontos', async () => {
  const app = await freshApp();
  const other = bootstrapUser(app.db);
  try {
    const otherView = (await app.call('GET', '/api/views', null, other.cookie)).body[0];
    await app.call('POST', '/api/nodes', { id: 'fremd', name: 'Fremd', viewId: otherView.id }, other.cookie);

    const key = await createKey(app);
    const h = bearer(key.token);
    assert.equal((await app.request('GET', '/api/nodes/fremd', { headers: h })).status, 404);
    assert.equal((await app.request('DELETE', '/api/nodes/fremd', { headers: h })).status, 404);
    assert.equal((await app.request('GET', `/api/views/${otherView.id}`, { headers: h })).status, 404);
  } finally {
    app.close();
  }
});

test('api-keys: höchstens MAX_API_KEYS_PER_USER pro Konto; Konto löschen entfernt sie', async () => {
  const app = await freshApp();
  try {
    const insert = app.db.prepare(
      `INSERT INTO api_keys (id, user_id, key_hash, prefix, name, scope, created_at)
       VALUES (?, ?, ?, 'lvk_x', 'k', 'read', ?)`
    );
    for (let i = 0; i < MAX_API_KEYS_PER_USER; i++) {
      insert.run(`k${i}`, app.userId, `hash${i}`, new Date().toISOString());
    }
    const res = await app.call('POST', '/api/api-keys', { name: 'Zuviel' });
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'limit_reached');

    app.db.prepare('DELETE FROM users WHERE id = ?').run(app.userId);
    assert.equal(app.db.prepare('SELECT count(*) AS c FROM api_keys').get().c, 0);
  } finally {
    app.close();
  }
});

test('csrf: fremder Origin blockt Cookie-Writes, aber nicht Bearer; CORS_ORIGIN wird erlaubt', async () => {
  const app = await freshApp();
  const previous = process.env.CORS_ORIGIN;
  try {
    const key = await createKey(app);
    const evil = { Origin: 'https://evil.example' };

    const cookieWrite = await app.request('POST', '/api/nodes', {
      headers: { ...evil, Cookie: app.cookie },
      body: { name: 'CSRF' },
    });
    assert.equal(cookieWrite.status, 403);

    // Basic-Auth hängt der Browser auch an fremde Formulare an - kein Freifahrtschein.
    const basicWrite = await app.request('POST', '/api/nodes', {
      headers: { ...evil, Cookie: app.cookie, Authorization: 'Basic Zm9vOmJhcg==' },
      body: { name: 'CSRF' },
    });
    assert.equal(basicWrite.status, 403);

    // Bearer-Requests sind nicht CSRF-fähig (der Browser setzt den Header nie selbst).
    const bearerWrite = await app.request('POST', '/api/nodes', {
      headers: { ...evil, ...bearer(key.token) },
      body: { name: 'Integration' },
    });
    assert.equal(bearerWrite.status, 201);

    // Ein ausdrücklich erlaubter Cross-Origin darf auch mit Cookie schreiben.
    process.env.CORS_ORIGIN = 'https://labviz.example, https://other.example';
    const allowed = await app.request('POST', '/api/nodes', {
      headers: { Origin: 'https://labviz.example', Cookie: app.cookie },
      body: { name: 'Erlaubt' },
    });
    assert.equal(allowed.status, 201);
  } finally {
    if (previous === undefined) delete process.env.CORS_ORIGIN;
    else process.env.CORS_ORIGIN = previous;
    app.close();
  }
});
