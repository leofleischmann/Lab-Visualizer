import { ViewportPortal } from '@xyflow/react';
import type { AlignmentGuide } from '../../lib/alignment';

/** Hilfslinien in Flow-Koordinaten, sichtbar während des Node-Drags. */
export function AlignmentGuides({ guides }: { guides: AlignmentGuide[] }) {
  if (!guides.length) return null;
  return (
    <ViewportPortal>
      {guides.map((guide, index) => (
        <div
          key={`${guide.axis}-${index}`}
          className="pointer-events-none absolute bg-sky-400/80"
          style={
            guide.axis === 'v'
              ? {
                  left: guide.position,
                  top: guide.from,
                  width: 1,
                  height: guide.to - guide.from,
                }
              : {
                  left: guide.from,
                  top: guide.position,
                  width: guide.to - guide.from,
                  height: 1,
                }
          }
        />
      ))}
    </ViewportPortal>
  );
}
