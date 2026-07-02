/**
 * Node-Geometrie für das Kanten-Routing: absolute Rechtecke aus dem Store
 * (gemessene Größen von React Flow, Fallback auf Standardmaße).
 * Beeinflusst: InfraEdge.tsx, lib/alignment.ts
 */
import type { FlowNode } from '../../api/types';
import { absolutePosition } from '../../store/graph';
import type { Rect } from './geometry';

/** Standardmaße eines InfraNode (w-[230px], Höhe je nach Inhalt) */
export const NODE_W = 230;
export const NODE_H = 64;

export function nodeSize(node: FlowNode): { width: number; height: number } {
  return {
    width: node.measured?.width ?? node.width ?? NODE_W,
    height: node.measured?.height ?? node.height ?? NODE_H,
  };
}

export function nodeRect(nodes: FlowNode[], id: string): Rect | null {
  const node = nodes.find((n) => n.id === id);
  if (!node) return null;
  const abs = absolutePosition(nodes, id);
  const { width, height } = nodeSize(node);
  return { x: abs.x, y: abs.y, width, height };
}

/** Hindernisse für den Auto-Router: alle Nicht-Zonen-Nodes außer Quelle/Ziel. */
export function buildObstacles(nodes: FlowNode[], exclude: Set<string>): Rect[] {
  const result: Rect[] = [];
  for (const node of nodes) {
    if (node.type === 'zone' || exclude.has(node.id)) continue;
    const rect = nodeRect(nodes, node.id);
    if (rect) result.push(rect);
  }
  return result;
}
