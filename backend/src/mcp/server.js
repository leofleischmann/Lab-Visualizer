/**
 * MCP-Server (Model Context Protocol) - Protokollschicht, transportunabhängig.
 *
 * Verarbeitet JSON-RPC-2.0-Nachrichten nach der MCP-Spezifikation: Lifecycle
 * (initialize, ping), tools/list und tools/call. Der HTTP-Transport
 * ("Streamable HTTP", zustandslos) steht in backend/src/routes/mcp.js.
 *
 * Bewusst ohne @modelcontextprotocol/sdk: für einen reinen Tool-Server ist das
 * Protokoll klein (vier Methoden), das SDK brächte dagegen u. a. ein zweites
 * Express mit. Interoperabilität sichert test/mcp.test.js ab.
 *
 * Zustandslos: Es gibt keine Mcp-Session-Id. Jeder Request trägt seinen
 * API-Key, wird für sich ausgeführt und beantwortet - deshalb funktioniert auch
 * tools/call ohne vorheriges initialize (z. B. für curl-Tests), und mehrere
 * Backend-Instanzen bräuchten keinen geteilten Zustand.
 *
 * Beeinflusst: backend/src/routes/mcp.js (HTTP), backend/src/mcp/tools.js,
 * backend/src/openapi.js (Doku des Endpunkts), AGENTS.md (Abschnitt MCP).
 */
import { ApiError, parseOrThrow } from '../validation.js';
import { getAppVersion } from '../version.js';
import { STATUS_IDS } from '../catalog/index.js';
import { debugLog } from '../debug.js';
import { TOOLS_BY_NAME, listToolDescriptors, toolAllowed } from './tools.js';

/**
 * Unterstützte Protokollversionen, neueste zuerst. Der Server bietet nur
 * Tools an; deren Nachrichtenformat ist über diese Versionen gleich geblieben.
 * Fragt ein Client eine unbekannte Version an, antwortet der Server mit der
 * neuesten - der Client entscheidet dann, ob er sie spricht (Spezifikation).
 */
export const SUPPORTED_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
export const LATEST_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];

/** JSON-RPC-Fehlercodes (Spezifikation JSON-RPC 2.0). */
export const RPC = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
};

class RpcError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

/**
 * Hinweise für den Agenten. Clients wie Claude Code legen sie in den
 * System-Prompt; sie ersetzen daher das Lesen von AGENTS.md. Nur die Regeln,
 * an denen ein Agent sonst scheitert - Details stehen in den Tool-Beschreibungen.
 */
function instructions(scope) {
  const lines = [
    'Lab Visualizer documents infrastructure and systems as a graph: project -> levels (views, a drill-down tree) -> nodes and edges.',
    'Orientation: list_projects -> get_project (levels) -> get_graph per level. Use search_nodes to find things across levels.',
    'Before creating nodes or edges, read get_catalog for valid category ids, edge kinds and field keys.',
    'Rules:',
    '- Products are field values, not categories: a Proxmox host is category "hypervisor" with fields.platform "Proxmox VE".',
    `- All field values are strings; "" means not set. Statuses: ${STATUS_IDS.join(', ')}.`,
    '- Zones are nodes with category "group" plus width/height. Create the zone first, then its children with parentId; child positions are relative to the zone.',
    '- Edges only connect nodes on the same level. Connect levels by setting a node\'s linkedViewId to a detail level.',
    '- update_* tools change only the given properties, but fields and customFields are replaced as a whole.',
    '- Give nodes readable ids (e.g. "nginx", "db-primary") so they can be updated later.',
    '- After creating several nodes without positions, call auto_layout for that level.',
  ];
  if (scope !== 'write') {
    lines.push('This API key is read-only: only reading tools are available.');
  }
  return lines.join('\n');
}

/** Fehler eines Tools - für den Agenten sichtbar (isError), kein Protokollfehler. */
function toolError(message, extra = {}) {
  return {
    content: [{ type: 'text', text: message }],
    structuredContent: { error: message, ...extra },
    isError: true,
  };
}

/** ApiError (Validierung, 404, Limits …) als lesbarer Text für den Agenten. */
function describeApiError(err) {
  const details = Array.isArray(err.details)
    ? err.details.map((d) => (d.path ? `${d.path}: ${d.message}` : d.message)).join('; ')
    : '';
  return details ? `${err.message} - ${details}` : err.message;
}

function callTool(ctx, params) {
  const name = params?.name;
  if (typeof name !== 'string') throw new RpcError(RPC.INVALID_PARAMS, 'params.name must be a string');
  const tool = TOOLS_BY_NAME.get(name);
  if (!tool) throw new RpcError(RPC.INVALID_PARAMS, `Unknown tool: ${name}`);
  if (!toolAllowed(tool, ctx.scope)) {
    return toolError(`"${name}" changes data, but this API key is read-only. Use a key with the "write" scope.`, {
      code: 'insufficient_scope',
    });
  }
  try {
    const args = parseOrThrow(tool.input, params.arguments ?? {});
    const result = tool.run(ctx, args);
    debugLog('mcp', 'tool ok', name);
    return {
      // Kompaktes JSON: spart dem Agenten Tokens, lesbar ist es trotzdem.
      content: [{ type: 'text', text: JSON.stringify(result) }],
      structuredContent: result,
    };
  } catch (err) {
    if (err instanceof ApiError) {
      debugLog('mcp', 'tool error', name, err.status, err.message);
      return toolError(describeApiError(err), {
        status: err.status,
        ...(err.code ? { code: err.code } : {}),
        ...(err.details ? { details: err.details } : {}),
      });
    }
    console.error(`MCP tool "${name}" failed:`, err);
    return toolError('Internal server error');
  }
}

function dispatch(ctx, method, params) {
  switch (method) {
    case 'initialize': {
      const requested = params?.protocolVersion;
      const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
        ? requested
        : LATEST_PROTOCOL_VERSION;
      debugLog('mcp', 'initialize', { requested, protocolVersion, client: params?.clientInfo });
      return {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'lab-visualizer', title: 'Lab Visualizer', version: getAppVersion() },
        instructions: instructions(ctx.scope),
      };
    }
    case 'ping':
      return {};
    case 'tools/list':
      // Keine Paginierung nötig: die Liste ist klein und fest.
      return { tools: listToolDescriptors(ctx.scope) };
    case 'tools/call':
      return callTool(ctx, params);
    default:
      throw new RpcError(RPC.METHOD_NOT_FOUND, `Method not found: ${method}`);
  }
}

const isValidId = (id) => typeof id === 'string' || (typeof id === 'number' && Number.isFinite(id));

/**
 * Verarbeitet EINE JSON-RPC-Nachricht.
 * @param {{db: object, userId: string, scope: 'read'|'write'}} ctx
 * @returns {object|null} Antwort - oder null für Notifications und Client-Antworten
 *   (auf die es keine Antwort gibt).
 */
export function handleMessage(ctx, message) {
  if (!message || typeof message !== 'object' || Array.isArray(message) || message.jsonrpc !== '2.0') {
    return rpcError(null, RPC.INVALID_REQUEST, 'Invalid JSON-RPC 2.0 message');
  }
  if (typeof message.method !== 'string') {
    // Antwort des Clients auf eine Server-Anfrage. Dieser Server stellt keine.
    if ('result' in message || 'error' in message) return null;
    return rpcError(isValidId(message.id) ? message.id : null, RPC.INVALID_REQUEST, 'Missing method');
  }
  if (!('id' in message)) {
    // Notification (z. B. notifications/initialized, notifications/cancelled):
    // nichts zu tun, keine Antwort.
    debugLog('mcp', 'notification', message.method);
    return null;
  }
  if (!isValidId(message.id)) {
    return rpcError(null, RPC.INVALID_REQUEST, 'id must be a string or number');
  }
  try {
    return { jsonrpc: '2.0', id: message.id, result: dispatch(ctx, message.method, message.params) };
  } catch (err) {
    if (err instanceof RpcError) {
      debugLog('mcp', 'rpc error', message.method, err.message);
      return rpcError(message.id, err.code, err.message);
    }
    console.error(`MCP method "${message.method}" failed:`, err);
    return rpcError(message.id, RPC.INTERNAL_ERROR, 'Internal server error');
  }
}
