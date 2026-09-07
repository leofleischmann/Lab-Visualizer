import { useState } from 'react';
import clsx from 'clsx';
import { Check, ChevronDown, Settings2, Plus, Share2, Trash2 } from 'lucide-react';
import type { Project } from '../../api/types';
import { EntityIcon } from '../../lib/icons';
import { useGraphStore } from '../../store/graph';
import { NewProjectDialog } from './NewProjectDialog';
import { ProjectSettingsDialog } from './ProjectSettingsDialog';
import { ShareDialog } from '../share/ShareDialog';

/**
 * Projekt-Umschalter in der TopBar: wechselt zwischen komplett getrennten
 * Arbeitsbereichen (z. B. „Homelab", „Arbeit"), legt an, bearbeitet, löscht.
 *
 * Anlegen und Bearbeiten laufen über Dialoge statt window.prompt, weil beides
 * mehr als einen Namen braucht: eine Vorlage bzw. die Domain-Packs des Projekts.
 */
export function ProjectSwitcher() {
  const projects = useGraphStore((s) => s.projects);
  const activeProjectId = useGraphStore((s) => s.activeProjectId);
  const setActiveProject = useGraphStore((s) => s.setActiveProject);
  const removeProject = useGraphStore((s) => s.removeProject);

  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [sharing, setSharing] = useState<Project | null>(null);
  const active = projects.find((p) => p.id === activeProjectId) ?? null;

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
        {/* Symbol und Farbe des Projekts: liegen seit jeher in der Datenbank
            (Vorlagen setzen sie beim Anlegen), wurden aber nie angezeigt. */}
        <span style={{ color: active?.color ?? '#38bdf8' }}>
          <EntityIcon icon={active?.icon ?? 'boxes'} size={14} />
        </span>
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
                    <span className="shrink-0" style={{ color: p.color ?? '#64748b' }}>
                      <EntityIcon icon={p.icon ?? 'boxes'} size={13} />
                    </span>
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
                    onClick={() => {
                      setSharing(p);
                      setOpen(false);
                    }}
                    title="Read-only teilen"
                    className="rounded p-1 text-slate-500 opacity-0 transition-opacity hover:bg-slate-700 hover:text-sky-300 group-hover:opacity-100"
                  >
                    <Share2 size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(p);
                      setOpen(false);
                    }}
                    title="Name & Bausteine"
                    className="rounded p-1 text-slate-500 opacity-0 transition-opacity hover:bg-slate-700 hover:text-slate-200 group-hover:opacity-100"
                  >
                    <Settings2 size={12} />
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
              onClick={() => {
                setCreating(true);
                setOpen(false);
              }}
              className="mt-1 flex w-full items-center gap-1.5 rounded-md border-t border-slate-800 px-2 py-1.5 text-[11px] font-medium text-slate-400 hover:text-sky-300"
            >
              <Plus size={12} /> Neues Projekt
            </button>
          </div>
        </>
      )}

      {creating && <NewProjectDialog onClose={() => setCreating(false)} />}
      {editing && (
        <ProjectSettingsDialog project={editing} onClose={() => setEditing(null)} />
      )}
      {sharing && <ShareDialog project={sharing} onClose={() => setSharing(null)} />}
    </div>
  );
}
