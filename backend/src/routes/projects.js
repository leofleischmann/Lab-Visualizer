import { Router } from 'express';
import * as store from '../store.js';
import { projectCreateSchema, projectUpdateSchema, parseOrThrow } from '../validation.js';

export function projectsRouter(db) {
  const router = Router();

  // GET /api/projects — Projekte des angemeldeten Nutzers
  router.get('/', (req, res) => {
    res.json(store.listProjects(db, req.userId));
  });

  // POST /api/projects — legt ein Projekt inkl. leerer Root-Ebene an
  router.post('/', (req, res) => {
    const data = parseOrThrow(projectCreateSchema, req.body);
    res.status(201).json(store.createProject(db, req.userId, data));
  });

  router.get('/:id', (req, res) => {
    res.json(store.getProject(db, req.userId, req.params.id));
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
