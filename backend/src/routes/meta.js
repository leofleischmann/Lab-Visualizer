import { Router } from 'express';
import { CATEGORIES, STATUSES, EDGE_KINDS, LINE_STYLES } from '../catalog.js';
import { readLegalDocuments } from '../legal.js';

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

  // GET /api/meta/legal — Rechtstexte dieser Instanz (Impressum, Datenschutz).
  // Bewusst ohne Anmeldung erreichbar: Ein Impressum muss ohne Konto einsehbar sein.
  // Leeres Array = diese Instanz hinterlegt keine Texte (typisch beim Self-Hosting).
  router.get('/legal', (req, res) => {
    res.json({ documents: readLegalDocuments() });
  });

  return router;
}
