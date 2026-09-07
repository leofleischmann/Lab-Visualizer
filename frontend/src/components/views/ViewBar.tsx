import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { ChevronRight, Layers, Plus, Settings2, Trash2 } from 'lucide-react';
import type { View } from '../../api/types';
import { EntityIcon } from '../../lib/icons';
import { useGraphStore, viewPath } from '../../store/graph';
import { ViewStyleDialog } from './ViewStyleDialog';

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
  const removeView = useGraphStore((s) => s.removeView);
  const readOnly = useGraphStore((s) => s.readOnly);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<View | null>(null);

  const path = useMemo(() => viewPath(views, activeViewId), [views, activeViewId]);
  const rows = useMemo(() => flattenTree(views), [views]);
  const active = views.find((v) => v.id === activeViewId) ?? null;

  const addRoot = async () => {
    const name = window.prompt('Name of the new level:', 'New level');
    if (!name?.trim()) return;
    const created = await createView({ name: name.trim(), parentId: null });
    if (created) await setActiveView(created.id);
  };

  const addChild = async (parentId: string) => {
    const name = window.prompt('Name of the sub-level:', 'Detail level');
    if (!name?.trim()) return;
    const created = await createView({ name: name.trim(), parentId });
    if (created) await setActiveView(created.id);
    setOpen(false);
  };

  const del = async (view: View) => {
    if (views.length <= 1) return;
    if (
      window.confirm(
        `Delete level “${view.name}” including all sub-levels and their nodes/edges?`
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
                'flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 transition-colors',
                v.id === activeViewId
                  ? 'font-semibold text-sky-300'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              )}
            >
              {/* Symbol und Farbe der Ebene: lagen bisher ungenutzt in der DB. */}
              {(v.icon || v.color) && (
                <span style={{ color: v.color ?? undefined }}>
                  <EntityIcon icon={v.icon ?? 'layers'} size={11} />
                </span>
              )}
              {v.name}
            </button>
          </span>
        ))}
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        {active && !readOnly && (
          <button
            type="button"
            onClick={() => void addChild(active.id)}
            title="Create a detail level below the current one"
            className="flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-[11px] font-medium text-slate-300 transition-colors hover:border-sky-500 hover:text-sky-300"
          >
            <Plus size={12} /> Sub-level
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-[11px] font-medium text-slate-300 transition-colors hover:border-sky-500 hover:text-sky-300"
        >
          All levels ({views.length})
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
                    className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left"
                    style={{ paddingLeft: 8 + depth * 14 }}
                  >
                    <span className="shrink-0" style={{ color: view.color ?? '#64748b' }}>
                      <EntityIcon icon={view.icon ?? 'layers'} size={12} />
                    </span>
                    <span
                      className={clsx(
                        'truncate text-xs',
                        view.id === activeViewId ? 'font-semibold text-sky-200' : 'text-slate-300'
                      )}
                    >
                      {view.name}
                    </span>
                  </button>
                  {!readOnly && (
                  <button
                    type="button"
                    onClick={() => void addChild(view.id)}
                    title="Add sub-level"
                    className="rounded p-1 text-slate-500 opacity-0 transition-opacity hover:bg-slate-700 hover:text-sky-300 group-hover:opacity-100"
                  >
                    <Plus size={12} />
                  </button>
                  )}
                  {!readOnly && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(view);
                      setOpen(false);
                    }}
                    title="Name, icon & color"
                    className="rounded p-1 text-slate-500 opacity-0 transition-opacity hover:bg-slate-700 hover:text-slate-200 group-hover:opacity-100"
                  >
                    <Settings2 size={12} />
                  </button>
                  )}
                  {views.length > 1 && !readOnly && (
                    <button
                      type="button"
                      onClick={() => void del(view)}
                      title="Delete level"
                      className="rounded p-1 text-slate-500 opacity-0 transition-opacity hover:bg-red-500/20 hover:text-red-300 group-hover:opacity-100"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {!readOnly && (
              <button
                type="button"
                onClick={() => void addRoot()}
                className="mt-1 flex w-full items-center gap-1.5 rounded-md border-t border-slate-800 px-2 py-1.5 text-[11px] font-medium text-slate-400 hover:text-sky-300"
              >
                <Plus size={12} /> New top-level
              </button>
            )}
          </div>
        </>
      )}

      {editing && <ViewStyleDialog view={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
