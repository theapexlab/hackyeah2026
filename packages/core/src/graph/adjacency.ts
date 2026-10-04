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

/** Grid cell key; exact while |cell coordinates| < 2^20. */
const cellKey = (cx: number, cy: number): number => (cx + 1048576) * 2097152 + (cy + 1048576);

/**
 * Build the proximity graph. Two nodes are adjacent iff BOTH are alive and their
 * distance is at most min(rangeA, rangeB); the quality bucket is measured against
 * that smaller range.
 *
 * PRECONDITION: `nodes` is sorted ascending by id (the engine keeps `state.nodes`
 * sorted). The output is exactly that of an i<j double loop over this array: edges in
 * (i, j) order and neighbour lists in index order, with no further sort.
 *
 * Alive nodes are bucketed in square cells as wide as the median alive range; each node
 * looks only at the cells within its own range (an adjacent pair is closer than the
 * smaller range, so the lower-index node always finds the other). The pairs found are
 * sorted once by (i, j) to keep the double-loop order. Close to linear for spread-out
 * worlds instead of O(n^2).
 *
 * Pure: it does not write `node.neighbourIds`; the engine copies the lists it needs.
 */
export function buildAdjacency(nodes: readonly Node[]): Adjacency {
  const n = nodes.length;
  const neighbours = new Map<NodeId, NodeId[]>();
  const lists: NodeId[][] = new Array(n);
  const ranges: number[] = [];
  for (let i = 0; i < n; i++) {
    const node = nodes[i]!;
    const list: NodeId[] = [];
    neighbours.set(node.id, list);
    lists[i] = list;
    if (node.alive) ranges.push(node.range);
  }
  ranges.sort((p, q) => p - q);
  const cell = Math.max(1, ranges[ranges.length >> 1] ?? 1);

  const grid = new Map<number, number[]>();
  const cx = new Int32Array(n);
  const cy = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const node = nodes[i]!;
    if (!node.alive) continue;
    cx[i] = Math.floor(node.x / cell);
    cy[i] = Math.floor(node.y / cell);
    const key = cellKey(cx[i]!, cy[i]!);
    const bucket = grid.get(key);
    if (bucket === undefined) grid.set(key, [i]);
    else bucket.push(i);
  }

  // Pairs as i * n + j (i < j), so one numeric sort restores the double-loop order.
  const pairs: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = nodes[i]!;
    if (!a.alive) continue;
    const reach = Math.max(1, Math.ceil(a.range / cell));
    for (let dx = -reach; dx <= reach; dx++) {
      for (let dy = -reach; dy <= reach; dy++) {
        const bucket = grid.get(cellKey(cx[i]! + dx, cy[i]! + dy));
        if (bucket === undefined) continue;
        for (const j of bucket) {
          if (j <= i) continue;
          const b = nodes[j]!;
          const range = Math.min(a.range, b.range);
          if (dist2(a.x, a.y, b.x, b.y) <= range * range) pairs.push(i * n + j);
        }
      }
    }
  }
  pairs.sort((p, q) => p - q);

  const edges: EdgeView[] = [];
  for (const pair of pairs) {
    const i = Math.floor(pair / n);
    const j = pair - i * n;
    const a = nodes[i]!;
    const b = nodes[j]!;
    const range = Math.min(a.range, b.range);
    lists[i]!.push(b.id);
    lists[j]!.push(a.id);
    const quality = qualityBucket(Math.sqrt(dist2(a.x, a.y, b.x, b.y)), range);
    if (a.id < b.id) edges.push({ a: a.id, b: b.id, quality });
    else edges.push({ a: b.id, b: a.id, quality });
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
