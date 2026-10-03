/**
 * Engine internal state management.
 */

import type { EngineConfig, WorldConfig } from '../domain/config';
import type { NodeId } from '../domain/ids';
import type { Message } from '../domain/message';
import type { Node } from '../domain/node';
import type { Adjacency } from '../graph/adjacency';
import type { ComponentMap } from '../graph/components';
import type { Prng } from '../prng';

export interface EngineState {
  tick: number;
  nodes: Map<NodeId, Node>;
  adjacency: Adjacency;
  components: ComponentMap;
  adjacencyVersion: number;
  adjacencyDirty: boolean;
  worldConfig: WorldConfig;
  engineConfig: EngineConfig;
  prng: Prng;
  cellsUp: boolean;
  gridUp: boolean;
  messageRegistry: Map<string, Message>;
  messageSeq: number;
}

export function updateLiveness(state: EngineState): void {
  for (const node of state.nodes.values()) {
    const powered =
      node.poweredOverride ?? (node.kind === 'mobile' ? true : state.gridUp || node.batteryBacked);
    node.alive = powered;
    node.wanUp = node.alive && state.cellsUp;

    if (node.kind === 'mobile') {
      node.hasBackhaul = node.alive && state.cellsUp;
    } else if (node.kind === 'router') {
      node.hasBackhaul = node.alive && (state.cellsUp || node.batteryBacked);
    } else {
      // gateway
      node.hasBackhaul = node.alive && (state.cellsUp || node.backhaul === 'satellite');
    }
  }
}
