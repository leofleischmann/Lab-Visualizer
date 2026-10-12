import { Router } from 'express';
import { isOriginAllowed, requireApiKey } from '../auth.js';
import {
  handleMessage,
  rpcError,
  RPC,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '../mcp/server.js';
import { debugLog } from '../debug.js';

/**
 * MCP-Endpunkt `/api/mcp` - Transport "Streamable HTTP" der MCP-Spezifikation,
 * zustandslos und ausschließlich mit JSON-Antworten (kein SSE-Stream):
 *
 *   POST   JSON-RPC-Nachricht (oder Batch) -> JSON-Antwort, bei reinen
 *          Notifications 202 ohne Body
 *   GET    405 - der Server sendet nie von sich aus (erlaubt laut Spezifikation)
 *   DELETE 405 - es gibt keine Sessions zu beenden
 *
 * Zugang NUR per API-Key (Bearer), siehe requireApiKey in auth.js. Ein
 * gesendeter Origin muss zum Host oder zu CORS_ORIGIN passen (von der
 * Spezifikation verlangt); Desktop-Clients senden keinen. Gegen DNS-Rebinding
 * schützt vor allem der Pflicht-Key: eine fremde Seite kennt ihn nicht, und ein
 * Cookie wird hier nie akzeptiert.
 *
 * Beeinflusst: backend/src/app.js (Mount + mcpErrorHandler), backend/src/mcp/,
 * frontend/nginx.conf (/api wird durchgereicht), AGENTS.md, frontend /docs.
 */
export function mcpRouter(db) {
  const router = Router();

  router.use((req, res, next) => {
    if (isOriginAllowed(req)) return next();
    debugLog('mcp', 'rejected origin', req.get('origin'));
    res.status(403).json(rpcError(null, RPC.INVALID_REQUEST, 'Origin not allowed'));
  });

  router.use(requireApiKey(db));

  router.post('/', (req, res) => {
    const body = req.body;
    const batch = Array.isArray(body);
    const messages = batch ? body : [body];

    // Nach initialize sendet der Client die ausgehandelte Version in jedem
    // Request mit; eine unbekannte wird abgelehnt (Spezifikation).
    const version = req.get('mcp-protocol-version');
    const initializing = messages.some((m) => m?.method === 'initialize');
    if (version && !initializing && !SUPPORTED_PROTOCOL_VERSIONS.includes(version)) {
      return res
        .status(400)
        .json(rpcError(null, RPC.INVALID_REQUEST, `Unsupported MCP-Protocol-Version: ${version}`));
    }
    if (batch && messages.length === 0) {
      return res.status(400).json(rpcError(null, RPC.INVALID_REQUEST, 'Empty batch'));
    }

    const ctx = { db, userId: req.userId, scope: req.auth.scope };
    const responses = messages.map((message) => handleMessage(ctx, message)).filter(Boolean);
    if (!responses.length) return res.status(202).end();
    if (batch) return res.json(responses);

    // Eine einzelne, formal ungültige Nachricht ist ein Fehler des Transports.
    const [response] = responses;
    res.status(response.error?.code === RPC.INVALID_REQUEST ? 400 : 200).json(response);
  });

  router.all('/', (req, res) => {
    res.set('Allow', 'POST');
    res.status(405).json(rpcError(null, RPC.INVALID_REQUEST, 'Method not allowed: send JSON-RPC via POST'));
  });

  return router;
}

/**
 * Ungültiges JSON im Body ist bei MCP ein JSON-RPC "Parse error" statt der
 * REST-Fehlerform. Hängt in app.js VOR dem zentralen Error-Handler, weil der
 * Body-Parser den Fehler wirft, bevor der Router erreicht wird.
 */
export function mcpErrorHandler(err, req, res, next) {
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json(rpcError(null, RPC.PARSE_ERROR, 'Parse error: invalid JSON'));
  }
  next(err);
}
