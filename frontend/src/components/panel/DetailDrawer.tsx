import { X } from 'lucide-react';
import { useGraphStore } from '../../store/graph';
import { EdgePanel } from './EdgePanel';
import { NodePanel } from './NodePanel';

export function DetailDrawer() {
  const selection = useGraphStore((s) => s.selection);
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const select = useGraphStore((s) => s.select);

  if (!selection) return null;

  const node =
    selection.kind === 'node' ? nodes.find((n) => n.id === selection.id) : undefined;
  const edge =
    selection.kind === 'edge' ? edges.find((e) => e.id === selection.id) : undefined;
  if (!node && !edge) return null;

  return (
    <aside className="relative flex w-[380px] shrink-0 flex-col border-l border-slate-800 bg-slate-900/70 backdrop-blur">
      <button
        type="button"
        onClick={() => select(null)}
        title="Close"
        className="absolute right-2 top-2.5 z-10 rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-200"
      >
        <X size={16} />
      </button>
      {node && <NodePanel entity={node.data.entity} />}
      {edge?.data && <EdgePanel entity={edge.data.entity} />}
    </aside>
  );
}
