import { memo } from 'react';
import { NodeResizer, type NodeProps } from '@xyflow/react';
import clsx from 'clsx';
import type { FlowNode } from '../../api/types';
import { categoryOf } from '../../lib/catalog';
import { EntityIcon } from '../../lib/icons';
import { useGraphStore } from '../../store/graph';
import { ConnectionHandles } from './handles';

function ZoneNodeComponent({ id, data, selected }: NodeProps<FlowNode>) {
  const entity = data.entity;
  const catalog = useGraphStore((s) => s.catalog);
  const applyZoneGeometry = useGraphStore((s) => s.applyZoneGeometry);
  const drillInto = useGraphStore((s) => s.drillInto);

  // Zonen waren fest in Slate-Grau gezeichnet, obwohl Nodes eine Farbe tragen.
  // Ohne eigene Farbe pro Zone sähen ohnehin alle gleich aus — die Kategorie
  // `group` hat nur eine. Erst `entity.color` macht DMZ rot und intern grün.
  const category = categoryOf(catalog, entity.category);
  const color = entity.color;
  const icon = entity.icon ?? category.icon;

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
        // Siehe InfraNode: der Drill-down haengt nicht an ReactFlows
        // onNodeDoubleClick, weil das ohne Ziehbarkeit nicht feuert.
        onDoubleClick={entity.linkedViewId ? () => void drillInto(id) : undefined}
        title={entity.linkedViewId ? 'Doppelklick öffnet die Detailebene' : undefined}
        className={clsx(
          'group h-full w-full rounded-2xl border-2 border-dashed transition-colors',
          selected && 'border-sky-400/80 bg-sky-950/20',
          !selected && !color && 'border-slate-700 bg-slate-800/15'
        )}
        // Eigene Farbe: kräftiger Rand, sehr zurückhaltende Füllung — die Zone
        // liegt hinter ihren Kindern und darf sie nicht überstrahlen.
        style={
          !selected && color
            ? { borderColor: `${color}99`, backgroundColor: `${color}12` }
            : undefined
        }
      >
        <div
          className="flex items-center gap-1.5 px-3 pt-2 text-[11px] font-semibold uppercase tracking-widest"
          style={{ color: color ?? '#94a3b8' }}
        >
          <EntityIcon icon={icon} size={12} />
          <span className="truncate">{entity.name}</span>
        </div>
      </div>
    </>
  );
}

export const ZoneNode = memo(ZoneNodeComponent);
