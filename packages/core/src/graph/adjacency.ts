/**
 * Adjacency graph: edges and neighbor lists.
 * Tracks when the graph structure changes so UI can avoid re-renders.
 */

import type { NodeId } from '../domain/ids';
import type { Node } from '../domain/node';
import { distance } from './distance';

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

export function buildAdjacency(nodes: Map<NodeId, Node>): Adjacency {
  const edges: EdgeView[] = [];
  const neighbours = new Map<NodeId, NodeId[]>();

  // Initialize all nodes' neighbor lists
  for (const node of nodes.values()) {
    neighbours.set(node.id, []);
  }

  // Build edges between all pairs of alive nodes
  const nodeArray = Array.from(nodes.values());
  for (let i = 0; i < nodeArray.length; i++) {
    for (let j = i + 1; j < nodeArray.length; j++) {
      const a = nodeArray[i]!;
      const b = nodeArray[j]!;

      // Both nodes must be alive
      if (!a.alive || !b.alive) continue;

      const dist = distance(a.x, a.y, b.x, b.y);
      const maxRange = Math.min(a.range, b.range);

      // Must be within range
      if (dist > maxRange) continue;

      // Determine quality
      const frac = dist / maxRange;
      const qual: 'near' | 'medium' | 'far' =
        frac < 0.333 ? 'near' : frac < 0.667 ? 'medium' : 'far';

      // Canonical edge: smaller id first
      const edgeA = a.id < b.id ? a.id : b.id;
      const edgeB = a.id < b.id ? b.id : a.id;
      edges.push({ a: edgeA, b: edgeB, quality: qual });

      // Add to neighbor lists (both directions)
      neighbours.get(a.id)!.push(b.id);
      neighbours.get(b.id)!.push(a.id);
    }
  }

  // Sort neighbor lists by id for determinism
  for (const nbrs of neighbours.values()) {
    nbrs.sort();
  }

  // Sort edges for determinism
  edges.sort((x, y) => {
    const cmp = x.a.localeCompare(y.a);
    return cmp !== 0 ? cmp : x.b.localeCompare(y.b);
  });

  return { edges, neighbours, version: 0 };
}
