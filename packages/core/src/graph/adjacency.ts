/**
 * Adjacency graph: edges and neighbor lists.
 * `version` only bumps when the edge set (or an edge's quality bucket) actually changes,
 * so the snapshot can keep a stable `edges` reference across ticks.
 */

import type { NodeId } from '../domain/ids';
import type { Node } from '../domain/node';
import { distance, quality } from './distance';

export interface EdgeView {
  a: NodeId;
  b: NodeId;
  quality: 'near' | 'medium' | 'far';
}

export interface Adjacency {
  edges: EdgeView[];
  neighbours: Map<NodeId, NodeId[]>;
  version: number;
}

const byId = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);

const sameEdges = (x: EdgeView[], y: EdgeView[]) =>
  x.length === y.length &&
  x.every((e, i) => e.a === y[i]!.a && e.b === y[i]!.b && e.quality === y[i]!.quality);

/**
 * Build adjacency over `nodes` (iterated in id order). When `previous` has an identical edge
 * set it is returned unchanged (same reference, same version); otherwise version = previous + 1.
 */
export function buildAdjacency(nodes: Map<NodeId, Node>, previous?: Adjacency): Adjacency {
  const sorted = Array.from(nodes.values()).sort((a, b) => byId(a.id, b.id));
  const edges: EdgeView[] = [];
  const neighbours = new Map<NodeId, NodeId[]>(sorted.map((n) => [n.id, []]));

  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i]!;
    if (!a.alive) continue;
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j]!;
      if (!b.alive) continue;
      const dist = distance(a.x, a.y, b.x, b.y);
      const maxRange = Math.min(a.range, b.range);
      if (dist > maxRange) continue;
      edges.push({ a: a.id, b: b.id, quality: quality(dist, maxRange) });
      neighbours.get(a.id)!.push(b.id);
      neighbours.get(b.id)!.push(a.id);
    }
  }

  // sorted iteration order already yields sorted edges; neighbour lists need one pass
  for (const list of neighbours.values()) list.sort(byId);

  if (previous && sameEdges(previous.edges, edges)) return previous;
  return { edges, neighbours, version: (previous?.version ?? 0) + 1 };
}
