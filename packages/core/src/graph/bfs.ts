/**
 * Breadth-first search for delivery eligibility metrics.
 * Used to compute how many nodes are eligible to receive each message.
 */

import type { NodeId } from '../domain/ids';
import type { Node } from '../domain/node';
import type { Adjacency } from './adjacency';

export function bfsDistance(
  start: NodeId,
  _nodes: Map<NodeId, Node>,
  adj: Adjacency,
  maxHops: number,
): Map<NodeId, number> {
  const dist = new Map<NodeId, number>();
  const queue = [{ nodeId: start, hops: 0 }];
  dist.set(start, 0);

  let qIdx = 0;
  while (qIdx < queue.length) {
    const { nodeId, hops } = queue[qIdx]!;
    qIdx++;

    if (hops >= maxHops) continue;

    const neighbours = adj.neighbours.get(nodeId);
    if (!neighbours) continue;

    for (const nbr of neighbours) {
      if (!dist.has(nbr)) {
        dist.set(nbr, hops + 1);
        queue.push({ nodeId: nbr, hops: hops + 1 });
      }
    }
  }

  return dist;
}

export function eligibleReceivers(
  start: NodeId,
  nodes: Map<NodeId, Node>,
  adj: Adjacency,
  maxHops: number,
): number {
  const dist = bfsDistance(start, nodes, adj, maxHops);
  let count = 0;
  for (const nodeId of dist.keys()) {
    const node = nodes.get(nodeId);
    if (node?.alive) {
      count++;
    }
  }
  return count;
}
