import { useRef, useState } from 'react';
import {
  ChevronDown,
  Database,
  Download,
  FileImage,
  FilePlus2,
  FolderDown,
  Loader2,
  Trash2,
  Upload,
} from 'lucide-react';
import { api } from '../api/client';
import { renderDiagram, type ImageFormat } from '../lib/diagramImage';
import { useGraphStore } from '../store/graph';

type ImportMode = 'replace' | 'merge';

/**
 * Ebenenname zu einem Dateinamen. Umlaute werden umschrieben statt entfernt —
 * ein blosses Filtern auf a-z macht aus „Übersicht" sonst „-bersicht".
 */
function fileNameOf(name: string | undefined): string {
  const map: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };
  const slug = (name ?? '')
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => map[c])
    // Alles zerlegen und diakritische Zeichen entfernen (é -> e, å -> a).
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'diagram';
}

/**
 * Daten-Menü in der TopBar: Backup-Export (alles), Projekt-Export (zum Teilen),
 * Import als Ersetzen oder additives Hinzufügen (merge), Konto-Reset.
 */
export function DataMenu() {
  const setError = useGraphStore((s) => s.setError);
  const importGraph = useGraphStore((s) => s.importGraph);
  const clearGraph = useGraphStore((s) => s.clearGraph);
  const projects = useGraphStore((s) => s.projects);
  const activeProjectId = useGraphStore((s) => s.activeProjectId);

  const nodes = useGraphStore((s) => s.nodes);
  const views = useGraphStore((s) => s.views);
  const activeViewId = useGraphStore((s) => s.activeViewId);
  const withNeutralCanvas = useGraphStore((s) => s.withNeutralCanvas);

  const [open, setOpen] = useState(false);
  const [rendering, setRendering] = useState<ImageFormat | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const importMode = useRef<ImportMode>('replace');

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;
  const activeView = views.find((v) => v.id === activeViewId) ?? null;

  const download = (data: unknown, name: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  };

  /**
   * Die aktive Ebene als Bild speichern. Läuft komplett im Browser (keine
   * Server-Runde) und nimmt immer den GANZEN Graphen auf, unabhängig davon,
   * wohin gerade gezoomt ist — siehe lib/diagramImage.ts.
   */
  const handleExportImage = async (format: ImageFormat) => {
    setRendering(format);
    try {
      // Auswahl, Fokus und Suche vorher abschalten, sonst wandert der
      // Bedienzustand mit ins Dokument (siehe store.withNeutralCanvas).
      const dataUrl = await withNeutralCanvas(() => renderDiagram(nodes, format));
      const safe = fileNameOf(activeView?.name);
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `${safe}-${new Date().toISOString().slice(0, 10)}.${format}`;
      link.click();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not render the image');
    } finally {
      setRendering(null);
    }
  };

  const handleExportAll = async () => {
    try {
      const data = await api.exportGraph();
      download(data, `lab-visualizer-backup-${new Date().toISOString().slice(0, 10)}.json`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    }
    setOpen(false);
  };

  const handleExportProject = async () => {
    if (!activeProjectId) return;
    try {
      const data = await api.exportGraph(activeProjectId);
      const safeName = (activeProject?.name ?? 'project')
        .toLowerCase()
        .replace(/[^a-z0-9äöüß-]+/gi, '-')
        .slice(0, 40);
      download(data, `lab-visualizer-${safeName}-${new Date().toISOString().slice(0, 10)}.json`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    }
    setOpen(false);
  };

  const startImport = (mode: ImportMode) => {
    importMode.current = mode;
    fileInput.current?.click();
    setOpen(false);
  };

  const handleImportFile = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed?.nodes)) {
        throw new Error('Invalid format: "nodes" array is missing');
      }
      const mode = importMode.current;
      const summary =
        `${parsed.nodes.length} nodes / ${parsed.edges?.length ?? 0} connections` +
        `${parsed.views?.length ? ` / ${parsed.views.length} levels` : ''}` +
        `${parsed.projects?.length ? ` / ${parsed.projects.length} project(s)` : ''}`;
      const ok = window.confirm(
        mode === 'replace'
          ? `WARNING: this import replaces ALL data in your account (every project and level) with ${summary}. Continue?`
          : `The import adds ${summary} as a NEW project — existing data stays untouched. Continue?`
      );
      if (!ok) return;
      await importGraph(
        {
          projects: parsed.projects ?? [],
          views: parsed.views ?? [],
          nodes: parsed.nodes,
          edges: parsed.edges ?? [],
        },
        mode
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    }
  };

  const handleReset = async () => {
    const ok = window.confirm(
      'WARNING: this resets your ENTIRE account — every project, level, node and ' +
        'connection is deleted.\n\nTip: export a backup first if you still need the data.'
    );
    if (ok) await clearGraph();
    setOpen(false);
  };

  const item =
    'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs text-slate-300 transition-colors hover:bg-slate-800';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-sky-500 hover:text-sky-300"
        title="Export, import & reset"
      >
        <Database size={13} /> Data <ChevronDown size={12} className="text-slate-500" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-40 w-72 rounded-lg border border-slate-700 bg-slate-900 p-1.5 shadow-2xl shadow-black/60">
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Export
            </div>
            <button type="button" onClick={() => void handleExportAll()} className={item}>
              <Download size={13} className="text-slate-500" /> Export backup (all projects)
            </button>
            <button
              type="button"
              onClick={() => void handleExportProject()}
              disabled={!activeProjectId}
              className={item}
            >
              <FolderDown size={13} className="text-slate-500" />
              <span className="min-w-0 truncate">
                Export only “{activeProject?.name ?? 'project'}”
              </span>
            </button>

            <div className="mt-1 border-t border-slate-800 px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Diagram as image
            </div>
            {(
              [
                ['png', 'PNG (2x resolution)'],
                ['svg', 'SVG (scalable, for web & wiki)'],
              ] as const
            ).map(([format, label]) => (
              <button
                key={format}
                type="button"
                onClick={() => void handleExportImage(format)}
                disabled={!nodes.length || rendering !== null}
                title={
                  nodes.length
                    ? `Save the current level “${activeView?.name ?? ''}” as ${format.toUpperCase()}`
                    : 'This level has no nodes'
                }
                className={item}
              >
                {rendering === format ? (
                  <Loader2 size={13} className="animate-spin text-sky-400" />
                ) : (
                  <FileImage size={13} className="text-slate-500" />
                )}
                <span className="min-w-0 truncate">{label}</span>
              </button>
            ))}

            <div className="mt-1 border-t border-slate-800 px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Import
            </div>
            <button type="button" onClick={() => startImport('merge')} className={item}>
              <FilePlus2 size={13} className="text-slate-500" /> Add as a new project
            </button>
            <button type="button" onClick={() => startImport('replace')} className={item}>
              <Upload size={13} className="text-slate-500" /> Replace everything (restore)
            </button>

            <div className="mt-1 border-t border-slate-800 pt-1">
              <button
                type="button"
                onClick={() => void handleReset()}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs text-red-400 transition-colors hover:bg-red-500/10"
              >
                <Trash2 size={13} /> Reset account …
              </button>
            </div>
          </div>
        </>
      )}

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
    </div>
  );
}
