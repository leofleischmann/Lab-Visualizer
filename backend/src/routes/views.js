import { Router } from 'express';
import * as store from '../store.js';
import { viewCreateSchema, viewUpdateSchema, parseOrThrow } from '../validation.js';

export function viewsRouter(db) {
  const router = Router();

  // GET /api/views?projectId= — Ebenen (eines Projekts; flach, Hierarchie über parentId)
  router.get('/', (req, res) => {
    // Wiederholte Query-Parameter (?projectId=a&projectId=b) kommen als Array —
    // auf String reduzieren, damit sie nicht ungeprüft als SQL-Bind-Wert landen.
    const projectId = Array.isArray(req.query.projectId)
      ? req.query.projectId[0]
      : req.query.projectId;
    res.json(store.listViews(db, req.userId, { projectId }));
  });

  // POST /api/views
  router.post('/', (req, res) => {
    const data = parseOrThrow(viewCreateSchema, req.body);
    res.status(201).json(store.createView(db, req.userId, data));
  });

  router.get('/:id', (req, res) => {
    res.json(store.getView(db, req.userId, req.params.id));
  });

  // PATCH = partielles Update, PUT = vollständiges Update (gleiche Semantik hier)
  const update = (req, res) => {
    const patch = parseOrThrow(viewUpdateSchema, req.body);
    res.json(store.updateView(db, req.userId, req.params.id, patch));
  };
  router.patch('/:id', update);
  router.put('/:id', update);

  // DELETE /api/views/:id — kaskadiert auf Kind-Ebenen + deren Nodes/Edges
  router.delete('/:id', (req, res) => {
    res.json(store.deleteView(db, req.userId, req.params.id));
  });

  return router;
}
