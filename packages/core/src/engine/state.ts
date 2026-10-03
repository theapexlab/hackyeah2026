/**
 * Engine internal state and shared helpers.
 */

import type { EngineConfig, WorldConfig } from '../domain/config';
import type { DropReason, SimEvent, TransitEvent } from '../domain/events';
import type { MessageId, NodeId } from '../domain/ids';
import type { Message } from '../domain/message';
import type { Node } from '../domain/node';
import type { Declaration, Transaction } from '../domain/transaction';
import type { Adjacency } from '../graph/adjacency';
import { buildAdjacency } from '../graph/adjacency';
import type { ComponentMap } from '../graph/components';
import { findComponents } from '../graph/components';
import type { MetricsCollector } from '../metrics/metrics';
import { recordDrop } from '../metrics/metrics';
import type { Prng } from '../prng';

export const TRANSIT_RING_TICKS = 64;

/** Collects what one tick or one command produced; flushed into the engine logs by the caller. */
export interface Sink {
  events: SimEvent[];
  transits: TransitEvent[];
}

export interface AuthorityUplink {
  msgId: MessageId;
  tick: number;
  via: 'uplink';
}

export interface EngineState {
  tick: number;
  /** Insertion order is id order: every `nodes.values()` iteration is deterministic. */
  nodes: Map<NodeId, Node>;
  adjacency: Adjacency;
  components: ComponentMap;
  adjacencyDirty: boolean;
  worldConfig: WorldConfig;
  engineConfig: EngineConfig;
  prng: Prng;
  cellsUp: boolean;
  gridUp: boolean;
  messageRegistry: Map<MessageId, Message>;
  messageVersion: number;
  messageSeq: number;
  packetSeq: number;
  pendingAuthority: Message[];
  txMap: Map<MessageId, Transaction>;
  declarations: Declaration[];
  authorityReceived: AuthorityUplink[];
  authoritySeen: Set<MessageId>;
  metrics: MetricsCollector;
  transitRing: Array<{ tick: number; transits: TransitEvent[] }>;
}

export function newSink(): Sink {
  return { events: [], transits: [] };
}

export function registerMessage(state: EngineState, msg: Message): void {
  state.messageRegistry.set(msg.id, msg);
  state.messageVersion++;
}

export function markSeen(state: EngineState, node: Node, id: MessageId): void {
  node.seen.add(id);
  if (node.seen.size > state.engineConfig.seenCap) {
    node.seen.delete(node.seen.values().next().value as MessageId);
  }
}

export function logDrop(
  state: EngineState,
  sink: Sink,
  msg: Message,
  at: NodeId,
  reason: DropReason,
  hop: number,
): void {
  sink.events.push({
    type: 'DROPPED',
    tick: state.tick,
    msgId: msg.id,
    class: msg.class,
    at,
    reason,
    hop,
  });
  recordDrop(state.metrics, msg.class, reason);
}

/** Recompute alive / wanUp / hasBackhaul. Returns true when any node's aliveness changed. */
export function updateLiveness(state: EngineState): boolean {
  let aliveChanged = false;
  for (const node of state.nodes.values()) {
    const powered =
      node.poweredOverride ?? (node.kind !== 'router' || state.gridUp || node.batteryBacked);
    const alive = node.participating && powered;
    if (alive !== node.alive) aliveChanged = true;
    node.alive = alive;
    node.wanUp = alive && state.cellsUp;
    node.hasBackhaul =
      alive && (node.backhaul === 'satellite' || (node.backhaul !== 'none' && state.cellsUp));
  }
  return aliveChanged;
}

/**
 * Eagerly bring liveness, adjacency and components up to date. Called from tick and dispatch,
 * never from getSnapshot. Emits ADJACENCY when the edge set actually changed.
 */
export function refreshTopology(state: EngineState, sink?: Sink): void {
  if (updateLiveness(state)) state.adjacencyDirty = true;
  if (state.adjacencyDirty) {
    const next = buildAdjacency(state.nodes, state.adjacency);
    state.adjacencyDirty = false;
    if (next !== state.adjacency) {
      state.adjacency = next;
      for (const node of state.nodes.values()) {
        node.neighbourIds = next.neighbours.get(node.id) ?? [];
      }
      sink?.events.push({ type: 'ADJACENCY', tick: state.tick, version: next.version });
    }
  }
  state.components = findComponents(state.nodes, state.adjacency);
}
