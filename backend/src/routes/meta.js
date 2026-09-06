import { Router } from 'express';
import { buildCatalog, listPacks } from '../catalog/index.js';
import { listTemplates } from '../templates/index.js';
import { readLegalDocuments } from '../legal.js';

export function metaRouter() {
  const router = Router();

  // GET /api/meta/catalog — VOLLSTÄNDIGER Katalog über alle Domain-Packs.
  // Referenz für Skripte und Agenten, die kein Projekt kennen. Die UI nutzt
  // stattdessen GET /api/projects/:id/catalog (auf die Packs des Projekts
  // eingeschränkt) — dieser Router ist bewusst ohne Anmeldung erreichbar.
  router.get('/catalog', (req, res) => {
    res.json(buildCatalog());
  });

  // GET /api/meta/packs — verfügbare Domain-Packs für die Projekt-Einstellungen
  router.get('/packs', (req, res) => {
    res.json({ packs: listPacks() });
  });

  // GET /api/meta/templates — Startvorlagen für neue Projekte
  router.get('/templates', (req, res) => {
    res.json({ templates: listTemplates() });
  });

  // GET /api/meta/legal — Rechtstexte dieser Instanz (Impressum, Datenschutz).
  // Bewusst ohne Anmeldung erreichbar: Ein Impressum muss ohne Konto einsehbar sein.
  // Leeres Array = diese Instanz hinterlegt keine Texte (typisch beim Self-Hosting).
  router.get('/legal', (req, res) => {
    res.json({ documents: readLegalDocuments() });
  });

  return router;
}
