import { Router } from 'express';
import { createApiKey, listApiKeys, revokeApiKey } from '../apiKeys.js';
import { apiKeyCreateSchema, parseOrThrow } from '../validation.js';

/**
 * Verwaltung der eigenen API-Keys.
 *
 * Hängt in app.js hinter requireAuth UND requireSession: Keys lassen sich nur
 * aus einer angemeldeten Browser-Session verwalten, nie mit einem Key selbst.
 *
 * Beeinflusst: backend/src/apiKeys.js (Logik), backend/src/openapi.js (Doku),
 * frontend/src/components/account/ApiKeysDialog.tsx.
 */
export function apiKeysRouter(db) {
  const router = Router();

  // GET /api/api-keys - eigene Keys (ohne Token, nur das Präfix zum Wiedererkennen)
  router.get('/', (req, res) => {
    res.json(listApiKeys(db, req.userId));
  });

  // POST /api/api-keys - { name, scope, expiresAt? }. Das Klartext-Token steht
  // NUR in dieser Antwort; gespeichert wird sein Hash.
  router.post('/', (req, res) => {
    const data = parseOrThrow(apiKeyCreateSchema, req.body ?? {});
    res.status(201).json(createApiKey(db, req.userId, data));
  });

  // DELETE /api/api-keys/:id - sofort ungültig
  router.delete('/:id', (req, res) => {
    res.json(revokeApiKey(db, req.userId, req.params.id));
  });

  return router;
}
