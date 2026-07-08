import { Router } from 'express';
import * as store from '../store.js';
import { importSchema, layoutSchema, parseOrThrow } from '../validation.js';

export function graphRouter(db) {
  const router = Router();

  // GET /api/graph?viewId= — Graph einer Ebene (Default: Root-Ebene)
  router.get('/', (req, res) => {
    const viewId = Array.isArray(req.query.viewId) ? req.query.viewId[0] : req.query.viewId;
    res.json(store.getGraph(db, req.userId, viewId));
  });

  // GET /api/graph/export?projectId= — JSON-Dump (alles oder nur ein Projekt)
  router.get('/export', (req, res) => {
    const projectId = Array.isArray(req.query.projectId)
      ? req.query.projectId[0]
      : req.query.projectId;
    res.setHeader('Content-Disposition', 'attachment; filename="lab-visualizer-export.json"');
    res.json(store.exportGraph(db, req.userId, projectId));
  });

  // POST /api/graph/import — mode=replace ersetzt die eigenen Daten,
  // mode=merge fügt sie additiv (mit neuen IDs) hinzu
  router.post('/import', (req, res) => {
    const data = parseOrThrow(importSchema, req.body);
    res.json(store.importGraph(db, req.userId, data));
  });

  // POST /api/graph/layout — deterministisches Auto-Align (Positionen + Zonengrößen)
  router.post('/layout', (req, res) => {
    const options = parseOrThrow(layoutSchema, req.body ?? {});
    res.json(store.applyLayout(db, req.userId, options));
  });

  return router;
}
