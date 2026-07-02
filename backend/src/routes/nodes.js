import { Router } from 'express';
import * as store from '../store.js';
import { nodeCreateSchema, nodeUpdateSchema, positionsSchema, parseOrThrow } from '../validation.js';

export function nodesRouter(db) {
  const router = Router();

  // GET /api/nodes?q=&category=&status=
  router.get('/', (req, res) => {
    const { q, category, status } = req.query;
    res.json(store.listNodes(db, { q, category, status }));
  });

  // POST /api/nodes
  router.post('/', (req, res) => {
    const data = parseOrThrow(nodeCreateSchema, req.body);
    res.status(201).json(store.createNode(db, data));
  });

  // POST /api/nodes/positions — Bulk-Update nach Drag/Resize
  router.post('/positions', (req, res) => {
    const { positions } = parseOrThrow(positionsSchema, req.body);
    res.json({ updated: store.updatePositions(db, positions) });
  });

  router.get('/:id', (req, res) => {
    res.json(store.getNode(db, req.params.id));
  });

  // PATCH = partielles Update, PUT = vollständiges Update (gleiche Semantik hier)
  const update = (req, res) => {
    const patch = parseOrThrow(nodeUpdateSchema, req.body);
    res.json(store.updateNode(db, req.params.id, patch));
  };
  router.patch('/:id', update);
  router.put('/:id', update);

  router.delete('/:id', (req, res) => {
    store.deleteNode(db, req.params.id);
    res.status(204).end();
  });

  return router;
}
