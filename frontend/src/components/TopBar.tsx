import { useRef } from 'react';
import { useReactFlow } from '@xyflow/react';
import { Download, LayoutGrid, LogOut, Redo2, Trash2, Undo2, Upload } from 'lucide-react';
import { api } from '../api/client';
import { useGraphStore } from '../store/graph';
import { useAuthStore } from '../store/auth';
import { GlobalSearch } from './GlobalSearch';
import { ProjectSwitcher } from './projects/ProjectSwitcher';

export function TopBar() {
  const setError = useGraphStore((s) => s.setError);
  const userEmail = useAuthStore((s) => s.user?.email ?? '');
  const logout = useAuthStore((s) => s.logout);
  const importGraph = useGraphStore((s) => s.importGraph);
  const clearGraph = useGraphStore((s) => s.clearGraph);
  const autoLayout = useGraphStore((s) => s.autoLayout);
  const undo = useGraphStore((s) => s.undo);
  const redo = useGraphStore((s) => s.redo);
  const canUndo = useGraphStore((s) => s.past.length > 0);
  const canRedo = useGraphStore((s) => s.future.length > 0);
  const nodeCount = useGraphStore((s) => s.nodes.length);
  const edgeCount = useGraphStore((s) => s.edges.length);
  const isEmpty = nodeCount === 0 && edgeCount === 0;
  const fileInput = useRef<HTMLInputElement>(null);
  const { fitView } = useReactFlow();

  const refitView = () => {
    // Nach Layout/Import passt der alte Viewport nicht mehr zum Graphen
    window.setTimeout(() => void fitView({ padding: 0.15, duration: 400 }), 60);
  };

  const handleExport = async () => {
    try {
      const data = await api.exportGraph();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `lab-visualizer-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export fehlgeschlagen');
    }
  };

  const handleAutoLayout = async () => {
    if (isEmpty) return;
    if (await autoLayout()) refitView();
  };

  const handleClearAll = async () => {
    if (isEmpty) return;
    const ok = window.confirm(
      `Alle ${nodeCount} Nodes und ${edgeCount} Verbindungen unwiderruflich löschen?\n\n` +
        'Tipp: Vorher exportieren, falls du ein Backup brauchst.'
    );
    if (!ok) return;
    await clearGraph();
  };

  const handleImportFile = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed?.nodes)) {
        throw new Error('Ungültiges Format: "nodes"-Array fehlt');
      }
      const ok = window.confirm(
        `Import ersetzt den kompletten Graphen (${nodeCount} Nodes, ${edgeCount} Verbindungen) durch ` +
          `${parsed.nodes.length} Nodes / ${parsed.edges?.length ?? 0} Verbindungen` +
          `${parsed.views?.length ? ` / ${parsed.views.length} Ebenen` : ''}. Fortfahren?`
      );
      if (!ok) return;
      if (
        await importGraph({
          projects: parsed.projects ?? [],
          views: parsed.views ?? [],
          nodes: parsed.nodes,
          edges: parsed.edges ?? [],
        })
      )
        refitView();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import fehlgeschlagen');
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
            title="Wiederholen (Strg+Umschalt+Z)"
            className="flex items-center rounded-md border border-slate-700 p-1.5 text-slate-300 transition-colors hover:border-sky-500 hover:text-sky-300 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-600"
          >
            <Redo2 size={14} />
          </button>
        </div>
        <button
          type="button"
          onClick={() => void handleExport()}
          className="flex items-center gap-1.5 rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-sky-500 hover:text-sky-300"
        >
          <Download size={13} /> Export
        </button>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="flex items-center gap-1.5 rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-sky-500 hover:text-sky-300"
        >
          <Upload size={13} /> Import
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleImportFile(file);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          disabled={isEmpty}
          onClick={() => void handleAutoLayout()}
          title="Graph automatisch anordnen (deterministisch)"
          className="flex items-center gap-1.5 rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-emerald-500 hover:text-emerald-300 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-600 disabled:hover:border-slate-800 disabled:hover:text-slate-600"
        >
          <LayoutGrid size={13} /> Auto-Align
        </button>
        <button
          type="button"
          disabled={isEmpty}
          onClick={() => void handleClearAll()}
          title={isEmpty ? 'Graph ist bereits leer' : 'Alle Nodes und Verbindungen löschen'}
          className="flex items-center gap-1.5 rounded-md border border-red-900/60 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-600 disabled:hover:bg-transparent"
        >
          <Trash2 size={13} /> Alles löschen
        </button>

        <div className="ml-1 flex items-center gap-2 border-l border-slate-800 pl-3">
          <span className="hidden max-w-[14rem] truncate text-[11px] text-slate-400 xl:block" title={userEmail}>
            {userEmail}
          </span>
          <button
            type="button"
            onClick={() => void logout()}
            title="Abmelden"
            className="flex items-center gap-1.5 rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-red-500 hover:text-red-300"
          >
            <LogOut size={13} /> Abmelden
          </button>
        </div>
      </div>
    </header>
  );
}
