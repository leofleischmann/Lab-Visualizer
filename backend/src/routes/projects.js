import { Router } from 'express';
import * as store from '../store.js';
import {
  projectCreateSchema,
  projectUpdateSchema,
  shareCreateSchema,
  parseOrThrow,
} from '../validation.js';
import { buildCatalog } from '../catalog/index.js';
import { getTemplate } from '../templates/index.js';
import { applyTemplate } from '../templates/apply.js';
import { assertTemplateFitsLimits } from '../limits.js';
import { ApiError } from '../validation.js';

export function projectsRouter(db) {
  const router = Router();

  // GET /api/projects — Projekte des angemeldeten Nutzers
  router.get('/', (req, res) => {
    res.json(store.listProjects(db, req.userId));
  });

  // POST /api/projects — legt ein Projekt inkl. leerer Root-Ebene an.
  // Mit `template` wird zusätzlich der Startinhalt aufgebaut (Ebenen, Nodes,
  // Kanten); ohne ausdrückliche `packs` übernimmt das Projekt die des Templates.
  router.post('/', (req, res) => {
    const { template: templateId, ...data } = parseOrThrow(projectCreateSchema, req.body);
    if (!templateId) {
      res.status(201).json(store.createProject(db, req.userId, data));
      return;
    }
    const template = getTemplate(templateId);
    if (!template) throw new ApiError(400, `Unknown template "${templateId}"`);
    assertTemplateFitsLimits(template);

    // Projekt und Template-Inhalt in EINER Transaktion: läuft der Aufbau in ein
    // Limit oder einen Validierungsfehler, bleibt kein halbes Projekt zurück.
    const created = db.transaction(() => {
      const project = store.createProject(db, req.userId, {
        ...data,
        packs: data.packs ?? template.packs,
      });
      applyTemplate(db, req.userId, project, templateId);
      return store.getProject(db, req.userId, project.id);
    })();
    res.status(201).json(created);
  });

  router.get('/:id', (req, res) => {
    res.json(store.getProject(db, req.userId, req.params.id));
  });

  // GET /api/projects/:id/catalog — Katalog, eingeschränkt auf die Packs dieses
  // Projekts. Palette, Deep-Dive-Panel und Kanten-Auswahl der UI bauen darauf
  // auf; getProject wirft 404 für fremde Projekte, die Pack-Auswahl eines
  // anderen Kontos ist damit nicht auslesbar.
  router.get('/:id/catalog', (req, res) => {
    const project = store.getProject(db, req.userId, req.params.id);
    res.json(buildCatalog(project.packs));
  });

  // ── Freigabelinks ─────────────────────────────────────────────
  // GET /api/projects/:id/shares — bestehende Links (ohne Token!)
  router.get('/:id/shares', (req, res) => {
    res.json(store.listShareLinks(db, req.userId, req.params.id));
  });

  // POST /api/projects/:id/shares — legt einen Link an. Das Klartext-Token
  // steht NUR in dieser einen Antwort; gespeichert wird nur sein Hash.
  router.post('/:id/shares', (req, res) => {
    const data = parseOrThrow(shareCreateSchema, req.body ?? {});
    res.status(201).json(store.createShareLink(db, req.userId, req.params.id, data));
  });

  // DELETE /api/projects/:id/shares/:shareId — Link widerrufen
  router.delete('/:id/shares/:shareId', (req, res) => {
    store.getProject(db, req.userId, req.params.id); // 404, falls fremd
    res.json(store.deleteShareLink(db, req.userId, req.params.shareId));
  });

  const update = (req, res) => {
    const patch = parseOrThrow(projectUpdateSchema, req.body);
    res.json(store.updateProject(db, req.userId, req.params.id, patch));
  };
  router.patch('/:id', update);
  router.put('/:id', update);

  // DELETE /api/projects/:id — kaskadiert auf Ebenen/Nodes/Edges (letztes: 400)
  router.delete('/:id', (req, res) => {
    res.json(store.deleteProject(db, req.userId, req.params.id));
  });

  return router;
}
