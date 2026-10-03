import type { NodeId } from '../domain/ids';
import type { Node } from '../domain/node';

/** Connected components of the alive subgraph. */
export interface Components {
  /** Component id per node; dead nodes get -1. Every node in the input has an entry. */
  readonly componentOf: Map<NodeId, number>;
  /** Number of alive nodes per component, indexed by component id. */
  readonly sizes: number[];
  /** Number of components (dead nodes are not counted). */
  readonly count: number;
  /** Ids of components containing at least one alive node with `hasBackhaul`. */
  readonly backhaulComponents: Set<number>;
}

/**
 * Label connected components by breadth-first search over `neighbours`.
 * Component ids are assigned in node id order, so the component of the
 * lowest-id alive node is 0 (deterministic across runs).
 *
 * PRECONDITION: `nodes` sorted ascending by id (same as buildAdjacency). Dead nodes
 * are skipped and never traversed, even if a neighbour list mentions them.
 */
export function connectedComponents(
  nodes: readonly Node[],
  neighbours: ReadonlyMap<NodeId, readonly NodeId[]>,
): Components {
  const byId = new Map<NodeId, Node>();
  for (const node of nodes) byId.set(node.id, node);

  const componentOf = new Map<NodeId, number>();
  const sizes: number[] = [];
  const backhaulComponents = new Set<number>();
  let count = 0;

  for (const node of nodes) {
    if (!node.alive) {
      componentOf.set(node.id, -1);
      continue;
    }
    if (componentOf.has(node.id)) continue;

    const id = count++;
    let size = 0;
    const queue: NodeId[] = [node.id];
    componentOf.set(node.id, id);
    for (let head = 0; head < queue.length; head++) {
      const current = queue[head];
      if (current === undefined) break;
      const n = byId.get(current);
      if (n === undefined) continue;
      size++;
      if (n.hasBackhaul) backhaulComponents.add(id);
      const adj = neighbours.get(current);
      if (adj === undefined) continue;
      for (const next of adj) {
        if (componentOf.has(next)) continue;
        const nextNode = byId.get(next);
        if (nextNode === undefined || !nextNode.alive) continue;
        componentOf.set(next, id);
        queue.push(next);
      }
    }
    sizes.push(size);
  }

  return { componentOf, sizes, count, backhaulComponents };
}
