import { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from '@xyflow/react';
import clsx from 'clsx';
import type { FlowEdge } from '../../api/types';
import { kindOf } from '../../lib/catalog';
import { useGraphStore } from '../../store/graph';

function InfraEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps<FlowEdge>) {
  const catalog = useGraphStore((s) => s.catalog);
  const select = useGraphStore((s) => s.select);
  const entity = data?.entity;

  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 14,
  });

  if (!entity) return <BaseEdge id={id} path={path} />;

  const kind = kindOf(catalog, entity.kind);
  const dashArray =
    entity.animated || entity.lineStyle === 'dashed'
      ? '7 5'
      : entity.lineStyle === 'dotted'
        ? '2 5'
        : undefined;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: kind.color,
          strokeWidth: selected ? 2.5 : 1.5,
          strokeDasharray: dashArray,
          animation: entity.animated ? 'labviz-dash 0.7s linear infinite' : undefined,
          opacity: selected ? 1 : 0.75,
        }}
      />
      {entity.label && (
        <EdgeLabelRenderer>
          <button
            type="button"
            onClick={() => select({ kind: 'edge', id })}
            className={clsx(
              'nodrag nopan pointer-events-auto absolute max-w-[220px] cursor-pointer truncate rounded-md border px-1.5 py-0.5 text-[10px] leading-tight',
              selected
                ? 'border-sky-400 bg-slate-900 text-sky-200'
                : 'border-slate-700/80 bg-slate-900/85 text-slate-400 hover:text-slate-200'
            )}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              // Edge-SVGs werden von React Flow auf z-index 1 angehoben, sobald sie
              // Kinder von Gruppen verbinden — Labels müssen mitziehen, sonst sind
              // sie nicht klickbar (Nodes liegen durch DOM-Reihenfolge weiter oben).
              zIndex: 1,
            }}
          >
            {entity.label}
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const InfraEdge = memo(InfraEdgeComponent);
