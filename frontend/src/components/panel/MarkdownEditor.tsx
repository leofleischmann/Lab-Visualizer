import { lazy, Suspense, useState } from 'react';
import clsx from 'clsx';

// Erst beim Öffnen der Vorschau nachladen — spart ~200 kB im Erst-Bundle.
const MarkdownPreview = lazy(() => import('./MarkdownPreview'));

type Props = {
  value: string;
  onChange: (value: string) => void;
};

export function MarkdownEditor({ value, onChange }: Props) {
  const [tab, setTab] = useState<'write' | 'preview'>('write');

  return (
    <div className="overflow-hidden rounded-lg border border-slate-700 bg-slate-900">
      <div className="flex border-b border-slate-700 bg-slate-800/60 text-xs">
        {(
          [
            ['write', 'Bearbeiten'],
            ['preview', 'Vorschau'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={clsx(
              'px-3 py-1.5 font-medium transition-colors',
              tab === key
                ? 'border-b-2 border-sky-400 text-sky-300'
                : 'text-slate-400 hover:text-slate-200'
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'write' ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={8}
          spellCheck={false}
          placeholder="Notizen in Markdown … (Tabellen, Listen, Code-Blöcke)"
          className="block w-full resize-y bg-transparent p-2.5 font-mono text-xs leading-relaxed text-slate-200 placeholder:text-slate-600 focus:outline-none"
        />
      ) : (
        <div className="prose prose-invert prose-sm max-w-none p-3 prose-headings:mt-3 prose-headings:mb-1.5 prose-p:my-1.5 prose-table:text-xs prose-th:px-2 prose-th:py-1 prose-td:px-2 prose-td:py-1">
          {value.trim() ? (
            <Suspense fallback={<p className="italic text-slate-500">Vorschau wird geladen …</p>}>
              <MarkdownPreview value={value} />
            </Suspense>
          ) : (
            <p className="italic text-slate-500">Keine Notizen vorhanden.</p>
          )}
        </div>
      )}
    </div>
  );
}
