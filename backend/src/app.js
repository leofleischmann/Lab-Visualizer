import express from 'express';
import cors from 'cors';
import { createDb, purgeExpiredSessions } from './db.js';
import { ApiError } from './validation.js';
import { requireAuth, originGuard, rateLimit } from './auth.js';
import { authRouter } from './routes/auth.js';
import { projectsRouter } from './routes/projects.js';
import { viewsRouter } from './routes/views.js';
import { nodesRouter } from './routes/nodes.js';
import { edgesRouter } from './routes/edges.js';
import { graphRouter } from './routes/graph.js';
import { assetsRouter } from './routes/assets.js';
import { shareRouter } from './routes/share.js';
import { metaRouter } from './routes/meta.js';
import { assertLimitsAllowRegistration } from './limits.js';
import { SEED_FOOTPRINT } from './seed.js';
import { getAppVersion } from './version.js';

/**
 * Erstellt die Express-App inkl. Datenbank.
 * @param {{dbFile?: string}} options
 */
export function createApp({ dbFile } = {}) {
  // Fehlkonfigurierte Limits sofort melden statt erst bei der Registrierung.
  assertLimitsAllowRegistration(SEED_FOOTPRINT);

  const db = createDb(dbFile);
  purgeExpiredSessions(db);

  const app = express();

  // Hinter nginx/Cloudflare: X-Forwarded-* vertrauen (req.ip, req.secure).
  app.set('trust proxy', 1);

  // Same-Origin im Normalfall (nginx-/Vite-Proxy) → kein CORS nötig. Nur wenn
  // CORS_ORIGIN gesetzt ist, wird explizit ein Cross-Origin mit Credentials erlaubt.
  if (process.env.CORS_ORIGIN) {
    app.use(cors({ origin: process.env.CORS_ORIGIN.split(',').map((s) => s.trim()), credentials: true }));
  }

  // CSRF-Schutz vor dem Body-Parsing: ein Request mit fremdem Origin fliegt raus,
  // bevor der Server überhaupt Nutzlast einliest.
  app.use('/api', originGuard);

  // Große Bodies braucht ausschließlich der Graph-Import. Alle anderen Routen
  // bearbeiten ein einzelnes Objekt (Notizen max. 200 kB + max. 100 Custom Fields)
  // und kommen mit einem Bruchteil aus — das begrenzt den Speicher, den ein
  // einzelner Request auf einer offenen Instanz binden kann.
  app.use('/api/graph/import', express.json({ limit: process.env.MAX_IMPORT_BODY || '20mb' }));
  app.use(express.json({ limit: process.env.MAX_BODY || '2mb' }));

  // Schreib-Rate-Limit: bremst außer Kontrolle geratene Skripte und schützt
  // öffentliche Instanzen vor Speicher-Missbrauch. Lesen bleibt ungedrosselt.
  // 0 = aus. Der Standard ist bewusst hoch genug für normales API-Scripting.
  const writesPerMin = Number(process.env.RATE_LIMIT_WRITES_PER_MIN ?? 600);
  if (writesPerMin > 0) {
    const writeLimiter = rateLimit({ max: writesPerMin, windowMs: 60 * 1000 });
    app.use('/api', (req, res, next) =>
      req.method === 'GET' || req.method === 'HEAD' ? next() : writeLimiter(req, res, next)
    );
  }

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', version: getAppVersion(), time: new Date().toISOString() });
  });

  // Öffentlich: Auth (Registrierung/Login), der statische Katalog und die
  // Leseansicht freigegebener Projekte. Der Share-Router bietet nur GET.
  app.use('/api/auth', authRouter(db));
  app.use('/api/meta', metaRouter());
  app.use('/api/share', shareRouter(db));

  // Ab hier: Anmeldung erforderlich; req.userId wird gesetzt.
  const auth = requireAuth(db);
  app.use('/api/projects', auth, projectsRouter(db));
  app.use('/api/views', auth, viewsRouter(db));
  app.use('/api/nodes', auth, nodesRouter(db));
  app.use('/api/edges', auth, edgesRouter(db));
  app.use('/api/graph', auth, graphRouter(db));
  app.use('/api/assets', auth, assetsRouter(db));

  app.use('/api', (req, res) => {
    res.status(404).json({ error: `Unbekannter Endpunkt: ${req.method} ${req.originalUrl}` });
  });

  // Zentraler Error-Handler → einheitliche JSON-Fehler
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof ApiError) {
      // `code` ist maschinenlesbar (z. B. "limit_reached" → Hinweis in der UI).
      return res
        .status(err.status)
        .json({ error: err.message, details: err.details, ...(err.code ? { code: err.code } : {}) });
    }
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Ungültiges JSON im Request-Body' });
    }
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request-Body zu groß' });
    }
    console.error(err);
    res.status(500).json({ error: 'Interner Serverfehler' });
  });

  return { app, db };
}
