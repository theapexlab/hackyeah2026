/**
 * Per-tick simulation algorithm.
 * Implements the main loop: mobility → liveness → mode → originate → inbox → store → swap → metrics.
 */

import type { DropReason, SimEvent, TransitEvent } from '../domain/events';
import type { NodeId } from '../domain/ids';
import { AUTHORITY_ID } from '../domain/ids';
import type { Message, Packet } from '../domain/message';
import { MODE_POLICIES, PRIORITY_RANK } from '../domain/mode';
import type { Node } from '../domain/node';
import { buildAdjacency } from '../graph/adjacency';
import { findComponents } from '../graph/components';
import { isClassAllowed } from '../policies/classes';
import { decide } from '../policies/forwarding';
import { applyDeclaration, evaluateMode } from '../policies/modeMachine';
import { recordAuthorityUplink } from './authority';
import type { EngineState } from './state';
import { updateLiveness } from './state';

export interface TickState {
  events: SimEvent[];
  transits: TransitEvent[];
  metrics: {
    forwardedCount: number;
    droppedByReason: Map<DropReason, number>;
  };
  authorityReceived: Array<{ msgId: string; tick: number; via: string }>;
}

function applyMobility(state: EngineState): void {
  if (!state.engineConfig.mobility.enabled) return;

  for (const node of state.nodes.values()) {
    if (node.kind !== 'mobile') continue;

    const step = state.engineConfig.mobility.stepMetres;
    const angle = state.prng.float(0, Math.PI * 2);
    const dist = state.prng.float(0, step);

    const newX = node.x + Math.cos(angle) * dist;
    const newY = node.y + Math.sin(angle) * dist;

    node.x = Math.max(0, Math.min(state.worldConfig.width, newX));
    node.y = Math.max(0, Math.min(state.worldConfig.height, newY));
  }

  state.adjacencyDirty = true;
}

function updateAdjacency(state: EngineState, tickState: TickState): void {
  if (state.adjacencyDirty) {
    state.adjacency = buildAdjacency(state.nodes);
    state.components = findComponents(state.nodes, state.adjacency);
    state.adjacencyDirty = false;
    state.adjacencyVersion++;
    tickState.events.push({
      type: 'ADJACENCY',
      tick: state.tick,
      version: state.adjacencyVersion,
    });
  }
}

function updateModes(state: EngineState, tickState: TickState): void {
  for (const node of state.nodes.values()) {
    if (!node.alive) continue;

    const transition = evaluateMode(node, {
      tick: state.tick,
      localModeAfterTicks: state.engineConfig.localModeAfterTicks,
      wanStableTicks: state.engineConfig.wanStableTicks,
      l3StepDownHoldTicks: state.engineConfig.l3StepDownHoldTicks,
    });

    if (transition) {
      const oldMode = node.mode;
      node.mode = transition.newMode;
      node.modeSource = transition.source;

      tickState.events.push({
        type: 'MODE_CHANGED',
        tick: state.tick,
        nodeId: node.id,
        from: oldMode,
        to: transition.newMode,
        source: transition.source,
      });
    }
  }
}

function originateMessages(state: EngineState, tickState: TickState): void {
  for (const node of state.nodes.values()) {
    while (node.pendingOriginations.length > 0) {
      const msg = node.pendingOriginations.shift()!;

      // Record as seen and originated
      node.seen.add(msg.id);
      if (node.seen.size > state.engineConfig.seenCap) {
        const arr = Array.from(node.seen);
        arr.shift();
        node.seen = new Set(arr);
      }

      state.messageRegistry.set(msg.id, msg);

      tickState.events.push({
        type: 'ORIGINATED',
        tick: state.tick,
        msgId: msg.id,
        class: msg.class,
        originId: msg.originId,
      });

      // Open transaction for REQUESTs
      if (msg.payload.kind === 'REQUEST') {
        const requestId = msg.id;
        const tx = {
          requestId,
          status: 'open' as const,
          openedAtTick: state.tick,
        };
        state.engineConfig.autoConfirm; // use it for something
        tickState.events.push({
          type: 'TX_OPENED',
          tick: state.tick,
          requestId,
          from: msg.originId,
        });

        // Create request view for the originator
        if (node.credential.kind === 'citizen') {
          node.requestView.set(requestId, { status: 'mine', hop: 0 });
        }
      }

      // Forward at hop 0
      forwardOrStore(
        state,
        msg,
        { msgId: msg.id, hop: 0, path: [], lastHop: null, seq: state.messageSeq++ },
        node,
        tickState,
      );
    }
  }
}

function processInbox(state: EngineState, tickState: TickState): void {
  for (const node of state.nodes.values()) {
    // Dead nodes drop all packets
    if (!node.alive) {
      for (const packet of node.inbox) {
        tickState.transits.push({
          tick: state.tick,
          msgId: packet.msgId,
          class: 'INFO', // unknown
          from: packet.lastHop || node.id,
          to: node.id,
          hop: packet.hop,
          via: 'hop',
        });

        tickState.events.push({
          type: 'DROPPED',
          tick: state.tick,
          msgId: packet.msgId,
          class: 'INFO',
          at: node.id,
          reason: 'NODE_DOWN',
          hop: packet.hop,
        });
      }
      node.inbox = [];
      continue;
    }

    // Sort inbox by priority, then seq
    node.inbox.sort((a, b) => {
      const msgA = state.messageRegistry.get(a.msgId);
      const msgB = state.messageRegistry.get(b.msgId);
      const clsA = msgA?.class ?? 'INFO';
      const clsB = msgB?.class ?? 'INFO';
      const rankA = PRIORITY_RANK[clsA] ?? 4;
      const rankB = PRIORITY_RANK[clsB] ?? 4;

      const rankCmp = rankA - rankB;
      if (rankCmp !== 0) return rankCmp;
      return a.seq - b.seq;
    });

    let forwardedCount = 0;
    const maxForwards = state.engineConfig.nodeCapacityPerTick;

    for (const packet of node.inbox) {
      const msg = state.messageRegistry.get(packet.msgId);
      if (!msg) continue;

      // Add to seen
      node.seen.add(msg.id);
      if (node.seen.size > state.engineConfig.seenCap) {
        const arr = Array.from(node.seen);
        arr.shift();
        node.seen = new Set(arr);
      }

      // Decide whether to keep or drop
      const decision = decide(msg, packet, {
        receiverNode: node,
        receiverMode: node.mode,
      });

      if (decision.drop) {
        tickState.events.push({
          type: 'DROPPED',
          tick: state.tick,
          msgId: msg.id,
          class: msg.class,
          at: node.id,
          reason: decision.dropReason!,
          hop: packet.hop,
        });

        tickState.metrics.droppedByReason.set(
          decision.dropReason!,
          (tickState.metrics.droppedByReason.get(decision.dropReason!) ?? 0) + 1,
        );

        continue;
      }

      // Handle local delivery
      if (decision.deliverLocally) {
        tickState.events.push({
          type: 'DELIVERED',
          tick: state.tick,
          msgId: msg.id,
          class: msg.class,
          to: node.id,
          hop: packet.hop,
        });

        // Handle specific message types
        if (msg.class === 'MODE_DECLARATION' && msg.payload.kind === 'MODE_DECLARATION') {
          if (msg.payload.level !== 'ALL_CLEAR') {
            applyDeclaration(node, msg.payload.level, msg.payload.untilTick, state.tick);
          } else {
            applyDeclaration(node, 'ALL_CLEAR', msg.payload.untilTick, state.tick);
          }
        }

        if (msg.class === 'CHECK_IN' && node.hasBackhaul) {
          tickState.authorityReceived.push(recordAuthorityUplink(node.id, msg.id, state.tick));
          tickState.events.push({
            type: 'AUTHORITY_RECEIVED',
            tick: state.tick,
            msgId: msg.id,
            via: 'uplink',
          });

          // Create transit event
          tickState.transits.push({
            tick: state.tick,
            msgId: msg.id,
            class: msg.class,
            from: node.id,
            to: AUTHORITY_ID,
            hop: packet.hop,
            via: 'uplink',
          });
        }
      }

      // Forward or store
      if (forwardedCount < maxForwards) {
        const res = forwardOrStore(state, msg, packet, node, tickState);
        if (res) {
          forwardedCount++;
        }
      } else {
        // Capacity exceeded - drop lower priority messages
        const cls = msg.class;
        const rank = PRIORITY_RANK[cls] ?? 4;
        if (rank > 1) {
          // Drop lower priority
          tickState.events.push({
            type: 'DROPPED',
            tick: state.tick,
            msgId: msg.id,
            class: cls,
            at: node.id,
            reason: 'CONGESTION',
            hop: packet.hop,
          });
          tickState.metrics.droppedByReason.set(
            'CONGESTION',
            (tickState.metrics.droppedByReason.get('CONGESTION') ?? 0) + 1,
          );
        }
      }
    }

    node.inbox = [];
  }
}

function forwardOrStore(
  state: EngineState,
  msg: Message,
  packet: Packet,
  node: Node,
  tickState: TickState,
): boolean {
  const policy = MODE_POLICIES[node.mode];
  const limitByHop = Math.min(msg.hopLimit, policy.hopLimit);

  // Check hop limit
  if (packet.hop >= limitByHop) {
    return false;
  }

  // Get targets (neighbors except last hop)
  const targets = node.neighbourIds.filter((id) => id !== packet.lastHop);

  if (targets.length === 0) {
    // No neighbors
    if (policy.storeAndForward) {
      // Store the message
      const storeEntry = node.store.find((e) => e.msgId === msg.id);
      if (!storeEntry) {
        node.store.push({
          msgId: msg.id,
          packet,
          sentTo: new Set(),
        });

        tickState.events.push({
          type: 'STORED',
          tick: state.tick,
          msgId: msg.id,
          class: msg.class,
          at: node.id,
          hop: packet.hop,
        });
      }
      return true;
    } else {
      return false;
    }
  }

  // Forward to neighbors
  for (const target of targets) {
    const newSeq = state.messageSeq++;
    const newPacket: Packet = {
      msgId: msg.id,
      hop: packet.hop + 1,
      path: [...packet.path, node.id],
      lastHop: node.id,
      seq: newSeq,
    };

    const targetNode = state.nodes.get(target);
    if (targetNode?.alive) {
      targetNode.nextInbox.push(newPacket);

      tickState.transits.push({
        tick: state.tick,
        msgId: msg.id,
        class: msg.class,
        from: node.id,
        to: target,
        hop: newPacket.hop,
        via: 'hop',
      });

      tickState.metrics.forwardedCount++;
    }
  }

  return true;
}

function flushStore(state: EngineState, tickState: TickState): void {
  for (const node of state.nodes.values()) {
    if (!node.alive) {
      node.store = [];
      continue;
    }

    const policy = MODE_POLICIES[node.mode];

    // Expire old messages
    node.store = node.store.filter((entry) => {
      const msg = state.messageRegistry.get(entry.msgId);
      if (!msg) return false;

      const age = state.tick - msg.createdTick;
      if (age > msg.ttlTicks) {
        tickState.events.push({
          type: 'DROPPED',
          tick: state.tick,
          msgId: msg.id,
          class: msg.class,
          at: node.id,
          reason: 'TTL_EXPIRED',
          hop: entry.packet.hop,
        });
        return false;
      }

      return true;
    });

    // Flush to new neighbors
    for (const entry of node.store) {
      const msg = state.messageRegistry.get(entry.msgId);
      if (!msg) continue;

      const policy = MODE_POLICIES[node.mode];
      const limitByHop = Math.min(msg.hopLimit, policy.hopLimit);

      if (entry.packet.hop >= limitByHop) {
        continue;
      }

      for (const nbr of node.neighbourIds) {
        if (!entry.sentTo.has(nbr)) {
          const nbrNode = state.nodes.get(nbr);
          if (nbrNode?.alive) {
            const newSeq = state.messageSeq++;
            const newPacket: Packet = {
              msgId: msg.id,
              hop: entry.packet.hop + 1,
              path: [...entry.packet.path, node.id],
              lastHop: node.id,
              seq: newSeq,
            };

            nbrNode.nextInbox.push(newPacket);
            entry.sentTo.add(nbr);

            tickState.transits.push({
              tick: state.tick,
              msgId: msg.id,
              class: msg.class,
              from: node.id,
              to: nbr,
              hop: newPacket.hop,
              via: 'store-flush',
            });

            tickState.events.push({
              type: 'STORE_FLUSHED',
              tick: state.tick,
              msgId: msg.id,
              class: msg.class,
              from: node.id,
              to: nbr,
            });
          }
        }
      }
    }
  }
}

function swapInboxes(state: EngineState): void {
  for (const node of state.nodes.values()) {
    node.inbox = node.nextInbox;
    node.nextInbox = [];
  }
}

export function doTick(state: EngineState): TickState {
  const tickState: TickState = {
    events: [],
    transits: [],
    metrics: {
      forwardedCount: 0,
      droppedByReason: new Map(),
    },
    authorityReceived: [],
  };

  // 1. Mobility
  applyMobility(state);

  // 2. Liveness and adjacency
  updateLiveness(state);
  updateAdjacency(state, tickState);

  // 3. Mode evaluation
  updateModes(state, tickState);

  // 4. Originate messages
  originateMessages(state, tickState);

  // 5. Process inbox
  processInbox(state, tickState);

  // 6. Store management
  flushStore(state, tickState);

  // 7. Swap inbox buffers
  swapInboxes(state);

  return tickState;
}
