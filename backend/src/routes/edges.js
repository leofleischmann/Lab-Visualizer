import { Router } from 'express';
import * as store from '../store.js';
import { edgeCreateSchema, edgeUpdateSchema, parseOrThrow } from '../validation.js';

export function edgesRouter(db) {
  const router = Router();

  // GET /api/edges?nodeId= — optional: nur Edges eines Nodes
  router.get('/', (req, res) => {
    res.json(store.listEdges(db, { nodeId: req.query.nodeId }));
  });

  router.post('/', (req, res) => {
    const data = parseOrThrow(edgeCreateSchema, req.body);
    res.status(201).json(store.createEdge(db, data));
  });

  router.get('/:id', (req, res) => {
    res.json(store.getEdge(db, req.params.id));
  });

  const update = (req, res) => {
    const patch = parseOrThrow(edgeUpdateSchema, req.body);
    res.json(store.updateEdge(db, req.params.id, patch));
  };
  router.patch('/:id', update);
  router.put('/:id', update);

  router.delete('/:id', (req, res) => {
    store.deleteEdge(db, req.params.id);
    res.status(204).end();
  });

  return router;
}
