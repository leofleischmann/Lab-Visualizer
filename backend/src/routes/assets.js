import { Router } from 'express';
import * as store from '../store.js';
import { assetCreateSchema, parseOrThrow } from '../validation.js';
import { assetHeaders, decodeDataUrl } from '../assets.js';
import { getMaxAssetBytes } from '../limits.js';

/**
 * Hochgeladene Bilder: eigene Node-Icons und Bilder in Notizen.
 *
 * Beeinflusst: backend/src/assets.js (Typ-Erkennung & Header),
 * backend/src/store.js (Ablage), frontend/src/lib/icons.tsx.
 *
 * Bilder sind unveraenderlich: es gibt nur Anlegen, Lesen und Loeschen. Genau
 * deshalb darf der Browser sie dauerhaft cachen (siehe assetHeaders).
 */
export function assetsRouter(db) {
  const router = Router();

  // GET /api/assets — Bibliothek des Nutzers (nur Metadaten, ohne Bytes)
  router.get('/', (req, res) => {
    res.json(store.listAssets(db, req.userId));
  });

  // POST /api/assets — { name, dataUrl }. Der Typ wird an den Magic Bytes
  // erkannt, der im Data-URL genannte ist unerheblich.
  router.post('/', (req, res) => {
    const { name, dataUrl } = parseOrThrow(assetCreateSchema, req.body);
    const { bytes, mime } = decodeDataUrl(dataUrl, getMaxAssetBytes());
    res.status(201).json(store.createAsset(db, req.userId, { name, mime, bytes }));
  });

  // GET /api/assets/:id — liefert das Bild aus
  router.get('/:id', (req, res) => {
    const asset = store.getAssetWithBytes(db, req.userId, req.params.id);
    const headers = assetHeaders(asset);
    // Unveraendert seit dem letzten Abruf? Dann spart der Browser die Bytes.
    if (req.headers['if-none-match'] === headers.ETag) {
      res.set(headers).status(304).end();
      return;
    }
    res.set(headers).send(asset.bytes);
  });

  // DELETE /api/assets/:id — Nodes, die es als Icon nutzen, fallen auf das
  // Kategorie-Icon zurueck (die Referenz wird mit entfernt).
  router.delete('/:id', (req, res) => {
    res.json(store.deleteAsset(db, req.userId, req.params.id));
  });

  return router;
}
