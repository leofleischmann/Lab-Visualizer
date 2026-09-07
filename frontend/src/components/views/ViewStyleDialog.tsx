import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { View } from '../../api/types';
import { useGraphStore } from '../../store/graph';
import { Modal } from '../ui/Modal';
import { StyleFields } from '../ui/StyleFields';

/**
 * Ebene bearbeiten: Name, Symbol und Farbe.
 *
 * Ersetzt das frühere window.prompt zum Umbenennen. `color` und `icon` lagen
 * schon lange in der Datenbank und wurden validiert und exportiert, aber nie
 * angezeigt oder gesetzt — hier werden sie bedienbar, angezeigt in ViewBar.tsx.
 */
export function ViewStyleDialog({ view, onClose }: { view: View; onClose: () => void }) {
  const saveView = useGraphStore((s) => s.saveView);

  const [name, setName] = useState(view.name);
  const [icon, setIcon] = useState(view.icon);
  const [color, setColor] = useState(view.color);
  const [busy, setBusy] = useState(false);

  const dirty = name.trim() !== view.name || icon !== view.icon || color !== view.color;

  const submit = async () => {
    setBusy(true);
    const ok = await saveView(view.id, { name: name.trim() || view.name, icon, color });
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal title={`Ebene „${view.name}"`} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Name
          </span>
          <input
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && dirty && !busy) void submit();
            }}
            className="w-full rounded-md border border-slate-700 bg-slate-950/70 px-2.5 py-2 text-xs text-slate-200 focus:border-sky-500 focus:outline-none"
          />
        </div>

        <StyleFields
          icon={icon}
          color={color}
          fallbackIcon="layers"
          onIconChange={setIcon}
          onColorChange={setColor}
        />

        <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-slate-500"
          >
            Abbrechen
          </button>
          <button
            type="button"
            disabled={!dirty || busy}
            onClick={() => void submit()}
            className="flex items-center gap-1.5 rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500 disabled:bg-slate-800 disabled:text-slate-500"
          >
            {busy && <Loader2 size={13} className="animate-spin" />}
            Speichern
          </button>
        </div>
      </div>
    </Modal>
  );
}
