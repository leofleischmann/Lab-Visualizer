import { useCallback, useEffect, useRef } from 'react';
import { useReactFlow } from '@xyflow/react';
import type { FlowPoint } from '../api/types';

export type PointerDragHandlers = {
  /** Mindestbewegung in Screen-Pixeln, bevor der Drag startet (0 = sofort) */
  threshold?: number;
  /** Wird einmal aufgerufen, sobald der Threshold überschritten ist */
  onStart?: (pos: FlowPoint) => void;
  /** Position und kumuliertes Delta in Flow-Koordinaten */
  onMove?: (pos: FlowPoint, delta: FlowPoint) => void;
  /** moved=false → war nur ein Klick (Threshold nie überschritten) */
  onEnd?: (info: { moved: boolean }) => void;
};

/**
 * Pointer-Drag in Flow-Koordinaten mit Klick-Erkennung (Threshold).
 * Für nodrag/nopan-Elemente in Edges/Overlays.
 */
export function usePointerDrag() {
  const { screenToFlowPosition } = useReactFlow();
  const cleanupRef = useRef<(() => void) | null>(null);

  const cleanup = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const startPointerDrag = useCallback(
    (event: React.PointerEvent, handlers: PointerDragHandlers) => {
      event.preventDefault();
      event.stopPropagation();
      cleanup();

      const threshold = handlers.threshold ?? 0;
      const startScreen = { x: event.clientX, y: event.clientY };
      const startFlow = screenToFlowPosition(startScreen);
      let started = threshold <= 0;
      if (started) handlers.onStart?.(startFlow);

      const onMove = (ev: PointerEvent) => {
        if (!started) {
          const dist = Math.hypot(ev.clientX - startScreen.x, ev.clientY - startScreen.y);
          if (dist < threshold) return;
          started = true;
          handlers.onStart?.(startFlow);
        }
        const pos = screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
        handlers.onMove?.(pos, { x: pos.x - startFlow.x, y: pos.y - startFlow.y });
      };
      const onUp = () => {
        cleanup();
        handlers.onEnd?.({ moved: started });
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      cleanupRef.current = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
    },
    [cleanup, screenToFlowPosition]
  );

  return { startPointerDrag };
}
