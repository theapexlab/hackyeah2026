/**
 * Connected components over alive nodes.
 * Also tracks which components touch a node with backhaul (reachable from the Authority).
 */

import type { NodeId } from '../domain/ids';
import type { Node } from '../domain/node';
import type { Adjacency } from './adjacency';

export interface ComponentMap {
  /** Dead nodes are absent (-1 in views). */
  nodeToComponent: Map<NodeId, number>;
  componentCount: number;
  componentSizes: number[];
  authorityReachableComponentIds: Set<number>;
}

export function findComponents(nodes: Map<NodeId, Node>, adj: Adjacency): ComponentMap {
  const nodeToComponent = new Map<NodeId, number>();
  const componentSizes: number[] = [];
  const authorityReachableComponentIds = new Set<number>();
  const ordered = Array.from(nodes.values()).sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );

  for (const start of ordered) {
    if (!start.alive || nodeToComponent.has(start.id)) continue;

    const componentId = componentSizes.length;
    const queue: NodeId[] = [start.id];
    nodeToComponent.set(start.id, componentId);
    let size = 0;
    for (let head = 0; head < queue.length; head++) {
      const current = queue[head]!;
      size++;
      if (nodes.get(current)?.hasBackhaul) authorityReachableComponentIds.add(componentId);
      for (const nbr of adj.neighbours.get(current) ?? []) {
        if (!nodeToComponent.has(nbr)) {
          nodeToComponent.set(nbr, componentId);
          queue.push(nbr);
        }
      }
    }
    componentSizes.push(size);
  }

  return {
    nodeToComponent,
    componentCount: componentSizes.length,
    componentSizes,
    authorityReachableComponentIds,
  };
}
