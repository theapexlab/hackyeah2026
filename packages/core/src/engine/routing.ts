import type { TransitEvent, TransitVia } from '../domain/events';
import type { NodeId } from '../domain/ids';
import type { Message, Packet } from '../domain/message';
import { hopLimitFor, MODE_POLICIES } from '../domain/mode';
import type { Node } from '../domain/node';
import type { EngineState } from './state';
import { logEvent, nextPacketSeq, recordDrop } from './state';

/**
 * Push one copy of `msg` into `target.nextInbox` (never `inbox`: that is what makes one
 * hop per tick true) and record the transit. The copy has hop+1, the path extended by
 * the sender, lastHop = sender and a fresh packet seq.
 */
function send(
  state: EngineState,
  from: Node,
  target: Node,
  msg: Message,
  packet: Packet,
  via: TransitVia,
  routeCursor: number | undefined,
  transits: TransitEvent[],
): void {
  const base = {
    msgId: msg.id,
    hop: packet.hop + 1,
    path: [...packet.path, from.id],
    lastHop: from.id,
    seq: nextPacketSeq(state),
  };
  const next: Packet = routeCursor === undefined ? base : { ...base, routeCursor };
  target.nextInbox.push(next);
  transits.push({
    tick: state.tick,
    msgId: msg.id,
    class: msg.class,
    from: from.id,
    to: target.id,
    hop: next.hop,
    via,
  });
}

/**
 * Forward a packet the node has accepted (plan A5), or store it. Returns true when the
 * packet was sent to at least one neighbour or stored, false when it stopped here.
 *
 *  - a RESPONSE that has reached its target stops (no event: it arrived);
 *  - limit = min(msg.hopLimit, hopLimitFor(policy, class)); hop+1 > limit -> DROPPED
 *    HOP_LIMIT (the node already delivered it locally: "stopped at the edge");
 *  - a RESPONSE with a routeCursor is unicast to returnPath[cursor+1] when that node is
 *    a current neighbour; otherwise it falls back to flooding (FR-NET-07) and the copies
 *    carry no cursor, so downstream nodes flood too;
 *  - flooding targets every neighbour except lastHop; with none, the packet is stored
 *    when the policy has storeAndForward (STORED) or dropped NO_ROUTE.
 */
export function forwardOrStore(
  state: EngineState,
  node: Node,
  msg: Message,
  packet: Packet,
  transits: TransitEvent[],
): boolean {
  const payload = msg.payload;
  if (payload.kind === 'RESPONSE' && payload.targetId === node.id) return false;

  const policy = MODE_POLICIES[node.mode];
  const limit = Math.min(msg.hopLimit, hopLimitFor(policy, msg.class));
  if (packet.hop + 1 > limit) {
    recordDrop(state, node.id, msg, 'HOP_LIMIT');
    return false;
  }

  if (payload.kind === 'RESPONSE' && packet.routeCursor !== undefined) {
    const cursor = packet.routeCursor + 1;
    const nextId = payload.returnPath[cursor];
    const next = nextId === undefined ? undefined : state.byId.get(nextId);
    if (next !== undefined && node.neighbourIds.includes(next.id)) {
      send(state, node, next, msg, packet, 'hop', cursor, transits);
      return true;
    }
    // path broken: flood fallback below
  }

  let sent = 0;
  for (const id of node.neighbourIds) {
    if (id === packet.lastHop) continue;
    const target = state.byId.get(id);
    if (target === undefined) continue;
    send(state, node, target, msg, packet, 'hop', undefined, transits);
    sent++;
  }
  if (sent > 0) return true;

  if (policy.storeAndForward) {
    const sentTo = new Set<NodeId>();
    if (packet.lastHop !== null) sentTo.add(packet.lastHop);
    node.store.push({ msgId: msg.id, packet, storedTick: state.tick, sentTo });
    logEvent(state, { type: 'STORED', tick: state.tick, msgId: msg.id, nodeId: node.id });
    return true;
  }
  recordDrop(state, node.id, msg, 'NO_ROUTE');
  return false;
}

/**
 * Store-and-forward flush (FR-NET-08): every stored entry goes to each current neighbour
 * it has not been sent to yet (via 'store-flush', STORE_FLUSHED). Entries stay until
 * their TTL runs out, so the node keeps acting as a data mule.
 */
export function flushStores(state: EngineState, node: Node, transits: TransitEvent[]): void {
  for (const entry of node.store) {
    const msg = state.messages.get(entry.msgId);
    if (msg === undefined) continue;
    for (const id of node.neighbourIds) {
      if (entry.sentTo.has(id)) continue;
      const target = state.byId.get(id);
      if (target === undefined) continue;
      entry.sentTo.add(id);
      send(state, node, target, msg, entry.packet, 'store-flush', undefined, transits);
      logEvent(state, {
        type: 'STORE_FLUSHED',
        tick: state.tick,
        msgId: msg.id,
        nodeId: node.id,
        to: target.id,
      });
    }
  }
}

/** Drop stored entries whose message TTL has expired (DROPPED TTL_EXPIRED). */
export function expireStores(state: EngineState, node: Node): void {
  if (node.store.length === 0) return;
  const keep = node.store.filter((entry) => {
    const msg = state.messages.get(entry.msgId);
    if (msg === undefined) return false;
    if (msg.createdTick + msg.ttlTicks < state.tick) {
      recordDrop(state, node.id, msg, 'TTL_EXPIRED');
      return false;
    }
    return true;
  });
  if (keep.length !== node.store.length) node.store = keep;
}
