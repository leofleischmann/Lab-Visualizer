import { Handle, Position, useConnection } from '@xyflow/react';
import { useGraphStore } from '../../store/graph';

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
  // In der Leseansicht eines Freigabelinks lassen sich keine Verbindungen
  // ziehen — dann sind die Punkte nur irreführend.
  //
  // WICHTIG: die Handles duerfen dafuer NICHT entfernt werden. React Flow loest
  // die Endpunkte einer Kante ueber die `handleBounds` der Endknoten auf; ohne
  // ein einziges Handle findet es keinen Ankerpunkt und zeichnet die Kante gar
  // nicht — in der Leseansicht fehlten dadurch saemtliche Verbindungen. Sie
  // werden deshalb unsichtbar und nicht bedienbar gerendert statt weggelassen.
  const readOnly = useGraphStore((s) => s.readOnly);
  return (
    <>
      {SIDES.map(({ id, position }) => (
        <Handle
          key={id}
          id={id}
          type="source"
          position={position}
          isConnectable={!readOnly}
          className={
            '!h-2.5 !w-2.5 !rounded-full !border-2 !border-sky-300 !bg-slate-900 transition-opacity duration-100 ' +
            (readOnly
              ? '!pointer-events-none !opacity-0'
              : visible
                ? '!opacity-100'
                : '!opacity-0 group-hover:!opacity-100')
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
