import { useState } from 'react';
import clsx from 'clsx';
import { ListFilter, X } from 'lucide-react';
import { filterDefs, matchesFilters } from '../lib/catalog';
import { useGraphStore } from '../store/graph';

/**
 * Filter nach Feldwerten: „nur Produktion", „nur Kritisch", „nur Datenbanken".
 *
 * Die Auswahl baut sich vollständig aus dem Katalog des Projekts (Status,
 * Kategorien und jedes Feld vom Typ `select`) — ein Prozess-Projekt bekommt
 * damit andere Filter als ein Server-Projekt, ohne dass hier etwas steht.
 *
 * Gefiltert wird durch DIMMEN, nicht durch Ausblenden: sonst reissen Kanten ins
 * Leere und die Struktur des Diagramms geht verloren. Mehrere Filter wirken als
 * UND.
 *
 * Beeinflusst: store/graph.ts (filters), lib/catalog.ts (filterDefs,
 * matchesFilters), canvas/InfraNode.tsx (Dimmen).
 */
export function FilterBar() {
  const catalog = useGraphStore((s) => s.catalog);
  const filters = useGraphStore((s) => s.filters);
  const setFilter = useGraphStore((s) => s.setFilter);
  const clearFilters = useGraphStore((s) => s.clearFilters);
  const nodes = useGraphStore((s) => s.nodes);

  const [open, setOpen] = useState(false);

  const defs = filterDefs(catalog);
  if (!defs.length) return null;

  const active = Object.entries(filters).filter(([, v]) => v);
  const labelOf = (key: string, value: string) => {
    const def = defs.find((d) => d.key === key);
    return def?.options.find((o) => o.value === value)?.label ?? value;
  };

  // Wie viele Nodes bleiben übrig? Zeigt sofort, ob der Filter zu eng ist.
  // Zonen zählen nicht mit: sie sind Behälter, keine Treffer (matchesFilters
  // lässt sie deshalb immer durch) — sonst zeigte der Zähler mehr Treffer an,
  // als hell dargestellt werden.
  const relevant = nodes.filter((n) => n.data.entity.category !== 'group');
  const total = relevant.length;
  const shown = relevant.filter((n) => matchesFilters(n.data.entity, filters)).length;

  return (
    <div className="relative flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Filter by field values"
        className={clsx(
          'flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors',
          active.length
            ? 'border-sky-500 bg-sky-500/10 text-sky-200'
            : 'border-slate-700 text-slate-300 hover:border-sky-500 hover:text-sky-300'
        )}
      >
        <ListFilter size={14} />
        <span className="hidden sm:inline">Filter</span>
        {active.length > 0 && (
          <span className="rounded bg-sky-500/30 px-1 text-[10px] tabular-nums">
            {shown}/{total}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-40 w-72 rounded-lg border border-slate-700 bg-slate-900 p-2.5 shadow-2xl shadow-black/60">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                Filter
              </span>
              {active.length > 0 && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-[11px] text-slate-400 hover:text-sky-300"
                >
                  Reset all
                </button>
              )}
            </div>

            <div className="max-h-80 space-y-2.5 overflow-y-auto">
              {defs.map((def) => (
                <label key={def.key} className="block">
                  <span className="mb-1 block text-[11px] font-medium text-slate-400">
                    {def.label}
                  </span>
                  <select
                    value={filters[def.key] ?? ''}
                    onChange={(e) => setFilter(def.key, e.target.value || null)}
                    className="w-full rounded-md border border-slate-700 bg-slate-950/70 px-2 py-1.5 text-xs text-slate-200 focus:border-sky-500 focus:outline-none"
                  >
                    <option value="">— all —</option>
                    {def.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>

            <p className="mt-2.5 border-t border-slate-800 pt-2 text-[10px] leading-relaxed text-slate-600">
              Non-matching nodes are dimmed, not hidden — so you can still see
              what they connect to. Multiple filters apply at once.
            </p>
          </div>
        </>
      )}

      {/* Aktive Filter als Chips: ohne sie müsste man das Menü öffnen, um zu
          sehen, warum die halbe Canvas blass ist. */}
      {active.map(([key, value]) => (
        <button
          key={key}
          type="button"
          onClick={() => setFilter(key, null)}
          title="Remove filter"
          className="hidden items-center gap-1 rounded-md border border-sky-500/40 bg-sky-500/10 px-1.5 py-1 text-[11px] text-sky-200 transition-colors hover:border-sky-400 lg:flex"
        >
          <span className="max-w-[120px] truncate">{labelOf(key, value)}</span>
          <X size={11} className="shrink-0 opacity-60" />
        </button>
      ))}
    </div>
  );
}
