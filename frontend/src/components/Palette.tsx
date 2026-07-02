import { useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import clsx from 'clsx';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { groupedCategories, iconOf } from '../lib/catalog';
import { useGraphStore } from '../store/graph';

export function Palette() {
  const catalog = useGraphStore((s) => s.catalog);
  const createNode = useGraphStore((s) => s.createNode);
  const { screenToFlowPosition } = useReactFlow();
  const [collapsed, setCollapsed] = useState(false);
  const [filter, setFilter] = useState('');

  const visibleGroups = groupedCategories(catalog)
    .map(([groupName, categories]) => {
      const needle = filter.trim().toLowerCase();
      const visible = needle
        ? categories.filter(
            (c) =>
              c.label.toLowerCase().includes(needle) || c.id.toLowerCase().includes(needle)
          )
        : categories;
      return [groupName, visible] as const;
    })
    .filter(([, categories]) => categories.length > 0);

  const addAtCenter = (categoryId: string, label: string) => {
    const position = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    void createNode({
      name: `Neu: ${label}`,
      category: categoryId,
      position,
      ...(categoryId === 'group' ? { width: 420, height: 260 } : {}),
    });
  };

  return (
    <aside
      className={clsx(
        'flex shrink-0 flex-col border-r border-slate-800 bg-slate-900/60 backdrop-blur transition-all',
        collapsed ? 'w-11' : 'w-56'
      )}
    >
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
        {!collapsed && (
          <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
            Bausteine
          </span>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? 'Palette einblenden' : 'Palette ausblenden'}
          className="rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-200"
        >
          {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
        </button>
      </div>

      {!collapsed && (
        <div className="flex-1 space-y-4 overflow-y-auto px-2.5 py-3">
          <p className="px-1 text-[10px] leading-relaxed text-slate-600">
            Auf die Canvas ziehen oder anklicken, um einen Node zu erstellen.
          </p>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Bausteine filtern …"
            spellCheck={false}
            className="w-full rounded-md border border-slate-700 bg-slate-950/70 px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none"
          />
          {visibleGroups.map(([groupName, categories]) => (
            <div key={groupName}>
              <h3 className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                {groupName}
              </h3>
              <div className="space-y-1">
                {categories.map((category) => {
                  const Icon = iconOf(category.icon);
                  return (
                    <button
                      key={category.id}
                      type="button"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/labviz-category', category.id);
                        e.dataTransfer.effectAllowed = 'copy';
                      }}
                      onClick={() => addAtCenter(category.id, category.label)}
                      className="flex w-full cursor-grab items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left text-xs text-slate-300 transition-colors hover:border-slate-700 hover:bg-slate-800/70 active:cursor-grabbing"
                    >
                      <span
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
                        style={{ backgroundColor: `${category.color}1e`, color: category.color }}
                      >
                        <Icon size={13} />
                      </span>
                      <span className="truncate">{category.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
