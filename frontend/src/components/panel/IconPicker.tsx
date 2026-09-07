import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Loader2, Trash2, Upload } from 'lucide-react';
import { api } from '../../api/client';
import type { Asset } from '../../api/types';
import { ICON_NAMES, iconOf } from '../../lib/catalog';
import { assetIconRef, assetUrl, isAssetIcon, EntityIcon } from '../../lib/icons';
import { Modal } from '../ui/Modal';

/**
 * Auswahl des Node-Icons: ein Symbol aus dem Katalog oder ein eigenes Bild.
 *
 * Beeinflusst: backend/src/routes/assets.js (Upload & Bibliothek),
 * frontend/src/lib/icons.tsx (Darstellung). Der Upload schickt eine Data-URL;
 * den Dateityp bestimmt das Backend an den Magic Bytes, nicht der Browser.
 */
const MAX_NAME = 60;

export function IconPicker({
  value,
  fallbackIcon,
  onChange,
  onClose,
  defaultLabel = 'Standard der Kategorie',
}: {
  /** Aktuelles Icon; null = Standard (Kategorie bzw. Vorgabe). */
  value: string | null;
  /** Symbol, das für die Standardauswahl in der Vorschau steht. */
  fallbackIcon: string;
  onChange: (icon: string | null) => void;
  onClose: () => void;
  /** Beschriftung der Standardauswahl — Projekte und Ebenen haben keine Kategorie. */
  defaultLabel?: string;
}) {
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void api
      .listAssets()
      .then((a) => !cancelled && setAssets(a))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Fehler'));
    return () => {
      cancelled = true;
    };
  }, []);

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'));
        reader.readAsDataURL(file);
      });
      const created = await api.createAsset(file.name.slice(0, MAX_NAME), dataUrl);
      setAssets((a) => [created, ...(a ?? [])]);
      onChange(assetIconRef(created.id));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (asset: Asset) => {
    if (!window.confirm(`Bild „${asset.name}" löschen? Nodes, die es nutzen, zeigen danach wieder ihr Kategorie-Icon.`)) return;
    try {
      await api.deleteAsset(asset.id);
      setAssets((a) => (a ?? []).filter((x) => x.id !== asset.id));
      if (value && isAssetIcon(value) && value === assetIconRef(asset.id)) onChange(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Löschen fehlgeschlagen');
    }
  };

  const needle = filter.trim().toLowerCase();
  const symbols = needle ? ICON_NAMES.filter((n) => n.includes(needle)) : ICON_NAMES;

  const choose = (icon: string | null) => {
    onChange(icon);
    onClose();
  };

  return (
    <Modal title="Icon wählen" onClose={onClose} maxWidth="max-w-lg">
      <div className="space-y-4">
        {error && (
          <p className="rounded-md border border-red-900/60 bg-red-500/10 px-2.5 py-2 text-[11px] text-red-300">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={() => choose(null)}
          className={clsx(
            'flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left text-xs transition-colors',
            value === null ? 'border-sky-500 bg-sky-500/10 text-slate-100' : 'border-slate-700 text-slate-400 hover:border-slate-500'
          )}
        >
          <EntityIcon icon={fallbackIcon} size={16} />
          {defaultLabel}
        </button>

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Eigene Bilder
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
              className="flex items-center gap-1.5 rounded-md border border-slate-700 px-2 py-1 text-[11px] text-slate-300 transition-colors hover:border-sky-500 hover:text-sky-300 disabled:opacity-50"
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
              Hochladen
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void upload(file);
              }}
            />
          </div>
          {assets === null ? (
            <p className="text-[11px] text-slate-600">Wird geladen …</p>
          ) : assets.length === 0 ? (
            <p className="text-[11px] leading-relaxed text-slate-600">
              Noch keine Bilder. PNG, JPEG, WebP oder SVG hochladen — sie bleiben auf
              dieser Instanz und reisen im Projekt-Export mit.
            </p>
          ) : (
            <div className="grid grid-cols-6 gap-1.5">
              {assets.map((asset) => {
                const ref = assetIconRef(asset.id);
                return (
                  <div key={asset.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => choose(ref)}
                      title={asset.name}
                      className={clsx(
                        'flex h-12 w-full items-center justify-center rounded-md border p-1.5 transition-colors',
                        value === ref ? 'border-sky-500 bg-sky-500/10' : 'border-slate-800 hover:border-slate-600'
                      )}
                    >
                      <img
                        src={assetUrl(asset.id)}
                        alt={asset.name}
                        className="max-h-full max-w-full object-contain"
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(asset)}
                      title="Bild löschen"
                      className="absolute -right-1 -top-1 rounded-full bg-slate-900 p-0.5 text-slate-500 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Symbole
            </span>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="filtern …"
              className="w-32 rounded-md border border-slate-700 bg-slate-950/70 px-2 py-1 text-[11px] text-slate-200 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none"
            />
          </div>
          <div className="grid max-h-52 grid-cols-8 gap-1.5 overflow-y-auto">
            {symbols.map((name) => {
              const Icon = iconOf(name);
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => choose(name)}
                  title={name}
                  className={clsx(
                    'flex h-9 items-center justify-center rounded-md border transition-colors',
                    value === name ? 'border-sky-500 bg-sky-500/10 text-sky-300' : 'border-slate-800 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                  )}
                >
                  <Icon size={15} />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}
