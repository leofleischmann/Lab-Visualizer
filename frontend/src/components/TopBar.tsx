import { useReactFlow } from '@xyflow/react';
import { LayoutGrid, Redo2, Undo2 } from 'lucide-react';
import { useGraphStore } from '../store/graph';
import { FilterBar } from './FilterBar';
import { GlobalSearch } from './GlobalSearch';
import { ProjectSwitcher } from './projects/ProjectSwitcher';
import { DataMenu } from './DataMenu';
import { AccountMenu } from './account/AccountMenu';

export function TopBar() {
  const autoLayout = useGraphStore((s) => s.autoLayout);
  const undo = useGraphStore((s) => s.undo);
  const redo = useGraphStore((s) => s.redo);
  const canUndo = useGraphStore((s) => s.past.length > 0);
  const canRedo = useGraphStore((s) => s.future.length > 0);
  const nodeCount = useGraphStore((s) => s.nodes.length);
  const edgeCount = useGraphStore((s) => s.edges.length);
  const isEmpty = nodeCount === 0 && edgeCount === 0;
  const { fitView } = useReactFlow();

  const handleAutoLayout = async () => {
    if (isEmpty) return;
    if (await autoLayout()) {
      // Nach dem Layout passt der alte Viewport nicht mehr zum Graphen
      window.setTimeout(() => void fitView({ padding: 0.15, duration: 400 }), 60);
    }
  };

  return (
    <header className="relative z-40 flex h-14 shrink-0 items-center gap-4 border-b border-slate-800 bg-slate-900/80 px-4 backdrop-blur">
      <div className="flex shrink-0 items-center gap-2.5">
        <ProjectSwitcher />
        <p className="hidden text-[10px] text-slate-500 lg:block">
          {nodeCount} Nodes · {edgeCount} Verbindungen
        </p>
      </div>

      <GlobalSearch />

      <div className="flex shrink-0 items-center gap-2">
        <FilterBar />
        <div className="mr-1 flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => void undo()}
            disabled={!canUndo}
            title="Rückgängig (Strg+Z)"
            className="flex items-center rounded-md border border-slate-700 p-1.5 text-slate-300 transition-colors hover:border-sky-500 hover:text-sky-300 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-600"
          >
            <Undo2 size={14} />
          </button>
          <button
            type="button"
            onClick={() => void redo()}
            disabled={!canRedo}
            title="Wiederholen (Strg+Umschalt+Z / Strg+Y)"
            className="flex items-center rounded-md border border-slate-700 p-1.5 text-slate-300 transition-colors hover:border-sky-500 hover:text-sky-300 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-600"
          >
            <Redo2 size={14} />
          </button>
        </div>

        <button
          type="button"
          disabled={isEmpty}
          onClick={() => void handleAutoLayout()}
          title="Ebene automatisch anordnen (deterministisch)"
          className="flex items-center gap-1.5 rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-emerald-500 hover:text-emerald-300 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-600 disabled:hover:border-slate-800 disabled:hover:text-slate-600"
        >
          <LayoutGrid size={13} /> Auto-Align
        </button>

        <DataMenu />

        <div className="ml-1 border-l border-slate-800 pl-3">
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}
