import { Router } from 'express';
import * as store from '../store.js';
import { importSchema, layoutSchema, parseOrThrow } from '../validation.js';

export function graphRouter(db) {
  const router = Router();

  // GET /api/graph?viewId= — Graph einer Ebene (Default: Root-Ebene)
  router.get('/', (req, res) => {
    const viewId = Array.isArray(req.query.viewId) ? req.query.viewId[0] : req.query.viewId;
    res.json(store.getGraph(db, viewId));
  });

  // GET /api/graph/export — Download-fähiger JSON-Dump
  router.get('/export', (req, res) => {
    res.setHeader('Content-Disposition', 'attachment; filename="lab-visualizer-export.json"');
    res.json(store.exportGraph(db));
  });

  // POST /api/graph/import — ersetzt alle Daten (mode=replace)
  router.post('/import', (req, res) => {
    const data = parseOrThrow(importSchema, req.body);
    res.json(store.importGraph(db, data));
  });

  // POST /api/graph/layout — deterministisches Auto-Align (Positionen + Zonengrößen)
  router.post('/layout', (req, res) => {
    const options = parseOrThrow(layoutSchema, req.body ?? {});
    res.json(store.applyLayout(db, options));
  });

  return router;
}
