import { useEffect } from 'react';
import { AlertTriangle, RotateCw, X } from 'lucide-react';
import { FlowCanvas } from './components/canvas/FlowCanvas';
import { DetailDrawer } from './components/panel/DetailDrawer';
import { Palette } from './components/Palette';
import { TopBar } from './components/TopBar';
import { ViewBar } from './components/views/ViewBar';
import { AuthScreen } from './components/auth/AuthScreen';
import { LimitDialog } from './components/ui/LimitDialog';
import { useGraphStore } from './store/graph';
import { useAuthStore } from './store/auth';

export default function App() {
  const authStatus = useAuthStore((s) => s.status);
  const bootstrap = useAuthStore((s) => s.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  if (authStatus === 'loading') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-slate-950 text-slate-500">
        <RotateCw size={22} className="animate-spin" />
        <p className="text-sm">Lade …</p>
      </div>
    );
  }

  if (authStatus !== 'authed') {
    return <AuthScreen />;
  }

  return <Workspace />;
}

function Workspace() {
  const load = useGraphStore((s) => s.load);
  const loading = useGraphStore((s) => s.loading);
  const error = useGraphStore((s) => s.error);
  const setError = useGraphStore((s) => s.setError);
  const undo = useGraphStore((s) => s.undo);
  const redo = useGraphStore((s) => s.redo);
  const duplicateNode = useGraphStore((s) => s.duplicateNode);

  useEffect(() => {
    void load();
  }, [load]);

  // Tastenkürzel: Strg+Z / Strg+Umschalt+Z / Strg+Y (Undo/Redo),
  // Strg+D (selektierten Node duplizieren) — nicht in Eingabefeldern.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key !== 'z' && key !== 'y' && key !== 'd') return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable) return;
      e.preventDefault();
      if (key === 'd') {
        const selection = useGraphStore.getState().selection;
        if (selection?.kind === 'node') void duplicateNode(selection.id);
        return;
      }
      if (key === 'y' || e.shiftKey) void redo();
      else void undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, duplicateNode]);

  return (
    <div className="flex h-full flex-col bg-slate-950 text-slate-200">
      <TopBar />
      {!loading && <ViewBar />}
      <div className="relative flex min-h-0 flex-1">
        <Palette />
        <main className="relative min-w-0 flex-1">
          {loading ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-500">
              <RotateCw size={22} className="animate-spin" />
              <p className="text-sm">Lade Infrastruktur …</p>
            </div>
          ) : (
            <FlowCanvas />
          )}
        </main>
        <DetailDrawer />
        <LimitDialog />

        {error && (
          <div className="absolute bottom-4 left-1/2 z-50 flex max-w-xl -translate-x-1/2 items-start gap-2.5 rounded-lg border border-red-800 bg-red-950/95 px-4 py-2.5 text-xs text-red-200 shadow-xl">
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-red-400" />
            <p className="leading-relaxed">{error}</p>
            <button
              type="button"
              onClick={() => setError(null)}
              className="rounded p-0.5 text-red-400 transition-colors hover:bg-red-900 hover:text-red-200"
              title="Meldung schließen"
            >
              <X size={13} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
