import { lazy, Suspense, useRef, useState } from 'react';
import clsx from 'clsx';
import { ImagePlus, Loader2 } from 'lucide-react';
import { api } from '../../api/client';
import { assetUrl } from '../../lib/icons';

// Erst beim Öffnen der Vorschau nachladen — spart ~200 kB im Erst-Bundle.
const MarkdownPreview = lazy(() => import('./MarkdownPreview'));

type Props = {
  value: string;
  onChange: (value: string) => void;
};

export function MarkdownEditor({ value, onChange }: Props) {
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  /**
   * Bild hochladen und als Markdown einfügen. Die URL zeigt auf die eigene
   * Instanz (/api/assets/…), nicht nach außen — das hält die CSP
   * (img-src 'self' data:) ein und verrät die IP der Leser an niemanden.
   *
   * Beeinflusst: backend/src/routes/assets.js. Beim Projekt-Export werden
   * genau diese URLs gescannt, damit die Bilder mitreisen (store.js).
   */
  const insertImage = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'));
        reader.readAsDataURL(file);
      });
      const asset = await api.createAsset(file.name.slice(0, 60), dataUrl);
      const markdown = `![${asset.name}](${assetUrl(asset.id)})`;
      onChange(value ? `${value.replace(/\s*$/, '')}\n\n${markdown}\n` : `${markdown}\n`);
      setTab('preview');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload fehlgeschlagen');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-lg border border-slate-700 bg-slate-900">
      <div className="flex items-center border-b border-slate-700 bg-slate-800/60 text-xs">
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
        <span className="flex-1" />
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileInput.current?.click()}
          title="Bild hochladen und einfügen"
          className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] text-slate-400 transition-colors hover:text-sky-300 disabled:opacity-50"
        >
          {uploading ? <Loader2 size={12} className="animate-spin" /> : <ImagePlus size={12} />}
          Bild
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void insertImage(file);
          }}
        />
      </div>
      {error && (
        <p className="border-b border-slate-800 bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-300">
          {error}
        </p>
      )}
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
