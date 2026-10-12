import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

/**
 * Codeblock mit Kopier-Knopf (API-Keys, curl-Beispiele, MCP-Konfiguration).
 *
 * Die Zwischenablage kann gesperrt sein (kein HTTPS, verweigerte Freigabe) -
 * dann bleibt der Text markierbar und der Knopf meldet das, statt still nichts
 * zu tun.
 */
export function CodeBlock({ code, label, className = '' }: { code: string; label?: string; className?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setState('copied');
    } catch (err) {
      console.debug('[Debug CodeBlock]: clipboard unavailable', err);
      setState('failed');
    }
    window.setTimeout(() => setState('idle'), 1800);
  };

  const button = (
    <button
      type="button"
      onClick={() => void copy()}
      title={state === 'failed' ? 'Copying failed - select the text manually' : 'Copy'}
      className={`flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-[10px] transition-colors ${
        state === 'failed' ? 'text-red-400' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-200'
      }`}
    >
      {state === 'copied' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Failed' : ''}
    </button>
  );

  // Der Knopf steht NEBEN dem Code statt darüber: lange Zeilen scrollen sonst
  // unter ihm hindurch und werden verdeckt.
  return (
    <div className={`rounded-md border border-slate-800 bg-slate-950/80 ${className}`}>
      {label && (
        <div className="flex items-center justify-between border-b border-slate-800 py-0.5 pl-3 pr-1">
          <span className="font-mono text-[10px] text-slate-500">{label}</span>
          {button}
        </div>
      )}
      <div className="flex items-start">
        <pre className="min-w-0 flex-1 overflow-x-auto px-3 py-2.5 font-mono text-[11px] leading-relaxed text-slate-200">
          <code>{code}</code>
        </pre>
        {!label && <div className="p-1">{button}</div>}
      </div>
    </div>
  );
}
