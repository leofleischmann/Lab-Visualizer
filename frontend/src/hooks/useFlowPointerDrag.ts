import { useCallback, useRef } from 'react';
import { useReactFlow } from '@xyflow/react';
import type { FlowPoint } from '../api/types';

/** Pointer-Drag in Flow-Koordinaten (nodrag/nopan Elemente). */
export function useFlowPointerDrag() {
  const { screenToFlowPosition } = useReactFlow();
  const cleanupRef = useRef<(() => void) | null>(null);

  const cleanup = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
  }, []);

  const startDrag = useCallback(
    (
      event: React.PointerEvent,
      handlers: { onMove: (delta: FlowPoint) => void; onEnd: () => void }
    ) => {
      event.preventDefault();
      event.stopPropagation();
      cleanup();
      const start = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const onMove = (ev: PointerEvent) => {
        const pos = screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
        handlers.onMove({ x: pos.x - start.x, y: pos.y - start.y });
      };
      const onUp = () => {
        handlers.onEnd();
        cleanup();
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

  const startDragAbsolute = useCallback(
    (
      event: React.PointerEvent,
      handlers: { onMove: (pos: FlowPoint) => void; onEnd: () => void }
    ) => {
      event.preventDefault();
      event.stopPropagation();
      cleanup();
      const onMove = (ev: PointerEvent) => {
        handlers.onMove(screenToFlowPosition({ x: ev.clientX, y: ev.clientY }));
      };
      const onUp = () => {
        handlers.onEnd();
        cleanup();
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

  return { startDrag, startDragAbsolute };
}
