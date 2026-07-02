import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import clsx from 'clsx';
import type { FlowNode } from '../../api/types';
import { categoryOf, iconOf, matchesSearch, statusOf } from '../../lib/catalog';
import { useGraphStore } from '../../store/graph';

function InfraNodeComponent({ data, selected }: NodeProps<FlowNode>) {
  const entity = data.entity;
  const catalog = useGraphStore((s) => s.catalog);
  const search = useGraphStore((s) => s.search);

  const category = categoryOf(catalog, entity.category);
  const status = statusOf(catalog, entity.status);
  const Icon = iconOf(category.icon);
  const match = search.trim() ? matchesSearch(entity, search.trim()) : null;

  return (
    <div
      className={clsx(
        'w-[230px] rounded-xl border bg-slate-900/95 px-3 py-2.5 shadow-lg shadow-black/40 transition-opacity',
        selected
          ? 'border-sky-400 ring-2 ring-sky-400/40'
          : match === true
            ? 'border-amber-400 ring-2 ring-amber-400/50'
            : 'border-slate-700',
        match === false && 'opacity-25'
      )}
      style={{ borderLeftWidth: 4, borderLeftColor: category.color }}
    >
      <Handle type="target" position={Position.Top} id="top" />
      <Handle type="target" position={Position.Left} id="left" />
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
            entity.status === 'running' && 'animate-pulse'
          )}
          style={{ backgroundColor: status.color }}
        />
      </div>
      {(entity.ip || entity.hostname) && (
        <div className="mt-1.5 flex flex-wrap gap-x-2 border-t border-slate-800 pt-1.5 font-mono text-[10px] text-slate-400">
          {entity.ip && <span>{entity.ip}</span>}
          {entity.hostname && <span className="truncate text-slate-500">{entity.hostname}</span>}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} id="bottom" />
      <Handle type="source" position={Position.Right} id="right" />
    </div>
  );
}

export const InfraNode = memo(InfraNodeComponent);
