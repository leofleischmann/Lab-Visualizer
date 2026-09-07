import { useEffect } from 'react';
import { AlertTriangle, Eye, Layers, RotateCw } from 'lucide-react';
import { FlowCanvas } from '../canvas/FlowCanvas';
import { DetailDrawer } from '../panel/DetailDrawer';
import { ViewBar } from '../views/ViewBar';
import { LegalLinks } from '../ui/LegalLinks';
import { EntityIcon, setAssetBase } from '../../lib/icons';
import { useGraphStore } from '../../store/graph';

/**
 * Leseansicht eines Freigabelinks — die Seite, die jemand ohne Konto sieht.
 *
 * Bewusst dieselbe Canvas und derselbe Drawer wie im Editor: eine eigene
 * Betrachter-Oberfläche würde mit der Zeit vom Original abweichen und Zonen,
 * Kanten oder Felder anders darstellen. Stattdessen schaltet der Store auf
 * `readOnly`, und die betroffenen Komponenten blenden alles Schreibende aus.
 *
 * Beeinflusst: store/graph.ts (readOnly, loadShared), canvas/FlowCanvas.tsx,
 * panel/* (kein Speichern/Löschen), backend/src/routes/share.js.
 */
export function SharedApp({ token }: { token: string }) {
  const loadShared = useGraphStore((s) => s.loadShared);
  const loading = useGraphStore((s) => s.loading);
  const error = useGraphStore((s) => s.error);
  const project = useGraphStore((s) => s.projects[0] ?? null);
  const views = useGraphStore((s) => s.views);

  useEffect(() => {
    // Bilder kommen im Lesemodus über den Freigabelink, nicht über /api/assets:
    // der Betrachter hat kein Konto.
    setAssetBase(`/api/share/${encodeURIComponent(token)}/assets`);
    void loadShared(token);
  }, [token, loadShared]);

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-slate-950 text-slate-500">
        <RotateCw size={22} className="animate-spin" />
        <p className="text-sm">Freigabe wird geladen …</p>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-slate-950 px-6 text-center">
        <AlertTriangle size={24} className="text-amber-400" />
        <p className="text-sm font-semibold text-slate-200">Diese Freigabe ist nicht verfügbar</p>
        <p className="max-w-md text-xs leading-relaxed text-slate-500">
          Der Link ist ungültig, abgelaufen oder wurde widerrufen. Frag die Person,
          die ihn geteilt hat, nach einem neuen.
        </p>
        <LegalLinks />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-slate-950">
      <header className="relative z-40 flex h-14 shrink-0 items-center gap-3 border-b border-slate-800 bg-slate-900/80 px-4 backdrop-blur">
        <span style={{ color: project.color ?? '#38bdf8' }}>
          <EntityIcon icon={project.icon ?? 'boxes'} size={16} />
        </span>
        <span className="truncate text-sm font-semibold text-slate-100">{project.name}</span>
        <span className="flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-300">
          <Eye size={11} /> Nur lesen
        </span>
        <span className="hidden items-center gap-1 text-[11px] text-slate-500 sm:flex">
          <Layers size={12} />
          {views.length} {views.length === 1 ? 'Ebene' : 'Ebenen'}
        </span>
        <div className="ml-auto">
          <LegalLinks />
        </div>
      </header>

      <ViewBar />

      <div className="flex min-h-0 flex-1">
        <FlowCanvas />
        <DetailDrawer />
      </div>
    </div>
  );
}
