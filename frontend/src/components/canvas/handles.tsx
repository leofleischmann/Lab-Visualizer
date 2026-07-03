import { Handle, Position, useConnection } from '@xyflow/react';

const SIDES: { id: string; position: Position }[] = [
  { id: 'top', position: Position.Top },
  { id: 'right', position: Position.Right },
  { id: 'bottom', position: Position.Bottom },
  { id: 'left', position: Position.Left },
];

/**
 * Verbindungs-Handles an allen vier Seiten (dezente Punkte, sichtbar bei Hover).
 * Die Kanten-Geometrie ist davon unabhängig (floating Docking in InfraEdge) —
 * die Handles dienen nur zum Ziehen neuer Verbindungen.
 */
export function ConnectionHandles({ visible }: { visible: boolean }) {
  return (
    <>
      {SIDES.map(({ id, position }) => (
        <Handle
          key={id}
          id={id}
          type="source"
          position={position}
          className={
            '!h-2.5 !w-2.5 !rounded-full !border-2 !border-sky-300 !bg-slate-900 transition-opacity duration-100 ' +
            (visible ? '!opacity-100' : '!opacity-0 group-hover:!opacity-100')
          }
        />
      ))}
    </>
  );
}

/**
 * Unsichtbares Ziel über der ganzen Node-Fläche: nur aktiv, während eine
 * Verbindung gezogen wird — Loslassen irgendwo auf dem Node verbindet.
 */
export function ConnectionDropTarget() {
  const connection = useConnection();
  const active = connection.inProgress;
  return (
    <Handle
      id="drop"
      type="target"
      position={Position.Left}
      className={
        '!absolute !inset-0 !m-0 !h-full !w-full !transform-none !rounded-xl !border-0 ' +
        (active ? '!bg-sky-400/10' : '!bg-transparent')
      }
      style={{ pointerEvents: active ? 'all' : 'none', top: 0, left: 0 }}
      isConnectableStart={false}
    />
  );
}
