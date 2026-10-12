import { useState } from 'react';
import { mcpSnippets, type McpClientId } from '../../lib/mcpConfig';
import { CodeBlock } from '../ui/CodeBlock';

/**
 * Einrichtung des MCP-Servers für die gängigen Clients, als Reiter.
 * Mit `apiKey` (frisch erzeugt im API-Key-Dialog) direkt kopierfertig, ohne
 * (Doku-Seite) mit Platzhalter.
 *
 * Beeinflusst: lib/mcpConfig.ts (Inhalt der Schnipsel).
 */
export function McpSnippets({ apiKey }: { apiKey?: string }) {
  const snippets = mcpSnippets(window.location.origin, apiKey);
  const [active, setActive] = useState<McpClientId>('claude-code');
  const current = snippets.find((s) => s.id === active) ?? snippets[0];

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap gap-1" role="tablist">
        {snippets.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={s.id === active}
            onClick={() => setActive(s.id)}
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
              s.id === active
                ? 'bg-sky-500/15 text-sky-300'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <CodeBlock code={current.code} label={current.where} />
    </div>
  );
}
