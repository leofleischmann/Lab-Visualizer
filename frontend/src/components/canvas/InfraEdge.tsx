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
import {
  buildNodeBoxes,
  computeEdgeRoute,
  edgeBundleOffset,
  inferHandlePositions,
  labelAlongPathOffset,
  labelPosition,
} from '../../lib/edgeRouting';
import { useGraphStore } from '../../store/graph';

function InfraEdgeComponent({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  selected,
}: EdgeProps<FlowEdge>) {
  const catalog = useGraphStore((s) => s.catalog);
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const select = useGraphStore((s) => s.select);
  const entity = data?.entity;

  const { sourcePosition, targetPosition } = inferHandlePositions(nodes, source, target);
  const exclude = new Set([source, target]);
  const obstacles = buildNodeBoxes(nodes, exclude);
  const bundleOffset = edgeBundleOffset(id, source, target, edges);
  const route = computeEdgeRoute(
    {
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
      offset: bundleOffset,
    },
    obstacles
  );

  const [path, labelX, labelY] = getSmoothStepPath(route);

  if (!entity) return <BaseEdge id={id} path={path} />;

  const kind = kindOf(catalog, entity.kind);
  const dashArray =
    entity.animated || entity.lineStyle === 'dashed'
      ? '7 5'
      : entity.lineStyle === 'dotted'
        ? '2 5'
        : undefined;

  const alongT = labelAlongPathOffset(id, source, edges);
  const labelPos = labelPosition(
    labelX,
    labelY,
    sourceX,
    sourceY,
    targetX,
    targetY,
    alongT,
    obstacles
  );

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
          opacity: selected ? 1 : 0.82,
        }}
      />
      {entity.label && (
        <EdgeLabelRenderer>
          <button
            type="button"
            onClick={() => select({ kind: 'edge', id })}
            className={clsx(
              'nodrag nopan pointer-events-auto absolute max-w-[240px] cursor-pointer rounded-md border px-2 py-1 text-[10px] leading-snug shadow-md shadow-black/40',
              selected
                ? 'border-sky-400 bg-slate-950 text-sky-100'
                : 'border-slate-600 bg-slate-950/95 text-slate-300 hover:border-slate-500 hover:text-slate-100'
            )}
            style={{
              transform: `translate(-50%, -50%) translate(${labelPos.x}px, ${labelPos.y}px)`,
              zIndex: 6,
              whiteSpace: 'normal',
              textAlign: 'center',
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
