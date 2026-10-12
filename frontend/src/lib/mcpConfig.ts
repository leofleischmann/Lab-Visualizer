/**
 * Einrichtungs-Schnipsel für MCP-Clients (Claude Code, Claude Desktop, Cursor,
 * VS Code). Genutzt vom API-Key-Dialog (mit dem frisch erzeugten Key) und von
 * der Doku-Seite /docs (mit Platzhalter).
 *
 * Der Server spricht "Streamable HTTP" unter /api/mcp und verlangt einen
 * API-Key als Bearer-Header (backend/src/routes/mcp.js). Claude Desktop kann
 * eigene Header nur über die Brücke `mcp-remote` setzen - daher dort npx.
 *
 * Beeinflusst: components/account/ApiKeysDialog.tsx, components/docs/McpSnippets.tsx.
 */

export const MCP_SERVER_NAME = 'lab-visualizer';
export const API_KEY_PLACEHOLDER = 'lvk_your_api_key';

export type McpClientId = 'claude-code' | 'claude-desktop' | 'cursor' | 'vscode';

export type McpSnippet = {
  id: McpClientId;
  label: string;
  /** Wohin der Schnipsel gehört (Datei oder Terminal). */
  where: string;
  code: string;
};

/** URL des MCP-Endpunkts dieser Instanz. */
export const mcpUrl = (origin: string) => `${origin.replace(/\/+$/, '')}/api/mcp`;

/**
 * mcp-remote verweigert unverschlüsseltes HTTP zu fremden Hosts, solange
 * `--allow-http` fehlt; localhost ist ausgenommen.
 */
function needsAllowHttp(url: string) {
  const { protocol, hostname } = new URL(url);
  return protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(hostname);
}

const json = (value: unknown) => JSON.stringify(value, null, 2);

export function mcpSnippets(origin: string, apiKey: string = API_KEY_PLACEHOLDER): McpSnippet[] {
  const url = mcpUrl(origin);
  const auth = `Bearer ${apiKey}`;
  return [
    {
      id: 'claude-code',
      label: 'Claude Code',
      where: 'Terminal',
      code: `claude mcp add --transport http ${MCP_SERVER_NAME} ${url} \\\n  --header "Authorization: ${auth}"`,
    },
    {
      id: 'claude-desktop',
      label: 'Claude Desktop',
      where: 'claude_desktop_config.json',
      code: json({
        mcpServers: {
          [MCP_SERVER_NAME]: {
            command: 'npx',
            args: [
              '-y',
              'mcp-remote',
              url,
              ...(needsAllowHttp(url) ? ['--allow-http'] : []),
              // Ohne Leerzeichen nach dem Doppelpunkt: Windows zerlegt sonst das Argument.
              '--header',
              'Authorization:${AUTH_HEADER}',
            ],
            env: { AUTH_HEADER: auth },
          },
        },
      }),
    },
    {
      id: 'cursor',
      label: 'Cursor',
      where: '.cursor/mcp.json',
      code: json({ mcpServers: { [MCP_SERVER_NAME]: { url, headers: { Authorization: auth } } } }),
    },
    {
      id: 'vscode',
      label: 'VS Code',
      where: '.vscode/mcp.json',
      code: json({ servers: { [MCP_SERVER_NAME]: { type: 'http', url, headers: { Authorization: auth } } } }),
    },
  ];
}
