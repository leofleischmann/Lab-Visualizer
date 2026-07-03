import express from 'express';
import cors from 'cors';
import { createDb } from './db.js';
import { ApiError } from './validation.js';
import { viewsRouter } from './routes/views.js';
import { nodesRouter } from './routes/nodes.js';
import { edgesRouter } from './routes/edges.js';
import { graphRouter } from './routes/graph.js';
import { metaRouter } from './routes/meta.js';

/**
 * Erstellt die Express-App inkl. Datenbank.
 * @param {{dbFile?: string}} options
 */
export function createApp({ dbFile } = {}) {
  const db = createDb(dbFile);
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '20mb' }));

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  app.use('/api/views', viewsRouter(db));
  app.use('/api/nodes', nodesRouter(db));
  app.use('/api/edges', edgesRouter(db));
  app.use('/api/graph', graphRouter(db));
  app.use('/api/meta', metaRouter());

  app.use('/api', (req, res) => {
    res.status(404).json({ error: `Unbekannter Endpunkt: ${req.method} ${req.originalUrl}` });
  });

  // Zentraler Error-Handler → einheitliche JSON-Fehler
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof ApiError) {
      return res.status(err.status).json({ error: err.message, details: err.details });
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
