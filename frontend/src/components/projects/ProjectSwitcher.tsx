import { useState } from 'react';
import clsx from 'clsx';
import { Boxes, Check, ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react';
import { useGraphStore } from '../../store/graph';

/**
 * Projekt-Umschalter in der TopBar: wechselt zwischen komplett getrennten
 * Arbeitsbereichen (z. B. „Homelab", „Arbeit"), legt an, benennt um, löscht.
 */
export function ProjectSwitcher() {
  const projects = useGraphStore((s) => s.projects);
  const activeProjectId = useGraphStore((s) => s.activeProjectId);
  const setActiveProject = useGraphStore((s) => s.setActiveProject);
  const createProject = useGraphStore((s) => s.createProject);
  const saveProject = useGraphStore((s) => s.saveProject);
  const removeProject = useGraphStore((s) => s.removeProject);

  const [open, setOpen] = useState(false);
  const active = projects.find((p) => p.id === activeProjectId) ?? null;

  const add = async () => {
    const name = window.prompt('Name des neuen Projekts:', 'Neues Projekt');
    if (name?.trim()) {
      await createProject({ name: name.trim() });
      setOpen(false);
    }
  };
  const rename = async (id: string, current: string) => {
    const name = window.prompt('Projekt umbenennen:', current);
    if (name?.trim()) await saveProject(id, { name: name.trim() });
  };
  const del = async (id: string, name: string) => {
    if (projects.length <= 1) return;
    if (window.confirm(`Projekt „${name}" mit ALLEN Ebenen, Nodes und Verbindungen löschen?`)) {
      await removeProject(id);
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/60 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-sky-500"
        title="Projekt wechseln"
      >
        <Boxes size={14} className="text-sky-400" />
        <span className="max-w-[160px] truncate">{active?.name ?? 'Projekt'}</span>
        <ChevronDown size={13} className="text-slate-500" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-10 z-40 w-72 rounded-lg border border-slate-700 bg-slate-900 p-1.5 shadow-2xl shadow-black/60">
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Projekte
            </div>
            <div className="max-h-72 overflow-y-auto">
              {projects.map((p) => (
                <div
                  key={p.id}
                  className={clsx(
                    'group flex items-center gap-1 rounded-md pr-1',
                    p.id === activeProjectId ? 'bg-sky-500/15' : 'hover:bg-slate-800'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      void setActiveProject(p.id);
                      setOpen(false);
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-2 text-left"
                  >
                    <Check
                      size={13}
                      className={clsx(
                        'shrink-0',
                        p.id === activeProjectId ? 'text-sky-300' : 'text-transparent'
                      )}
                    />
                    <span
                      className={clsx(
                        'truncate text-xs',
                        p.id === activeProjectId ? 'font-semibold text-sky-200' : 'text-slate-300'
                      )}
                    >
                      {p.name}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void rename(p.id, p.name)}
                    title="Umbenennen"
                    className="rounded p-1 text-slate-500 opacity-0 transition-opacity hover:bg-slate-700 hover:text-slate-200 group-hover:opacity-100"
                  >
                    <Pencil size={12} />
                  </button>
                  {projects.length > 1 && (
                    <button
                      type="button"
                      onClick={() => void del(p.id, p.name)}
                      title="Projekt löschen"
                      className="rounded p-1 text-slate-500 opacity-0 transition-opacity hover:bg-red-500/20 hover:text-red-300 group-hover:opacity-100"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void add()}
              className="mt-1 flex w-full items-center gap-1.5 rounded-md border-t border-slate-800 px-2 py-1.5 text-[11px] font-medium text-slate-400 hover:text-sky-300"
            >
              <Plus size={12} /> Neues Projekt
            </button>
          </div>
        </>
      )}
    </div>
  );
}
