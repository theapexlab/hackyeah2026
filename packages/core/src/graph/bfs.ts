import type { NodeId } from '../domain/ids';

/**
 * Breadth-first search from `start`, limited to `maxHops` hops (Infinity = unbounded).
 * Returns hop distance per reached node; `start` maps to 0. Nodes missing from
 * `neighbours` are treated as having no neighbours. Visiting order is the
 * neighbour-list order, so with sorted lists the result is deterministic.
 */
export function boundedBfs(
  start: NodeId,
  neighbours: ReadonlyMap<NodeId, readonly NodeId[]>,
  maxHops: number,
): Map<NodeId, number> {
  const hops = new Map<NodeId, number>();
  hops.set(start, 0);
  if (maxHops <= 0) return hops;
  const queue: NodeId[] = [start];
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head];
    if (current === undefined) break;
    const depth = hops.get(current) ?? 0;
    if (depth >= maxHops) continue;
    const adj = neighbours.get(current);
    if (adj === undefined) continue;
    for (const next of adj) {
      if (hops.has(next)) continue;
      hops.set(next, depth + 1);
      queue.push(next);
    }
  }
  return hops;
}
