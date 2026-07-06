import { Router } from 'express';
import * as store from '../store.js';
import { nodeCreateSchema, nodeUpdateSchema, positionsSchema, parseOrThrow } from '../validation.js';

export function nodesRouter(db) {
  const router = Router();

  // GET /api/nodes?q=&category=&status=&viewId=&projectId=
  // projectId → globale Suche über alle Ebenen eines Projekts
  router.get('/', (req, res) => {
    // Wiederholte Query-Parameter (?q=a&q=b) kommen als Array — auf String
    // reduzieren, damit sie nicht ungeprüft als SQL-Bind-Wert landen.
    const str = (v) => (Array.isArray(v) ? v[0] : v);
    const { q, category, status, viewId, projectId } = req.query;
    res.json(
      store.listNodes(db, req.userId, {
        q: str(q),
        category: str(category),
        status: str(status),
        viewId: str(viewId),
        projectId: str(projectId),
      })
    );
  });

  // POST /api/nodes
  router.post('/', (req, res) => {
    const data = parseOrThrow(nodeCreateSchema, req.body);
    res.status(201).json(store.createNode(db, req.userId, data));
  });

  // POST /api/nodes/positions — Bulk-Update nach Drag/Resize
  router.post('/positions', (req, res) => {
    const { positions } = parseOrThrow(positionsSchema, req.body);
    res.json({ updated: store.updatePositions(db, req.userId, positions) });
  });

  router.get('/:id', (req, res) => {
    res.json(store.getNode(db, req.userId, req.params.id));
  });

  // PATCH = partielles Update, PUT = vollständiges Update (gleiche Semantik hier)
  const update = (req, res) => {
    const patch = parseOrThrow(nodeUpdateSchema, req.body);
    res.json(store.updateNode(db, req.userId, req.params.id, patch));
  };
  router.patch('/:id', update);
  router.put('/:id', update);

  router.delete('/:id', (req, res) => {
    store.deleteNode(db, req.userId, req.params.id);
    res.status(204).end();
  });

  return router;
}
