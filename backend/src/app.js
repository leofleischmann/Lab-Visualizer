import express from 'express';
import cors from 'cors';
import { createDb, purgeExpiredSessions } from './db.js';
import { ApiError } from './validation.js';
import { requireAuth, originGuard } from './auth.js';
import { authRouter } from './routes/auth.js';
import { projectsRouter } from './routes/projects.js';
import { viewsRouter } from './routes/views.js';
import { nodesRouter } from './routes/nodes.js';
import { edgesRouter } from './routes/edges.js';
import { graphRouter } from './routes/graph.js';
import { metaRouter } from './routes/meta.js';
import { billingRouter } from './routes/billing.js';

/**
 * Erstellt die Express-App inkl. Datenbank.
 * @param {{dbFile?: string}} options
 */
export function createApp({ dbFile } = {}) {
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

  app.use(express.json({ limit: '20mb' }));

  // CSRF-Schutz für alle zustandsändernden Requests.
  app.use('/api', originGuard);

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // Öffentlich: Auth (Registrierung/Login) und der statische Katalog.
  app.use('/api/auth', authRouter(db));
  app.use('/api/meta', metaRouter());

  // Ab hier: Anmeldung erforderlich; req.userId wird gesetzt.
  const auth = requireAuth(db);
  app.use('/api/projects', auth, projectsRouter(db));
  app.use('/api/views', auth, viewsRouter(db));
  app.use('/api/nodes', auth, nodesRouter(db));
  app.use('/api/edges', auth, edgesRouter(db));
  app.use('/api/graph', auth, graphRouter(db));
  app.use('/api/billing', auth, billingRouter(db));

  app.use('/api', (req, res) => {
    res.status(404).json({ error: `Unbekannter Endpunkt: ${req.method} ${req.originalUrl}` });
  });

  // Zentraler Error-Handler → einheitliche JSON-Fehler
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof ApiError) {
      // `code` ist maschinenlesbar (z. B. "plan_limit" → Paywall in der UI).
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
