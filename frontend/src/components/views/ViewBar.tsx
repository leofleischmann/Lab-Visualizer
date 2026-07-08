import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { ChevronRight, Layers, Pencil, Plus, Trash2 } from 'lucide-react';
import type { View } from '../../api/types';
import { useGraphStore, viewPath } from '../../store/graph';

/** Flache View-Liste → verschachtelte Reihen (Tiefe für Einrückung). */
function flattenTree(views: View[]): { view: View; depth: number }[] {
  const childrenOf = new Map<string | null, View[]>();
  for (const v of views) {
    const key = v.parentId ?? null;
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key)!.push(v);
  }
  const rows: { view: View; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const v of childrenOf.get(parent) ?? []) {
      rows.push({ view: v, depth });
      walk(v.id, depth + 1);
    }
  };
  walk(null, 0);
  return rows;
}

/**
 * Ebenen-Navigation unter der TopBar: Breadcrumb-Pfad (Drill-Hierarchie) plus
 * ein Dropdown mit dem kompletten Ebenen-Baum (wechseln, anlegen, löschen).
 */
export function ViewBar() {
  const views = useGraphStore((s) => s.views);
  const activeViewId = useGraphStore((s) => s.activeViewId);
  const setActiveView = useGraphStore((s) => s.setActiveView);
  const createView = useGraphStore((s) => s.createView);
  const saveView = useGraphStore((s) => s.saveView);
  const removeView = useGraphStore((s) => s.removeView);

  const [open, setOpen] = useState(false);

  const path = useMemo(() => viewPath(views, activeViewId), [views, activeViewId]);
  const rows = useMemo(() => flattenTree(views), [views]);
  const active = views.find((v) => v.id === activeViewId) ?? null;

  const addRoot = async () => {
    const name = window.prompt('Name der neuen Ebene:', 'Neue Ebene');
    if (!name?.trim()) return;
    const created = await createView({ name: name.trim(), parentId: null });
    if (created) await setActiveView(created.id);
  };

  const addChild = async (parentId: string) => {
    const name = window.prompt('Name der Unterebene:', 'Detailebene');
    if (!name?.trim()) return;
    const created = await createView({ name: name.trim(), parentId });
    if (created) await setActiveView(created.id);
    setOpen(false);
  };

  const rename = async (view: View) => {
    const name = window.prompt('Ebene umbenennen:', view.name);
    if (name?.trim() && name.trim() !== view.name) await saveView(view.id, { name: name.trim() });
  };

  const del = async (view: View) => {
    if (views.length <= 1) return;
    if (
      window.confirm(
        `Ebene „${view.name}" inkl. aller Unterebenen und deren Nodes/Kanten löschen?`
      )
    ) {
      await removeView(view.id);
      setOpen(false);
    }
  };

  return (
    <div className="relative z-30 flex h-9 shrink-0 items-center gap-1 border-b border-slate-800 bg-slate-900/60 px-3 text-xs">
      <Layers size={14} className="shrink-0 text-slate-500" />

      {/* Breadcrumb der Drill-Hierarchie */}
      <nav className="flex min-w-0 items-center gap-1 overflow-x-auto">
        {path.map((v, i) => (
          <span key={v.id} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={12} className="shrink-0 text-slate-600" />}
            <button
              type="button"
              onClick={() => void setActiveView(v.id)}
              className={clsx(
                'shrink-0 rounded px-1.5 py-0.5 transition-colors',
                v.id === activeViewId
                  ? 'font-semibold text-sky-300'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              )}
            >
              {v.name}
            </button>
          </span>
        ))}
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        {active && (
          <button
            type="button"
            onClick={() => void addChild(active.id)}
            title="Detailebene unter der aktuellen Ebene anlegen"
            className="flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-[11px] font-medium text-slate-300 transition-colors hover:border-sky-500 hover:text-sky-300"
          >
            <Plus size={12} /> Unterebene
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-[11px] font-medium text-slate-300 transition-colors hover:border-sky-500 hover:text-sky-300"
        >
          Alle Ebenen ({views.length})
        </button>
      </div>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-3 top-9 z-40 w-72 rounded-lg border border-slate-700 bg-slate-900 p-1.5 shadow-2xl shadow-black/60">
            <div className="max-h-80 overflow-y-auto">
              {rows.map(({ view, depth }) => (
                <div
                  key={view.id}
                  className={clsx(
                    'group flex items-center gap-1 rounded-md pr-1',
                    view.id === activeViewId ? 'bg-sky-500/15' : 'hover:bg-slate-800'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      void setActiveView(view.id);
                      setOpen(false);
                    }}
                    className="flex min-w-0 flex-1 items-center py-1.5 text-left"
                    style={{ paddingLeft: 8 + depth * 14 }}
                  >
                    <span
                      className={clsx(
                        'truncate text-xs',
                        view.id === activeViewId ? 'font-semibold text-sky-200' : 'text-slate-300'
                      )}
                    >
                      {view.name}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void addChild(view.id)}
                    title="Unterebene hinzufügen"
                    className="rounded p-1 text-slate-500 opacity-0 transition-opacity hover:bg-slate-700 hover:text-sky-300 group-hover:opacity-100"
                  >
                    <Plus size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void rename(view)}
                    title="Ebene umbenennen"
                    className="rounded p-1 text-slate-500 opacity-0 transition-opacity hover:bg-slate-700 hover:text-slate-200 group-hover:opacity-100"
                  >
                    <Pencil size={12} />
                  </button>
                  {views.length > 1 && (
                    <button
                      type="button"
                      onClick={() => void del(view)}
                      title="Ebene löschen"
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
              onClick={() => void addRoot()}
              className="mt-1 flex w-full items-center gap-1.5 rounded-md border-t border-slate-800 px-2 py-1.5 text-[11px] font-medium text-slate-400 hover:text-sky-300"
            >
              <Plus size={12} /> Neue Hauptebene
            </button>
          </div>
        </>
      )}
    </div>
  );
}
