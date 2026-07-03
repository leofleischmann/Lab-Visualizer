import { Router } from 'express';
import * as store from '../store.js';
import { viewCreateSchema, viewUpdateSchema, parseOrThrow } from '../validation.js';

export function viewsRouter(db) {
  const router = Router();

  // GET /api/views?projectId= — Ebenen (eines Projekts; flach, Hierarchie über parentId)
  router.get('/', (req, res) => {
    res.json(store.listViews(db, { projectId: req.query.projectId }));
  });

  // POST /api/views
  router.post('/', (req, res) => {
    const data = parseOrThrow(viewCreateSchema, req.body);
    res.status(201).json(store.createView(db, data));
  });

  router.get('/:id', (req, res) => {
    res.json(store.getView(db, req.params.id));
  });

  // PATCH = partielles Update, PUT = vollständiges Update (gleiche Semantik hier)
  const update = (req, res) => {
    const patch = parseOrThrow(viewUpdateSchema, req.body);
    res.json(store.updateView(db, req.params.id, patch));
  };
  router.patch('/:id', update);
  router.put('/:id', update);

  // DELETE /api/views/:id — kaskadiert auf Kind-Ebenen + deren Nodes/Edges
  router.delete('/:id', (req, res) => {
    res.json(store.deleteView(db, req.params.id));
  });

  return router;
}
