import { memo } from 'react';
import { type NodeProps } from '@xyflow/react';
import clsx from 'clsx';
import { Layers } from 'lucide-react';
import type { FlowNode } from '../../api/types';
import { categoryOf, iconOf, matchesSearch, nodeBadges, statusOf } from '../../lib/catalog';
import { useGraphStore } from '../../store/graph';
import { ConnectionDropTarget, ConnectionHandles } from './handles';

function InfraNodeComponent({ id, data, selected }: NodeProps<FlowNode>) {
  const entity = data.entity;
  const catalog = useGraphStore((s) => s.catalog);
  const search = useGraphStore((s) => s.search);
  // Fokus-Modus: außerhalb des Fokus (Node + Nachbarn) wird gedimmt
  const dimmed = useGraphStore((s) => (s.focus ? !s.focus.nodeIds.has(id) : false));

  const category = categoryOf(catalog, entity.category);
  const status = statusOf(catalog, entity.status);
  const Icon = iconOf(category.icon);
  const match = search.trim() ? matchesSearch(entity, search.trim()) : null;
  const isPortal = !!entity.linkedViewId;
  const badges = nodeBadges(catalog, entity);

  return (
    <div
      className={clsx(
        'group relative w-[230px] rounded-xl border bg-slate-900/95 px-3 py-2.5 shadow-lg shadow-black/40 transition-opacity',
        selected
          ? 'border-sky-400 ring-2 ring-sky-400/40'
          : match === true
            ? 'border-amber-400 ring-2 ring-amber-400/50'
            : isPortal
              ? 'border-indigo-400/70'
              : 'border-slate-700',
        match === false ? 'opacity-25' : dimmed && 'opacity-30'
      )}
      style={{ borderLeftWidth: 4, borderLeftColor: category.color }}
      title={isPortal ? 'Doppelklick öffnet die Detailebene' : undefined}
    >
      <ConnectionHandles visible={!!selected} />
      <ConnectionDropTarget />
      {isPortal && (
        <span
          className="pointer-events-none absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-indigo-300 bg-indigo-500 text-white shadow-md shadow-black/40"
          title="Detailebene verknüpft (Doppelklick öffnet sie)"
        >
          <Layers size={11} />
        </span>
      )}
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${category.color}22`, color: category.color }}
        >
          <Icon size={17} strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold leading-tight text-slate-100">
            {entity.name}
          </div>
          <div className="truncate text-[10px] uppercase tracking-wide text-slate-500">
            {category.label}
          </div>
        </div>
        <span
          title={status.label}
          className={clsx(
            'h-2.5 w-2.5 shrink-0 rounded-full',
            entity.status === 'active' && 'animate-pulse'
          )}
          style={{ backgroundColor: status.color }}
        />
      </div>
      {/* Welche Felder hier erscheinen, entscheidet der Katalog über `showOnNode`
          (backend/src/catalog/, Feld `showOnNode`) — nicht dieser Component. */}
      {badges.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-x-2 border-t border-slate-800 pt-1.5 font-mono text-[10px] text-slate-400">
          {badges.map((badge, i) => (
            <span key={badge.key} className={i > 0 ? 'truncate text-slate-500' : undefined}>
              {badge.value}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export const InfraNode = memo(InfraNodeComponent);
