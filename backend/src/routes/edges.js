import { Router } from 'express';
import * as store from '../store.js';
import { edgeCreateSchema, edgeUpdateSchema, parseOrThrow } from '../validation.js';

export function edgesRouter(db) {
  const router = Router();

  // GET /api/edges?nodeId= — optional: nur Edges eines Nodes
  router.get('/', (req, res) => {
    const nodeId = Array.isArray(req.query.nodeId) ? req.query.nodeId[0] : req.query.nodeId;
    res.json(store.listEdges(db, req.userId, { nodeId }));
  });

  router.post('/', (req, res) => {
    const data = parseOrThrow(edgeCreateSchema, req.body);
    res.status(201).json(store.createEdge(db, req.userId, data));
  });

  router.get('/:id', (req, res) => {
    res.json(store.getEdge(db, req.userId, req.params.id));
  });

  const update = (req, res) => {
    const patch = parseOrThrow(edgeUpdateSchema, req.body);
    res.json(store.updateEdge(db, req.userId, req.params.id, patch));
  };
  router.patch('/:id', update);
  router.put('/:id', update);

  router.delete('/:id', (req, res) => {
    store.deleteEdge(db, req.userId, req.params.id);
    res.status(204).end();
  });

  return router;
}
