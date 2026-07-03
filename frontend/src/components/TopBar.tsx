import { useRef } from 'react';
import { useReactFlow } from '@xyflow/react';
import { Download, LayoutGrid, Network, Search, Trash2, Upload } from 'lucide-react';
import { api } from '../api/client';
import { useGraphStore } from '../store/graph';

export function TopBar() {
  const search = useGraphStore((s) => s.search);
  const setSearch = useGraphStore((s) => s.setSearch);
  const setError = useGraphStore((s) => s.setError);
  const importGraph = useGraphStore((s) => s.importGraph);
  const clearGraph = useGraphStore((s) => s.clearGraph);
  const autoLayout = useGraphStore((s) => s.autoLayout);
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
    console.log('[Debug TopBar]: Auto-Align gestartet');
    if (await autoLayout()) refitView();
  };

  const handleClearAll = async () => {
    if (isEmpty) return;
    const ok = window.confirm(
      `Alle ${nodeCount} Nodes und ${edgeCount} Verbindungen unwiderruflich löschen?\n\n` +
        'Tipp: Vorher exportieren, falls du ein Backup brauchst.'
    );
    if (!ok) return;
    console.log('[Debug TopBar]: Alles löschen bestätigt');
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
          `${parsed.nodes.length} Nodes / ${parsed.edges?.length ?? 0} Verbindungen. Fortfahren?`
      );
      if (!ok) return;
      if (await importGraph({ nodes: parsed.nodes, edges: parsed.edges ?? [] })) refitView();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import fehlgeschlagen');
    }
  };

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-slate-800 bg-slate-900/80 px-4 backdrop-blur">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/15 text-sky-400">
          <Network size={18} />
        </span>
        <div className="leading-tight">
          <h1 className="text-sm font-bold tracking-tight text-slate-100">Lab Visualizer</h1>
          <p className="text-[10px] text-slate-500">
            {nodeCount} Nodes · {edgeCount} Verbindungen
          </p>
        </div>
      </div>

      <div className="relative mx-auto w-full max-w-md">
        <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Suchen: Name, IP, Hostname, Custom Fields …"
          spellCheck={false}
          className="w-full rounded-lg border border-slate-700 bg-slate-950/70 py-1.5 pl-8 pr-3 text-xs text-slate-200 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none"
        />
      </div>

      <div className="flex items-center gap-2">
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
      </div>
    </header>
  );
}
