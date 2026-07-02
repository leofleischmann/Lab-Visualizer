import { memo, useCallback, useMemo, useRef } from 'react';

import {

  BaseEdge,

  EdgeLabelRenderer,

  getSmoothStepPath,

  useReactFlow,

  type EdgeProps,

} from '@xyflow/react';

import clsx from 'clsx';

import type { EdgeRouting, FlowEdge, FlowPoint } from '../../api/types';

import { useFlowPointerDrag } from '../../hooks/useFlowPointerDrag';

import { kindOf } from '../../lib/catalog';

import {

  buildNodeBoxes,

  computeEdgeRoute,

  edgeBundleOffset,

  labelAlongPathOffset,

} from '../../lib/edgeRouting';

import {

  dragPathCorner,

  dragPathSegment,

  expandPathPoints,

  insertWaypointOnSegment,

  normalizeRouting,

  pathPointsToWaypoints,

  pointsToSegments,

  resolveLabelPosition,

  resolveManualGeometry,

  routeToWaypoints,

  segmentMidpoint,

  type ResolvedEdgeGeometry,

} from '../../lib/edgeRoutingState';

import { useGraphStore } from '../../store/graph';



function InfraEdgeComponent({

  id,

  source,

  target,

  sourceX,

  sourceY,

  targetX,

  targetY,

  sourcePosition,

  targetPosition,

  data,

  selected,

}: EdgeProps<FlowEdge>) {

  const catalog = useGraphStore((s) => s.catalog);

  const nodes = useGraphStore((s) => s.nodes);

  const edges = useGraphStore((s) => s.edges);

  const select = useGraphStore((s) => s.select);

  const updateEdgeRouting = useGraphStore((s) => s.updateEdgeRouting);

  const entity = data?.entity;

  const { startDrag, startDragAbsolute } = useFlowPointerDrag();

  const { screenToFlowPosition } = useReactFlow();

  const draftPointsRef = useRef<FlowPoint[] | null>(null);



  const routing = normalizeRouting(entity?.routing);

  const sourcePt = useMemo(() => ({ x: sourceX, y: sourceY }), [sourceX, sourceY]);

  const targetPt = useMemo(() => ({ x: targetX, y: targetY }), [targetX, targetY]);



  const exclude = useMemo(() => new Set([source, target]), [source, target]);

  const obstacles = useMemo(() => buildNodeBoxes(nodes, exclude), [nodes, exclude]);

  const bundleOffset = edgeBundleOffset(id, source, target, edges);



  const autoRoute = useMemo(

    () =>

      computeEdgeRoute(

        {

          sourceX,

          sourceY,

          targetX,

          targetY,

          sourcePosition,

          targetPosition,

          offset: bundleOffset,

        },

        obstacles

      ),

    [

      sourceX,

      sourceY,

      targetX,

      targetY,

      sourcePosition,

      targetPosition,

      bundleOffset,

      obstacles,

    ]

  );



  const geometry = useMemo((): ResolvedEdgeGeometry => {

    if (routing.mode === 'manual') {

      return resolveManualGeometry(sourcePt, targetPt, routing.waypoints);

    }

    const [path, labelX, labelY] = getSmoothStepPath(autoRoute);

    const waypoints = routeToWaypoints(autoRoute);

    const points = expandPathPoints(sourcePt, targetPt, waypoints);

    return {

      path,

      points,

      segments: pointsToSegments(points),

      labelX,

      labelY,

      mode: 'auto',

    };

  }, [routing, sourcePt, targetPt, autoRoute]);



  const alongT = labelAlongPathOffset(id, source, edges);

  const labelPos = useMemo(

    () => resolveLabelPosition(geometry, routing, alongT),

    [geometry, routing, alongT]

  );



  const applyPoints = useCallback(

    (points: FlowPoint[], label: FlowPoint | null | undefined, persist: boolean) => {

      const next: EdgeRouting = {

        mode: 'manual',

        waypoints: pathPointsToWaypoints(points),

        label: label ?? routing.label ?? null,

      };

      updateEdgeRouting(id, next, persist);

      console.log('[Debug InfraEdge]: Routing aktualisiert', { id, persist, waypoints: next.waypoints.length });

    },

    [id, routing.label, updateEdgeRouting]

  );



  const ensureManualPoints = useCallback((): FlowPoint[] => {

    if (draftPointsRef.current) return draftPointsRef.current.map((p) => ({ ...p }));

    draftPointsRef.current = geometry.points.map((p) => ({ ...p }));

    return draftPointsRef.current;

  }, [geometry.points]);



  const handleSegmentDrag = useCallback(

    (segmentIndex: number) => (event: React.PointerEvent) => {

      const snapshot = ensureManualPoints().map((p) => ({ ...p }));

      startDrag(event, {

        onMove: ({ x: dx, y: dy }) => {

          const moved = dragPathSegment(snapshot, segmentIndex, dx, dy);

          draftPointsRef.current = moved;

          applyPoints(moved, routing.label, false);

        },

        onEnd: () => {

          if (draftPointsRef.current) {

            applyPoints(draftPointsRef.current, routing.label, true);

          }

          draftPointsRef.current = null;

        },

      });

    },

    [applyPoints, ensureManualPoints, routing.label, startDrag]

  );



  const handleCornerDrag = useCallback(

    (cornerIndex: number) => (event: React.PointerEvent) => {

      const base = ensureManualPoints().map((p) => ({ ...p }));

      startDragAbsolute(event, {

        onMove: (pos) => {

          draftPointsRef.current = dragPathCorner(base, cornerIndex, pos.x, pos.y);

          applyPoints(draftPointsRef.current, routing.label, false);

        },

        onEnd: () => {

          if (draftPointsRef.current) {

            applyPoints(draftPointsRef.current, routing.label, true);

          }

          draftPointsRef.current = null;

        },

      });

    },

    [applyPoints, ensureManualPoints, routing.label, startDragAbsolute]

  );



  const handleSegmentDoubleClick = useCallback(

    (segmentIndex: number) => (event: React.MouseEvent) => {

      event.preventDefault();

      event.stopPropagation();

      const flowPos = screenToFlowPosition({ x: event.clientX, y: event.clientY });

      const base = geometry.points.map((p) => ({ ...p }));

      const next = insertWaypointOnSegment(base, segmentIndex, flowPos);

      applyPoints(next, routing.label, true);

    },

    [applyPoints, geometry.points, routing.label, screenToFlowPosition]

  );



  const handleLabelDrag = useCallback(

    (event: React.PointerEvent) => {

      event.stopPropagation();

      const baseRouting = normalizeRouting(entity?.routing);

      startDragAbsolute(event, {

        onMove: (pos) => {

          updateEdgeRouting(id, { ...baseRouting, label: pos }, false);

        },

        onEnd: () => {

          const current = useGraphStore.getState().edges.find((e) => e.id === id)?.data?.entity
            .routing;

          if (current) updateEdgeRouting(id, normalizeRouting(current), true);

        },

      });

    },

    [entity?.routing, id, startDragAbsolute, updateEdgeRouting]

  );



  if (!entity) return <BaseEdge id={id} path={geometry.path} />;



  const kind = kindOf(catalog, entity.kind);

  const dashArray =

    entity.animated || entity.lineStyle === 'dashed'

      ? '7 5'

      : entity.lineStyle === 'dotted'

        ? '2 5'

        : undefined;



  return (

    <>

      <BaseEdge

        id={id}

        path={geometry.path}

        style={{

          stroke: kind.color,

          strokeWidth: selected ? 2.5 : 1.5,

          strokeDasharray: dashArray,

          animation: entity.animated ? 'labviz-dash 0.7s linear infinite' : undefined,

          opacity: selected ? 1 : 0.82,

        }}

      />

      {selected && (

        <EdgeLabelRenderer>

          {geometry.segments.map(([a, b], index) => {

            const mid = segmentMidpoint(a, b);

            return (

              <div

                key={`seg-${index}`}

                className="nodrag nopan pointer-events-auto absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-sm border border-sky-400/80 bg-sky-500/30 active:cursor-grabbing"

                style={{ transform: `translate(-50%, -50%) translate(${mid.x}px, ${mid.y}px)`, zIndex: 7 }}

                title="Segment verschieben (Doppelklick: Eckpunkt einfügen)"

                onPointerDown={handleSegmentDrag(index)}

                onDoubleClick={handleSegmentDoubleClick(index)}

              />

            );

          })}

          {geometry.points.map((point, index) => {

            if (index === 0 || index === geometry.points.length - 1) return null;

            return (

              <div

                key={`corner-${index}`}

                className="nodrag nopan pointer-events-auto absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 cursor-move rounded-full border-2 border-amber-400 bg-amber-300/40"

                style={{ transform: `translate(-50%, -50%) translate(${point.x}px, ${point.y}px)`, zIndex: 8 }}

                title="Eckpunkt verschieben"

                onPointerDown={handleCornerDrag(index)}

              />

            );

          })}

        </EdgeLabelRenderer>

      )}

      {entity.label && (

        <EdgeLabelRenderer>

          <button

            type="button"

            onClick={() => select({ kind: 'edge', id })}

            onPointerDown={(event) => {

              if (event.button !== 0) return;

              handleLabelDrag(event);

            }}

            className={clsx(

              'nodrag nopan pointer-events-auto absolute max-w-[240px] cursor-grab rounded-md border px-2 py-1 text-[10px] leading-snug shadow-md shadow-black/40 active:cursor-grabbing',

              selected

                ? 'border-sky-400 bg-slate-950 text-sky-100'

                : 'border-slate-600 bg-slate-950/95 text-slate-300 hover:border-slate-500 hover:text-slate-100'

            )}

            style={{

              transform: `translate(-50%, -50%) translate(${labelPos.x}px, ${labelPos.y}px)`,

              zIndex: 6,

              whiteSpace: 'normal',

              textAlign: 'center',

            }}

            title="Label verschieben"

          >

            {entity.label}

          </button>

        </EdgeLabelRenderer>

      )}

    </>

  );

}



export const InfraEdge = memo(InfraEdgeComponent);


