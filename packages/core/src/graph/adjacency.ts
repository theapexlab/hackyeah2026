import type { NodeId } from '../domain/ids';
import type { Node } from '../domain/node';
import type { EdgeView } from '../domain/snapshot';
import { dist2, qualityBucket } from './distance';

/** Radio adjacency of the whole world at one instant. */
export interface Adjacency {
  /**
   * Neighbour ids per node, sorted ascending by id. Every node in the input has an
   * entry; dead nodes map to an empty array.
   */
  readonly neighbours: Map<NodeId, NodeId[]>;
  /** Undirected edges with a < b, sorted by (a, b). */
  readonly edges: EdgeView[];
}

/**
 * Build the proximity graph. Two nodes are adjacent iff BOTH are alive and their
 * distance is at most min(rangeA, rangeB); the quality bucket is measured against
 * that smaller range.
 *
 * PRECONDITION: `nodes` is sorted ascending by id (the engine keeps `state.nodes`
 * sorted; ids are zero-padded so lexical order is creation order). The sorted-output
 * guarantees above rely on it: the i<j double loop then emits edges and neighbour
 * lists already in order, with no extra sort. O(n^2); fine up to a few thousand nodes.
 *
 * Pure: it does not write `node.neighbourIds`; the engine copies the lists it needs.
 */
export function buildAdjacency(nodes: readonly Node[]): Adjacency {
  const neighbours = new Map<NodeId, NodeId[]>();
  const edges: EdgeView[] = [];
  for (const node of nodes) neighbours.set(node.id, []);

  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    if (a === undefined || !a.alive) continue;
    const listA = neighbours.get(a.id);
    if (listA === undefined) continue;
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      if (b === undefined || !b.alive) continue;
      const range = Math.min(a.range, b.range);
      const d2 = dist2(a.x, a.y, b.x, b.y);
      if (d2 > range * range) continue;
      const listB = neighbours.get(b.id);
      if (listB === undefined) continue;
      listA.push(b.id);
      listB.push(a.id);
      const quality = qualityBucket(Math.sqrt(d2), range);
      if (a.id < b.id) edges.push({ a: a.id, b: b.id, quality });
      else edges.push({ a: b.id, b: a.id, quality });
    }
  }
  return { neighbours, edges };
}

/**
 * True when two edge lists are identical (same endpoints and quality in the same
 * order). The engine bumps `adjacency.version` only when this returns false, so the
 * snapshot's `edges` array keeps its reference across unchanged ticks.
 */
export function edgesEqual(prev: readonly EdgeView[], next: readonly EdgeView[]): boolean {
  if (prev === next) return true;
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i++) {
    const p = prev[i];
    const n = next[i];
    if (p === undefined || n === undefined) return false;
    if (p.a !== n.a || p.b !== n.b || p.quality !== n.quality) return false;
  }
  return true;
}
