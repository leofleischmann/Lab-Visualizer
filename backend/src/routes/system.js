import { Router } from 'express';
import { getAppVersion } from '../version.js';
import { getOpenApiDocument } from '../openapi.js';

/**
 * Öffentliche Systemendpunkte direkt unter /api: Health-Check und die
 * OpenAPI-Spezifikation (Grundlage der Doku-Seite /docs, importierbar in
 * Postman, Insomnia, Bruno oder Client-Generatoren).
 *
 * Beeinflusst: backend/Dockerfile (HEALTHCHECK auf /api/health),
 * backend/src/openapi.js, frontend/src/components/docs/ApiDocs.tsx.
 */
export function systemRouter() {
  const router = Router();

  router.get('/health', (req, res) => {
    res.json({ status: 'ok', version: getAppVersion(), time: new Date().toISOString() });
  });

  router.get('/openapi.json', (req, res) => {
    res.json(getOpenApiDocument());
  });

  return router;
}
