/**
 * Per-tick simulation algorithm.
 * mobility -> liveness/adjacency -> mode -> originate -> inbox -> store -> swap -> metrics.
 * Determinism: nodes iterate in id order; inboxes sort by (priority, packet.seq); the single PRNG
 * is only drawn from mobility here. One hop per tick: forwards go to `nextInbox`, never `inbox`.
 */

import type { Message, Packet } from '../domain/message';
import { canOriginate, hopLimitFor, MODE_POLICIES, PRIORITY_RANK } from '../domain/mode';
import type { Node } from '../domain/node';
import { recordDelivery, recordOriginated } from '../metrics/metrics';
import { arePaymentsAllowed, canOriginateClass, isPriced } from '../policies/classes';
import { decide } from '../policies/forwarding';
import { applyDeclaration, evaluateMode } from '../policies/modeMachine';
import { isTrusted } from '../policies/trust';
import { injectPendingAuthority, isUplinkMessage, recordAuthorityUplink } from './authority';
import {
  type EngineState,
  logDrop,
  markSeen,
  newSink,
  refreshTopology,
  type Sink,
  TRANSIT_RING_TICKS,
} from './state';
import { closeTransaction, handleResponse, openTransaction } from './transactions';

function applyMobility(state: EngineState): void {
  const { enabled, stepMetres } = state.engineConfig.mobility;
  if (!enabled) return;
  const { width, height } = state.worldConfig;
  for (const node of state.nodes.values()) {
    if (node.kind !== 'mobile') continue;
    const angle = state.prng.float(0, Math.PI * 2);
    const dist = state.prng.float(0, stepMetres);
    node.x = Math.max(0, Math.min(width, node.x + Math.cos(angle) * dist));
    node.y = Math.max(0, Math.min(height, node.y + Math.sin(angle) * dist));
  }
  state.adjacencyDirty = true;
}

function updateModes(state: EngineState, sink: Sink): void {
  const { localModeAfterTicks, wanStableTicks, l3StepDownHoldTicks } = state.engineConfig;
  for (const node of state.nodes.values()) {
    if (!node.alive) continue;
    const next = evaluateMode(node, {
      tick: state.tick,
      localModeAfterTicks,
      wanStableTicks,
      l3StepDownHoldTicks,
    });
    if (!next) continue;
    const from = node.mode;
    node.mode = next.newMode;
    node.modeSource = next.source;
    if (from !== next.newMode) {
      sink.events.push({
        type: 'MODE_CHANGED',
        tick: state.tick,
        nodeId: node.id,
        from,
        to: next.newMode,
        source: next.source,
      });
    }
  }
}

function newPacket(state: EngineState, base: Packet, from: Node, routeCursor?: number): Packet {
  return {
    msgId: base.msgId,
    hop: base.hop + 1,
    path: [...base.path, from.id],
    lastHop: from.id,
    seq: state.packetSeq++,
    ...(routeCursor === undefined ? {} : { routeCursor }),
  };
}

type Forwarded = 'sent' | 'stored' | 'blocked';

function forwardOrStore(
  state: EngineState,
  sink: Sink,
  node: Node,
  msg: Message,
  packet: Packet,
): Forwarded {
  const policy = MODE_POLICIES[node.mode];
  const limit = Math.min(msg.hopLimit, hopLimitFor(policy, msg.class));
  if (packet.hop + 1 > limit) {
    logDrop(state, sink, msg, node.id, 'HOP_LIMIT', packet.hop);
    return 'blocked';
  }

  const send = (to: Node['id'], routeCursor?: number) => {
    const target = state.nodes.get(to);
    if (!target) return;
    const copy = newPacket(state, packet, node, routeCursor);
    target.nextInbox.push(copy);
    sink.transits.push({
      tick: state.tick,
      msgId: msg.id,
      class: msg.class,
      from: node.id,
      to,
      hop: copy.hop,
      via: 'hop',
    });
  };

  // FR-NET-07: responses go back along the recorded path while it still exists
  if (msg.payload.kind === 'RESPONSE' && packet.routeCursor !== undefined) {
    const next = msg.payload.returnPath[packet.routeCursor + 1];
    if (next !== undefined && node.neighbourIds.includes(next)) {
      send(next, packet.routeCursor + 1);
      return 'sent';
    }
  }

  const targets = node.neighbourIds.filter((id) => id !== packet.lastHop);
  if (targets.length === 0) {
    if (!policy.storeAndForward) {
      logDrop(state, sink, msg, node.id, 'NO_ROUTE', packet.hop);
      return 'blocked';
    }
    if (!node.store.some((e) => e.msgId === msg.id)) {
      node.store.push({
        msgId: msg.id,
        packet,
        sentTo: new Set(packet.lastHop ? [packet.lastHop] : []),
      });
      sink.events.push({
        type: 'STORED',
        tick: state.tick,
        msgId: msg.id,
        class: msg.class,
        at: node.id,
        hop: packet.hop,
      });
    }
    return 'stored';
  }

  for (const target of targets) send(target);
  return 'sent';
}

function originate(state: EngineState, sink: Sink): void {
  for (const node of state.nodes.values()) {
    const pending = node.pendingOriginations;
    node.pendingOriginations = [];
    for (const msg of pending) {
      if (!node.alive) {
        logDrop(state, sink, msg, node.id, 'NODE_DOWN', 0);
        continue;
      }
      markSeen(state, node, msg.id);
      recordOriginated(state.metrics, msg.class);
      sink.events.push({
        type: 'ORIGINATED',
        tick: state.tick,
        msgId: msg.id,
        class: msg.class,
        originId: msg.originId,
      });

      const { kind } = msg.payload;
      const derived = kind === 'RESPONSE' || kind === 'CLOSE';
      const honestCitizen = msg.signer.valid && node.credential.kind === 'citizen';

      // a citizen's own mode may forbid a class it is credentialed for; classes it can never
      // originate are left to receivers (UNVERIFIABLE)
      if (!derived && honestCitizen && canOriginate('citizen', msg.class)) {
        if (!canOriginateClass(msg.class, node.mode)) {
          logDrop(state, sink, msg, node.id, 'CLASS_NOT_ALLOWED', 0);
          continue;
        }
        if (isPriced(msg.payload) && !arePaymentsAllowed(node.mode)) {
          logDrop(state, sink, msg, node.id, 'PRICED_IN_EMERGENCY', 0);
          continue;
        }
      }

      if (kind === 'REQUEST' && isTrusted(msg.signer, msg.class) && honestCitizen) {
        openTransaction(state, sink, msg.id, node.id);
        node.requestView.set(msg.id, { status: 'mine', hop: 0 });
      }
      if (kind === 'CLOSE') closeTransaction(state, sink, msg.payload.requestId);
      if (isUplinkMessage(msg)) recordAuthorityUplink(state, sink, node, msg, 0);

      forwardOrStore(state, sink, node, msg, {
        msgId: msg.id,
        hop: 0,
        path: [],
        lastHop: null,
        seq: state.packetSeq++,
        ...(kind === 'RESPONSE' && msg.payload.returnPath.length > 0 ? { routeCursor: -1 } : {}),
      });
    }
  }
}

function deliverLocally(
  state: EngineState,
  sink: Sink,
  node: Node,
  msg: Message,
  packet: Packet,
): void {
  sink.events.push({
    type: 'DELIVERED',
    tick: state.tick,
    msgId: msg.id,
    class: msg.class,
    to: node.id,
    hop: packet.hop,
  });
  recordDelivery(state.metrics, msg.id, msg.class, packet.hop, state.tick - msg.createdTick);

  const payload = msg.payload;
  switch (payload.kind) {
    case 'REQUEST':
      if (!node.requestView.has(msg.id)) {
        node.requestView.set(msg.id, { status: 'open', hop: packet.hop, path: packet.path });
      }
      break;
    case 'RESPONSE':
      handleResponse(state, sink, node, payload.requestId, payload.responderId);
      break;
    case 'CLOSE': {
      const view = node.requestView.get(payload.requestId);
      if (!view) node.requestView.set(payload.requestId, { status: 'taken', hop: packet.hop });
      else if (view.status === 'open') view.status = 'taken';
      break;
    }
    case 'MODE_DECLARATION':
      applyDeclaration(
        node,
        payload.level,
        payload.untilTick,
        state.tick,
        msg.id,
        state.engineConfig.l3StepDownHoldTicks,
      );
      break;
    default:
      break;
  }
}

function processInboxes(state: EngineState, sink: Sink): void {
  const rank = (p: Packet) => PRIORITY_RANK[state.messageRegistry.get(p.msgId)?.class ?? 'INFO'];
  for (const node of state.nodes.values()) {
    const inbox = node.inbox;
    node.inbox = [];

    if (!node.alive) {
      for (const packet of inbox) {
        const msg = state.messageRegistry.get(packet.msgId);
        if (msg) logDrop(state, sink, msg, node.id, 'NODE_DOWN', packet.hop);
      }
      continue;
    }

    inbox.sort((a, b) => rank(a) - rank(b) || a.seq - b.seq);

    let forwarded = 0;
    for (const packet of inbox) {
      const msg = state.messageRegistry.get(packet.msgId);
      if (!msg) continue;

      const verdict = decide(msg, packet, {
        receiverNode: node,
        receiverMode: node.mode,
        tick: state.tick,
      });
      if (verdict.drop) {
        logDrop(state, sink, msg, node.id, verdict.dropReason!, packet.hop);
        continue;
      }

      markSeen(state, node, msg.id);
      if (verdict.deliverLocally) deliverLocally(state, sink, node, msg, packet);
      recordAuthorityUplink(state, sink, node, msg, packet.hop);

      // a response that arrived at its target has done its job
      if (msg.payload.kind === 'RESPONSE' && msg.payload.targetId === node.id) continue;

      if (forwarded >= state.engineConfig.nodeCapacityPerTick) {
        logDrop(state, sink, msg, node.id, 'CONGESTION', packet.hop);
        continue;
      }
      if (forwardOrStore(state, sink, node, msg, packet) === 'sent') forwarded++;
    }
  }
}

function flushStores(state: EngineState, sink: Sink): void {
  for (const node of state.nodes.values()) {
    if (!node.alive || node.store.length === 0) continue;

    const policy = MODE_POLICIES[node.mode];
    node.store = node.store.filter((entry) => {
      const msg = state.messageRegistry.get(entry.msgId);
      if (!msg) return false;
      if (state.tick - msg.createdTick > msg.ttlTicks) {
        logDrop(state, sink, msg, node.id, 'TTL_EXPIRED', entry.packet.hop);
        return false;
      }
      if (entry.packet.hop + 1 > Math.min(msg.hopLimit, hopLimitFor(policy, msg.class))) {
        return true;
      }
      for (const to of node.neighbourIds) {
        if (entry.sentTo.has(to)) continue;
        entry.sentTo.add(to);
        const copy = newPacket(state, entry.packet, node);
        state.nodes.get(to)?.nextInbox.push(copy);
        sink.transits.push({
          tick: state.tick,
          msgId: msg.id,
          class: msg.class,
          from: node.id,
          to,
          hop: copy.hop,
          via: 'store-flush',
        });
        sink.events.push({
          type: 'STORE_FLUSHED',
          tick: state.tick,
          msgId: msg.id,
          class: msg.class,
          from: node.id,
          to,
        });
      }
      return true;
    });
  }
}

export function doTick(state: EngineState): Sink {
  const sink = newSink();

  applyMobility(state); // 1
  refreshTopology(state, sink); // 2
  updateModes(state, sink); // 3
  injectPendingAuthority(state, sink); // 4
  originate(state, sink);
  processInboxes(state, sink); // 5
  flushStores(state, sink); // 6
  for (const node of state.nodes.values()) {
    // 7
    node.inbox = node.nextInbox;
    node.nextInbox = [];
  }

  state.transitRing.push({ tick: state.tick, transits: sink.transits });
  if (state.transitRing.length > TRANSIT_RING_TICKS) state.transitRing.shift();
  return sink;
}
