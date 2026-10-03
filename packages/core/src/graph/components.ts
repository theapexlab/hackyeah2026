/**
 * Connected components: find network partitions.
 * Also tracks which component is reachable from the authority.
 */

import type { NodeId } from '../domain/ids';
import type { Node } from '../domain/node';
import type { Adjacency } from './adjacency';

export interface ComponentMap {
  nodeToComponent: Map<NodeId, number>;
  componentCount: number;
  authorityReachableComponentId: number | null;
}

export function findComponents(nodes: Map<NodeId, Node>, adj: Adjacency): ComponentMap {
  const nodeToComponent = new Map<NodeId, number>();
  let componentId = 0;
  const visited = new Set<NodeId>();

  // Find all connected components
  for (const nodeId of nodes.keys()) {
    if (visited.has(nodeId)) continue;

    // BFS to find component
    const queue = [nodeId];
    visited.add(nodeId);
    const component: NodeId[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);
      nodeToComponent.set(current, componentId);

      const neighbours = adj.neighbours.get(current);
      if (neighbours) {
        for (const nbr of neighbours) {
          if (!visited.has(nbr)) {
            visited.add(nbr);
            queue.push(nbr);
          }
        }
      }
    }

    componentId++;
  }

  // Find which component has a node with backhaul
  let authorityReachableComponentId: number | null = null;
  for (const node of nodes.values()) {
    if (node.alive && node.hasBackhaul) {
      const comp = nodeToComponent.get(node.id);
      if (comp !== undefined) {
        authorityReachableComponentId = comp;
        break;
      }
    }
  }

  return { nodeToComponent, componentCount: componentId, authorityReachableComponentId };
}
