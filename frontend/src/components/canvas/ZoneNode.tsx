import { memo } from 'react';
import { NodeResizer, type NodeProps } from '@xyflow/react';
import clsx from 'clsx';
import { Folder } from 'lucide-react';
import type { FlowNode } from '../../api/types';
import { useGraphStore } from '../../store/graph';
import { ConnectionHandles } from './handles';

function ZoneNodeComponent({ id, data, selected }: NodeProps<FlowNode>) {
  const entity = data.entity;
  const applyZoneGeometry = useGraphStore((s) => s.applyZoneGeometry);

  return (
    <>
      <NodeResizer
        isVisible={!!selected}
        minWidth={180}
        minHeight={120}
        lineStyle={{ borderColor: '#38bdf8' }}
        onResizeEnd={(_event, params) =>
          void applyZoneGeometry(id, {
            x: params.x,
            y: params.y,
            width: params.width,
            height: params.height,
          })
        }
      />
      <ConnectionHandles visible={!!selected} />
      <div
        className={clsx(
          'group h-full w-full rounded-2xl border-2 border-dashed transition-colors',
          selected ? 'border-sky-400/80 bg-sky-950/20' : 'border-slate-700 bg-slate-800/15'
        )}
      >
        <div className="flex items-center gap-1.5 px-3 pt-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
          <Folder size={12} />
          <span className="truncate">{entity.name}</span>
        </div>
      </div>
    </>
  );
}

export const ZoneNode = memo(ZoneNodeComponent);
