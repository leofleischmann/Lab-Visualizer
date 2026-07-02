import { Router } from 'express';
import { CATEGORIES, STATUSES, EDGE_KINDS, LINE_STYLES } from '../catalog.js';

export function metaRouter() {
  const router = Router();

  // GET /api/meta/catalog — Kategorien, Status & Verbindungsarten für UI/Automation
  router.get('/catalog', (req, res) => {
    res.json({
      categories: CATEGORIES,
      statuses: STATUSES,
      edgeKinds: EDGE_KINDS,
      lineStyles: LINE_STYLES,
    });
  });

  return router;
}
