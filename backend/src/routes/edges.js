import { Router } from 'express';
import * as store from '../store.js';
import { edgeCreateSchema, edgeUpdateSchema, parseOrThrow } from '../validation.js';

export function edgesRouter(db) {
  const router = Router();

  // GET /api/edges?nodeId=&viewId=&projectId=
  // Gleiche Filter wie GET /api/nodes — store.listEdges konnte viewId/projectId
  // schon immer, die Route hat sie nur nicht durchgereicht.
  router.get('/', (req, res) => {
    // Wiederholte Query-Parameter (?viewId=a&viewId=b) kommen als Array — auf
    // String reduzieren, damit sie nicht ungeprüft als SQL-Bind-Wert landen.
    const str = (v) => (Array.isArray(v) ? v[0] : v);
    const { nodeId, viewId, projectId } = req.query;
    res.json(
      store.listEdges(db, req.userId, {
        nodeId: str(nodeId),
        viewId: str(viewId),
        projectId: str(projectId),
      })
    );
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
