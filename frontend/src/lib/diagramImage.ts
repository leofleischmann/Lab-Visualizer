import { getNodesBounds, getViewportForBounds, type Node } from '@xyflow/react';
import { toPng, toSvg } from 'html-to-image';

/**
 * Die aktuelle Ebene als Bild ausgeben.
 *
 * Warum nicht einfach den sichtbaren Ausschnitt abfotografieren: das Ergebnis
 * haengt sonst von Zoom und Scrollposition ab und schneidet ab, was gerade
 * nicht im Bild ist. Stattdessen wird die Bounding-Box ALLER Nodes berechnet
 * und der Viewport dafuer gesetzt — das Bild zeigt immer den ganzen Graphen.
 *
 * Aufgenommen wird `.react-flow__viewport`, also nur Nodes und Kanten. Zoom-
 * Bedienung, Minimap und Punkteraster liegen ausserhalb und muessen daher nicht
 * eigens ausgeblendet werden.
 *
 * Beeinflusst: frontend/src/components/DataMenu.tsx.
 */
const PADDING = 0.12;
const MIN_SIZE = 400;
const MAX_SIZE = 8000;

export type ImageFormat = 'png' | 'svg';

/** Hintergrund des Bildes — dieselbe Flaeche wie die Canvas (slate-950). */
const BACKGROUND = '#020617';

function frame(nodes: Node[], scale: number) {
  const bounds = getNodesBounds(nodes);
  // Auf ein Vielfaches begrenzen: ein Graph mit 500 Nodes wuerde sonst ein Bild
  // erzeugen, an dem der Browser scheitert.
  const width = Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(bounds.width * scale * (1 + PADDING * 2))));
  const height = Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(bounds.height * scale * (1 + PADDING * 2))));
  // minZoom/maxZoom weit oeffnen: der Rahmen soll sich nach dem Graphen richten,
  // nicht nach den Zoomgrenzen der Bedienoberflaeche.
  const viewport = getViewportForBounds(bounds, width, height, 0.05, 8, PADDING);
  return { width, height, viewport };
}

/**
 * @param nodes  Alle Nodes der Ebene (fuer die Bounding-Box).
 * @param format png = verlustfreie Rastergrafik, ueberall verwendbar.
 *               svg = skalierbar; html-to-image bettet die Node-Oberflaeche als
 *               foreignObject ein, das Bild rendert daher in Browsern und in
 *               Wikis korrekt, laesst sich aber nicht als Vektor nachbearbeiten.
 * @param scale  Faktor fuer PNG (2 = doppelte Aufloesung).
 */
export async function renderDiagram(
  nodes: Node[],
  format: ImageFormat,
  scale = 2
): Promise<string> {
  if (!nodes.length) throw new Error('Diese Ebene enthält keine Nodes.');
  const element = document.querySelector<HTMLElement>('.react-flow__viewport');
  if (!element) throw new Error('Die Canvas wurde nicht gefunden.');

  const effectiveScale = format === 'svg' ? 1 : scale;
  const { width, height, viewport } = frame(nodes, effectiveScale);

  const options = {
    backgroundColor: BACKGROUND,
    width,
    height,
    // Die Canvas selbst bleibt unveraendert; die Transformation gilt nur fuer
    // den Klon, den html-to-image anlegt.
    style: {
      width: `${width}px`,
      height: `${height}px`,
      transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
    },
    // Auswahlrahmen, Anfasser und Hilfslinien gehoeren nicht ins Dokument.
    filter: (node: HTMLElement) =>
      !node.classList?.contains('react-flow__handle') &&
      !node.classList?.contains('react-flow__resize-control'),
  };

  return format === 'png' ? toPng(element, options) : toSvg(element, options);
}
