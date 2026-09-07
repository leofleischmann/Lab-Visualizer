import { Router } from 'express';
import * as store from '../store.js';
import { buildCatalog } from '../catalog/index.js';
import { assetHeaders } from '../assets.js';

/**
 * Oeffentliche Leseansicht eines freigegebenen Projekts.
 *
 * Dieser Router haengt BEWUSST vor `requireAuth`: er ist ohne Konto erreichbar.
 * Deshalb gilt hier eine engere Regel als sonst im Backend:
 *
 *   - Nur GET. Ueber diesen Weg laesst sich nichts aendern.
 *   - Genau ein Projekt pro Link. Keine Angaben zum Besitzer, keine anderen
 *     Projekte, kein Zugriff auf die uebrige Bildbibliothek.
 *   - Unbekanntes oder abgelaufenes Token -> 404, nicht 403: die Antwort soll
 *     nicht verraten, ob ein Token einmal gueltig war.
 *
 * Beeinflusst: backend/src/share.js (Token & Ablauf), backend/src/store.js
 * (getSharedProject/getSharedAsset), frontend/src/components/share/.
 */
export function shareRouter(db) {
  const router = Router();

  // GET /api/share/:token — kompletter Lesestand des Projekts (alle Ebenen).
  // Bewusst alles auf einmal: der Betrachter soll ohne weitere Anfragen durch
  // die Drill-down-Hierarchie navigieren koennen.
  router.get('/:token', (req, res) => {
    const shared = store.getSharedProject(db, req.params.token);
    res.set('Cache-Control', 'no-store');
    res.json({ ...shared, catalog: buildCatalog(shared.project.packs) });
  });

  // GET /api/share/:token/assets/:id — Bild eines freigegebenen Projekts
  router.get('/:token/assets/:id', (req, res) => {
    const asset = store.getSharedAsset(db, req.params.token, req.params.id);
    const headers = assetHeaders(asset);
    if (req.headers['if-none-match'] === headers.ETag) {
      res.set(headers).status(304).end();
      return;
    }
    res.set(headers).send(asset.bytes);
  });

  return router;
}
