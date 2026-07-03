import { useEffect, useState } from 'react';
import { EdgeLabelRenderer } from '@xyflow/react';

/** DOM-Id der gemeinsamen Trefferflächen-SVG (siehe InfraEdge-Portal). */
export const EDGE_HIT_LAYER_ID = 'labviz-edge-hit-layer';

/**
 * Eine einzige SVG-Ebene über den Nodes, in die alle Kanten ihre unsichtbaren
 * Trefferflächen (breite Pfade) per Portal rendern. So sind Linien auch über
 * Zonen greifbar, ohne pro Kante ein eigenes <svg> zu erzeugen (deutlich weniger
 * DOM/Paint beim Zoomen — 88 Kanten → 1 statt 88 SVG-Elemente).
 */
export function EdgeHitLayer() {
  return (
    <EdgeLabelRenderer>
      <svg
        id={EDGE_HIT_LAYER_ID}
        className="absolute overflow-visible"
        style={{ top: 0, left: 0, width: 1, height: 1, zIndex: 8, pointerEvents: 'none' }}
      />
    </EdgeLabelRenderer>
  );
}

/** Wartet, bis die Hit-Layer-SVG im DOM ist (für createPortal in InfraEdge). */
export function useEdgeHitLayer(): SVGSVGElement | null {
  const [layer, setLayer] = useState<SVGSVGElement | null>(null);
  useEffect(() => {
    if (layer) return;
    const found = document.getElementById(EDGE_HIT_LAYER_ID);
    if (found) {
      setLayer(found as unknown as SVGSVGElement);
    } else {
      // Falls die Kante vor der Ebene mountet: im nächsten Frame erneut suchen.
      const raf = requestAnimationFrame(() =>
        setLayer(document.getElementById(EDGE_HIT_LAYER_ID) as unknown as SVGSVGElement | null)
      );
      return () => cancelAnimationFrame(raf);
    }
  }, [layer]);
  return layer;
}
