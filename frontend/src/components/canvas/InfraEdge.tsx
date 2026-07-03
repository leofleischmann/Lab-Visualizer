import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BaseEdge,
  EdgeLabelRenderer,
  useInternalNode,
  useReactFlow,
  useStore,
  type EdgeProps,
} from '@xyflow/react';
import clsx from 'clsx';
import type { EdgeRouting, FlowEdge, FlowPoint } from '../../api/types';
import { usePointerDrag } from '../../hooks/useFlowPointerDrag';
import { kindOf } from '../../lib/catalog';
import {
  distance,
  inflate,
  pointInRect,
  projectOntoPath,
  segmentAxis,
  simplifyPath,
  type Rect,
} from '../../lib/edge/geometry';
import {
  beginSegmentDrag,
  insertBendpoint,
  moveBendpoint,
  moveSegment,
  removeBendpoint,
  repairManualPath,
  waypointsFromPath,
  type SegmentDragSession,
} from '../../lib/edge/manual';
import { chooseSides } from '../../lib/edge/dock';
import { useEdgeHitLayer } from './EdgeHitLayer';
import { buildObstacles, NODE_H, NODE_W } from '../../lib/edge/nodes';
import { routeOrthogonal } from '../../lib/edge/orthogonal';
import { roundedPath } from '../../lib/edge/path';
import { portShift } from '../../lib/edge/ports';
import {
  defaultLabelT,
  labelPosition,
  labelTFromPointer,
  normalizeRouting,
} from '../../lib/edge/routing';
import { useGraphStore } from '../../store/graph';

/** Kleines Dreieck als Pfeilspitze am Zielpunkt der Kante. */
function arrowHead(points: FlowPoint[]): string | null {
  if (points.length < 2) return null;
  const b = points[points.length - 1];
  let a = points[points.length - 2];
  // Bei Mini-Segmenten den davorliegenden Punkt nehmen (stabile Richtung)
  if (distance(a, b) < 2 && points.length >= 3) a = points[points.length - 3];
  const len = distance(a, b);
  if (len < 0.5) return null;
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const size = 9;
  const half = 4;
  const bx = b.x - ux * size;
  const by = b.y - uy * size;
  return `${b.x},${b.y} ${bx - uy * half},${by + ux * half} ${bx + uy * half},${by - ux * half}`;
}

/**
 * Nach dem Drag: Pfad glätten und Waypoints entfernen, die im Inneren der
 * End-Nodes liegen (Punkte AUF der Node-Kante sind legitime Dock-Anker).
 */
function cleanupPath(points: FlowPoint[], source: Rect | null, target: Rect | null): FlowPoint[] {
  const simplified = simplifyPath(points, 2.5);
  if (!source || !target || simplified.length <= 2) return simplified;
  const sourceBox = inflate(source, -2);
  const targetBox = inflate(target, -2);
  const interior = simplified
    .slice(1, -1)
    .filter((p) => !pointInRect(p, sourceBox) && !pointInRect(p, targetBox));
  return [simplified[0], ...interior, simplified[simplified.length - 1]];
}

const SEGMENT_CURSOR: Record<'h' | 'v' | 'd', string> = {
  h: 'ns-resize',
  v: 'ew-resize',
  d: 'move',
};

/** Ab dieser Zoomstufe werden Kanten-Labels eingeblendet (semantisches Zoomen). */
const LABEL_ZOOM_MIN = 0.5;

type InternalNode = ReturnType<typeof useInternalNode>;

/** Absolutes Rechteck aus einem React-Flow-Internalnode (gemessene Größe). */
function internalRect(node: InternalNode): Rect | null {
  if (!node) return null;
  const pos = node.internals.positionAbsolute;
  return {
    x: pos.x,
    y: pos.y,
    width: node.measured?.width ?? node.width ?? NODE_W,
    height: node.measured?.height ?? node.height ?? NODE_H,
  };
}

/** Stabiler Schlüssel eines Rects für useMemo-Dependencies. */
function rectKey(rect: Rect | null): string {
  return rect ? `${rect.x},${rect.y},${rect.width},${rect.height}` : '';
}

function InfraEdgeComponent({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  selected,
}: EdgeProps<FlowEdge>) {
  const catalog = useGraphStore((s) => s.catalog);
  const edges = useGraphStore((s) => s.edges);
  const select = useGraphStore((s) => s.select);
  const updateEdgeRouting = useGraphStore((s) => s.updateEdgeRouting);
  // Fokus-Modus: booleans statt des ganzen Sets → re-rendert nur bei Statuswechsel
  const dimmed = useGraphStore((s) => (s.focus ? !s.focus.edgeIds.has(id) : false));
  const highlighted = useGraphStore((s) => (s.focus ? s.focus.edgeIds.has(id) : false));
  // Bumpt beim Loslassen eines Nodes / Zonen-Resize → einmaliger Full-Reroute,
  // damit auch Kanten ohne bewegte Endknoten um verschobene Nodes fließen.
  const geometryVersion = useGraphStore((s) => s.geometryVersion);
  // Semantisches Zoomen: Labels erst ab LABEL_ZOOM_MIN einblenden (weniger Clutter)
  const labelsVisibleAtZoom = useStore((s) => s.transform[2] >= LABEL_ZOOM_MIN);
  const { startPointerDrag } = usePointerDrag();
  const { screenToFlowPosition } = useReactFlow();
  const hitLayer = useEdgeHitLayer();

  const entity = data?.entity;
  const routing = normalizeRouting(entity?.routing);

  // Reaktiv nur an den EIGENEN Endknoten koppeln: bewegt sich ein anderer Node,
  // rendert diese Kante nicht neu (entscheidend für 50+ Nodes). Hindernisse werden
  // als Snapshot gelesen und beim Ziehen der Endknoten neu ausgewertet.
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const sourceRect = internalRect(sourceNode);
  const targetRect = internalRect(targetNode);
  const sKey = rectKey(sourceRect);
  const tKey = rectKey(targetRect);

  const points = useMemo((): FlowPoint[] => {
    if (!sourceRect || !targetRect) {
      return [
        { x: sourceX, y: sourceY },
        { x: targetX, y: targetY },
      ];
    }
    const nodes = useGraphStore.getState().nodes;
    const r = normalizeRouting(entity?.routing);
    if (r.mode === 'manual' && r.waypoints.length) {
      return repairManualPath(sourceRect, targetRect, r.waypoints);
    }
    const sides = chooseSides(sourceRect, targetRect);
    return routeOrthogonal({
      source: sourceRect,
      target: targetRect,
      obstacles: buildObstacles(nodes, new Set([source, target])),
      sourceShift: portShift(id, source, sides.source, edges, nodes),
      targetShift: portShift(id, target, sides.target, edges, nodes),
    });
    // sKey/tKey stehen stellvertretend für sourceRect/targetRect (Positionsänderung),
    // geometryVersion erzwingt den Full-Reroute nach einem Drop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    sKey,
    tKey,
    edges,
    id,
    source,
    target,
    sourceX,
    sourceY,
    targetX,
    targetY,
    entity?.routing,
    geometryVersion,
  ]);

  // Für Callbacks, die während eines Drags die aktuelle Geometrie brauchen
  const pointsRef = useRef(points);
  pointsRef.current = points;

  const path = useMemo(() => roundedPath(points, 8), [points]);
  const arrow = useMemo(() => arrowHead(points), [points]);
  const fallbackT = defaultLabelT(id, source, target, edges);
  const labelPos = useMemo(
    () => labelPosition(points, routing, fallbackT),
    [points, routing, fallbackT]
  );

  const currentRouting = useCallback((): EdgeRouting => {
    const stored = useGraphStore.getState().edges.find((e) => e.id === id)?.data?.entity.routing;
    return normalizeRouting(stored);
  }, [id]);

  const applyPath = useCallback(
    (nextPoints: FlowPoint[], persist: boolean) => {
      const waypoints = waypointsFromPath(nextPoints);
      const next: EdgeRouting = {
        mode: waypoints.length ? 'manual' : 'auto',
        waypoints,
        labelT: currentRouting().labelT,
      };
      void updateEdgeRouting(id, next, persist);
    },
    [currentRouting, id, updateEdgeRouting]
  );

  const finalizePath = useCallback(
    (nextPoints: FlowPoint[] | null) => {
      if (!nextPoints) return;
      applyPath(cleanupPath(nextPoints, sourceRect, targetRect), true);
    },
    [applyPath, sourceRect, targetRect]
  );

  const draftRef = useRef<FlowPoint[] | null>(null);
  const sessionRef = useRef<SegmentDragSession | null>(null);
  const [hovered, setHovered] = useState(false);

  // preventDefault auf pointerdown unterdrückt native dblclick-Events,
  // deshalb eigene Doppelklick-Erkennung über Zeit + Distanz.
  const lastDownRef = useRef<{ time: number; x: number; y: number; key: string } | null>(null);
  const isDoubleTap = useCallback((event: React.PointerEvent, key: string): boolean => {
    const prev = lastDownRef.current;
    const now = performance.now();
    lastDownRef.current = { time: now, x: event.clientX, y: event.clientY, key };
    return (
      !!prev &&
      prev.key === key &&
      now - prev.time < 400 &&
      Math.hypot(event.clientX - prev.x, event.clientY - prev.y) < 6
    );
  }, []);

  /**
   * Linie überall greifen: Klick = auswählen, Ziehen = Segment verschieben,
   * Doppelklick = Eckpunkt einfügen.
   */
  const handleLinePointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (event.button !== 0) return;
      if (isDoubleTap(event, 'line')) {
        event.preventDefault();
        event.stopPropagation();
        const pos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        const { points: next } = insertBendpoint(pointsRef.current, pos);
        applyPath(next, true);
        return;
      }
      draftRef.current = null;
      sessionRef.current = null;
      startPointerDrag(event, {
        threshold: 4,
        onStart: (pos) => {
          const segmentIndex = projectOntoPath(pointsRef.current, pos).segmentIndex;
          sessionRef.current = beginSegmentDrag(pointsRef.current, segmentIndex);
          select({ kind: 'edge', id });
        },
        onMove: (_pos, delta) => {
          if (!sessionRef.current) return;
          draftRef.current = moveSegment(sessionRef.current, delta);
          applyPath(draftRef.current, false);
        },
        onEnd: ({ moved }) => {
          if (!moved) {
            select({ kind: 'edge', id });
            return;
          }
          finalizePath(draftRef.current);
          draftRef.current = null;
          sessionRef.current = null;
        },
      });
    },
    [applyPath, finalizePath, id, isDoubleTap, screenToFlowPosition, select, startPointerDrag]
  );

  const handleSegmentPointerDown = useCallback(
    (segmentIndex: number) => (event: React.PointerEvent) => {
      if (event.button !== 0) return;
      sessionRef.current = beginSegmentDrag(pointsRef.current, segmentIndex);
      draftRef.current = null;
      startPointerDrag(event, {
        onMove: (_pos, delta) => {
          if (!sessionRef.current) return;
          draftRef.current = moveSegment(sessionRef.current, delta);
          applyPath(draftRef.current, false);
        },
        onEnd: () => {
          finalizePath(draftRef.current);
          draftRef.current = null;
          sessionRef.current = null;
        },
      });
    },
    [applyPath, finalizePath, startPointerDrag]
  );

  const handleBendpointPointerDown = useCallback(
    (index: number) => (event: React.PointerEvent) => {
      if (event.button !== 0) return;
      if (isDoubleTap(event, `bend-${index}`)) {
        event.preventDefault();
        event.stopPropagation();
        finalizePath(removeBendpoint(pointsRef.current, index));
        return;
      }
      const base = pointsRef.current.map((p) => ({ ...p }));
      draftRef.current = null;
      startPointerDrag(event, {
        onMove: (pos) => {
          draftRef.current = moveBendpoint(base, index, pos);
          applyPath(draftRef.current, false);
        },
        onEnd: () => {
          finalizePath(draftRef.current);
          draftRef.current = null;
        },
      });
    },
    [applyPath, finalizePath, isDoubleTap, startPointerDrag]
  );

  /** Label bleibt beim Ziehen auf der Linie (Projektion auf den Pfad). */
  const handleLabelPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (event.button !== 0) return;
      startPointerDrag(event, {
        threshold: 3,
        onMove: (pos) => {
          const next: EdgeRouting = {
            ...currentRouting(),
            labelT: labelTFromPointer(pointsRef.current, pos),
          };
          void updateEdgeRouting(id, next, false);
        },
        onEnd: ({ moved }) => {
          if (!moved) {
            select({ kind: 'edge', id });
            return;
          }
          void updateEdgeRouting(id, currentRouting(), true);
        },
      });
    },
    [currentRouting, id, select, startPointerDrag, updateEdgeRouting]
  );

  if (!entity) return <BaseEdge id={id} path={path} />;

  const kind = kindOf(catalog, entity.kind);
  const dashArray =
    entity.animated || entity.lineStyle === 'dashed'
      ? '7 5'
      : entity.lineStyle === 'dotted'
        ? '2 5'
        : undefined;

  const segments: [FlowPoint, FlowPoint][] = [];
  for (let i = 0; i < points.length - 1; i++) segments.push([points[i], points[i + 1]]);

  const active = selected || highlighted || hovered;
  const strokeOpacity = active ? 1 : dimmed ? 0.12 : 0.85;
  const strokeWidth = selected ? 2.6 : highlighted || hovered ? 2.2 : 1.6;
  // Label sichtbar, wenn hineingezoomt, betont oder direkt interagiert;
  // gedimmte Kanten (Fokus aktiv, aber nicht verbunden) blenden Labels aus.
  const showLabel = !!entity.label && !dimmed && (labelsVisibleAtZoom || active);

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: kind.color,
          strokeWidth,
          strokeDasharray: dashArray,
          animation: entity.animated ? 'labviz-dash 0.7s linear infinite' : undefined,
          opacity: strokeOpacity,
          transition: 'stroke-width 80ms, opacity 120ms',
        }}
      />
      {arrow && (
        <polygon points={arrow} fill={kind.color} opacity={strokeOpacity} />
      )}
      {/*
        Unsichtbare, breite Trefferfläche: per Portal in die gemeinsame Hit-Layer-
        SVG (über den Nodes) gerendert → Linien auch über Zonen greifbar, aber nur
        EIN <svg> für alle Kanten statt eines pro Kante (weniger DOM/Paint beim Zoom).
      */}
      {hitLayer &&
        createPortal(
          <path
            d={path}
            fill="none"
            stroke="transparent"
            strokeWidth={14}
            className="nodrag nopan"
            style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
            onPointerDown={handleLinePointerDown}
            onPointerEnter={() => setHovered(true)}
            onPointerLeave={() => setHovered(false)}
          />,
          hitLayer
        )}
      {selected && (
        <EdgeLabelRenderer>
          {segments.map(([a, b], index) => {
            const len = distance(a, b);
            if (len < 26) return null;
            const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            const axis = segmentAxis(a, b);
            return (
              <div
                key={`seg-${index}`}
                className={clsx(
                  'nodrag nopan pointer-events-auto absolute rounded-sm border border-sky-300 bg-sky-500/70 shadow-sm shadow-black/50',
                  axis === 'h' ? 'h-2 w-4' : axis === 'v' ? 'h-4 w-2' : 'h-3 w-3'
                )}
                style={{
                  transform: `translate(-50%, -50%) translate(${mid.x}px, ${mid.y}px)`,
                  cursor: SEGMENT_CURSOR[axis],
                  zIndex: 11,
                }}
                title="Segment verschieben"
                onPointerDown={handleSegmentPointerDown(index)}
              />
            );
          })}
          {points.map((point, index) => {
            if (index === 0 || index === points.length - 1) return null;
            return (
              <div
                key={`bend-${index}`}
                className="nodrag nopan pointer-events-auto absolute h-3 w-3 rounded-full border-2 border-sky-300 bg-slate-950 hover:bg-sky-500/60"
                style={{
                  transform: `translate(-50%, -50%) translate(${point.x}px, ${point.y}px)`,
                  cursor: 'move',
                  zIndex: 12,
                }}
                title="Eckpunkt verschieben (Doppelklick: entfernen)"
                onPointerDown={handleBendpointPointerDown(index)}
              />
            );
          })}
        </EdgeLabelRenderer>
      )}
      {showLabel && (
        <EdgeLabelRenderer>
          <div
            className={clsx(
              'nodrag nopan pointer-events-auto absolute max-w-[220px] cursor-grab select-none rounded border px-1.5 py-0.5 text-center text-[10px] leading-snug active:cursor-grabbing',
              selected || highlighted
                ? 'border-sky-400 bg-slate-950 text-sky-100'
                : 'border-slate-700/80 bg-slate-950/90 text-slate-300 hover:border-slate-500 hover:text-slate-100'
            )}
            style={{
              transform: `translate(-50%, -50%) translate(${labelPos.x}px, ${labelPos.y}px)`,
              zIndex: 10,
            }}
            title="Label entlang der Linie verschieben"
            onPointerDown={handleLabelPointerDown}
          >
            {entity.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const InfraEdge = memo(InfraEdgeComponent);
