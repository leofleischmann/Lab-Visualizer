import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '../../api/client';
import type { Pack, Project } from '../../api/types';
import { useGraphStore } from '../../store/graph';
import { Modal } from '../ui/Modal';
import { StyleFields } from '../ui/StyleFields';
import { PackPicker } from './NewProjectDialog';

/**
 * Projekt-Einstellungen: Name und die aktiven Domain-Packs.
 *
 * Ein Pack abzuwählen löscht KEINE Daten — Werte zu dessen Feldern bleiben am
 * Node erhalten und tauchen im Deep-Dive-Panel unter „Weitere Felder" wieder
 * auf. Das steht auch im Dialog, weil die Alternative (stiller Datenverlust)
 * die naheliegende Befürchtung ist.
 *
 * Beeinflusst: backend/src/catalog/index.js (Pack-Liste), store.saveProject
 * (lädt den Projekt-Katalog nach einer Pack-Änderung neu).
 */
export function ProjectSettingsDialog({
  project,
  onClose,
}: {
  project: Project;
  onClose: () => void;
}) {
  const saveProject = useGraphStore((s) => s.saveProject);

  const [packs, setPacks] = useState<Pack[] | null>(null);
  const [name, setName] = useState(project.name);
  const [icon, setIcon] = useState(project.icon);
  const [color, setColor] = useState(project.color);
  const [selected, setSelected] = useState<string[]>(project.packs);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void api
      .packs()
      .then((r) => !cancelled && setPacks(r.packs))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty =
    name.trim() !== project.name ||
    icon !== project.icon ||
    color !== project.color ||
    JSON.stringify([...selected].sort()) !== JSON.stringify([...project.packs].sort());

  const submit = async () => {
    setBusy(true);
    const ok = await saveProject(project.id, {
      name: name.trim() || project.name,
      icon,
      color,
      packs: selected,
    });
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal title={`Projekt „${project.name}"`} onClose={onClose} maxWidth="max-w-lg">
      {!packs ? (
        <div className="flex items-center gap-2 py-8 text-xs text-slate-400">
          <Loader2 size={14} className="animate-spin" /> Wird geladen …
        </div>
      ) : (
        <div className="space-y-5">
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
            fallbackIcon="boxes"
            onIconChange={setIcon}
            onColorChange={setColor}
          />

          <PackPicker
            packs={packs}
            active={selected}
            onToggle={(id) =>
              setSelected((s) => (s.includes(id) ? s.filter((p) => p !== id) : [...s, id]))
            }
          />

          <p className="rounded-md border border-slate-800 bg-slate-950/50 px-2.5 py-2 text-[10px] leading-relaxed text-slate-500">
            Ein Baustein-Paket abzuwählen blendet nur aus. Bereits gefüllte Felder
            bleiben am Node erhalten und erscheinen im Panel unter „Weitere Felder“.
          </p>

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
      )}
    </Modal>
  );
}
