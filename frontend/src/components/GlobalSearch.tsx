import { useEffect, useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { Layers, Search, X } from 'lucide-react';
import { api } from '../api/client';
import type { ApiNode } from '../api/types';
import { categoryOf, nodeBadges } from '../lib/catalog';
import { absolutePosition, useGraphStore } from '../store/graph';

/**
 * Globale Suche über **alle Ebenen des aktiven Projekts**. Tippen filtert die
 * aktuelle Ebene (Dimmen) und zeigt zugleich eine Trefferliste projektweit;
 * ein Klick springt in die richtige Ebene und selektiert den Node.
 */
export function GlobalSearch() {
  const search = useGraphStore((s) => s.search);
  const setSearch = useGraphStore((s) => s.setSearch);
  const catalog = useGraphStore((s) => s.catalog);
  const views = useGraphStore((s) => s.views);
  const activeProjectId = useGraphStore((s) => s.activeProjectId);
  const activeViewId = useGraphStore((s) => s.activeViewId);
  const setActiveView = useGraphStore((s) => s.setActiveView);
  const select = useGraphStore((s) => s.select);

  const [results, setResults] = useState<ApiNode[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const { setCenter } = useReactFlow();

  // Debounced projektweite Suche
  useEffect(() => {
    const q = search.trim();
    if (!q || !activeProjectId) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        setResults((await api.searchNodes(activeProjectId, q)).slice(0, 20));
      } catch {
        setResults([]);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [search, activeProjectId]);

  const viewName = (id: string) => views.find((v) => v.id === id)?.name ?? 'Ebene';

  const reveal = async (node: ApiNode) => {
    if (node.viewId !== activeViewId) await setActiveView(node.viewId);
    select({ kind: 'node', id: node.id });
    setOpen(false);
    // Viewport auf den Treffer zentrieren (Position ggf. relativ zum Parent).
    const flowNodes = useGraphStore.getState().nodes;
    const target = flowNodes.find((n) => n.id === node.id);
    if (target) {
      const abs = absolutePosition(flowNodes, node.id);
      const w = target.width ?? target.measured?.width ?? 230;
      const h = target.height ?? target.measured?.height ?? 70;
      void setCenter(abs.x + w / 2, abs.y + h / 2, { zoom: 1.1, duration: 500 });
    }
  };

  return (
    <div ref={boxRef} className="relative mx-auto w-full max-w-md">
      <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
      <input
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Projektweit suchen: Name, IP, Hostname …"
        spellCheck={false}
        className="w-full rounded-lg border border-slate-700 bg-slate-950/70 py-1.5 pl-8 pr-8 text-xs text-slate-200 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none"
      />
      {search && (
        <button
          type="button"
          onClick={() => setSearch('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-500 hover:text-slate-300"
          title="Suche leeren"
        >
          <X size={13} />
        </button>
      )}

      {open && search.trim() && (
        <div className="absolute left-0 right-0 top-9 z-40 max-h-96 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 p-1 shadow-2xl shadow-black/60">
          {results.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-500">Keine Treffer im Projekt.</p>
          ) : (
            results.map((node) => {
              const cat = categoryOf(catalog, node.category);
              const badge = nodeBadges(catalog, node)[0]?.value ?? '';
              return (
                <button
                  key={node.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void reveal(node)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-slate-800"
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: cat.color }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs text-slate-200">{node.name}</span>
                    <span className="block truncate text-[10px] text-slate-500">
                      {cat.label}
                      {/* Zweitzeile: erstes Canvas-Feld des Katalogs (showOnNode),
                          statt einer fest verdrahteten IP. */}
                      {badge ? ` · ${badge}` : ''}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                    <Layers size={10} /> {viewName(node.viewId)}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
