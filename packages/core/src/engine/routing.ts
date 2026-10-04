import type { TransitEvent, TransitVia } from '../domain/events';
import type { NodeId } from '../domain/ids';
import type { Message, Packet } from '../domain/message';
import { hopLimitFor, MODE_POLICIES } from '../domain/mode';
import type { Node } from '../domain/node';
import { insideCircle } from '../graph/distance';
import { verifySigner } from '../policies/trust';
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
    fromPos: { x: from.x, y: from.y },
    toPos: { x: target.x, y: target.y },
  });
}

/**
 * A REQUEST or CLOSE stays inside its region (requestRadiusM around the requester): nobody
 * hands it to a node outside, and a carrier that leaves lets its copy go. Declarations and
 * alerts are not bounded: their region only limits who acts on them.
 */
function withinReach(msg: Message, node: Node): boolean {
  const region = msg.region;
  const bound = msg.payload.kind === 'REQUEST' || msg.payload.kind === 'CLOSE';
  return region === undefined || !bound || insideCircle(node.x, node.y, region);
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
 *  - flooding targets every neighbour except lastHop and, for a region-bound REQUEST or
 *    CLOSE, those outside its region. When the policy has storeAndForward
 *    the node also keeps a custody copy (FR-NET-08) that flushStores hands to every later
 *    neighbour until the TTL runs out; STORED is logged only when nobody took it right
 *    away. A message whose signature does not verify is never taken into custody: only
 *    its forger ever holds one (every receiver drops it UNVERIFIABLE), and a stored copy
 *    would be offered to each phone it meets for the whole TTL. Without custody and with
 *    nobody to send to: DROPPED NO_ROUTE.
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

  const sentTo = new Set<NodeId>();
  if (packet.lastHop !== null) sentTo.add(packet.lastHop);
  for (const id of node.neighbourIds) {
    if (id === packet.lastHop) continue;
    const target = state.byId.get(id);
    if (target === undefined || !withinReach(msg, target)) continue;
    send(state, node, target, msg, packet, 'hop', undefined, transits);
    sentTo.add(id);
  }
  const sent = sentTo.size - (packet.lastHop !== null ? 1 : 0);

  if (policy.storeAndForward && verifySigner(msg.signer, msg.class)) {
    // Custody (FR-NET-08): keep a copy until the TTL runs out and hand it to every new
    // neighbour; STORED is logged only when nobody could take it right away.
    node.store.push({ msgId: msg.id, packet, storedTick: state.tick, sentTo });
    if (sent === 0) {
      logEvent(state, { type: 'STORED', tick: state.tick, msgId: msg.id, nodeId: node.id });
    }
    return true;
  }
  if (sent > 0) return true;
  recordDrop(state, node.id, msg, 'NO_ROUTE');
  return false;
}

/**
 * Store-and-forward flush (FR-NET-08): every stored entry goes to each current neighbour
 * it has not been sent to yet (via 'store-flush', STORE_FLUSHED). A neighbour that already
 * has the message, or is receiving it this tick, is skipped, as epidemic routing's
 * summary-vector exchange would tell the carrier. Entries stay until their TTL runs out, so the node keeps acting as a data mule.
 * A region-bound entry is never handed outside its region; a neighbour outside is skipped
 * without being marked, so it can still get the copy once it walks in.
 */
export function flushStores(state: EngineState, node: Node, transits: TransitEvent[]): void {
  for (const entry of node.store) {
    const msg = state.messages.get(entry.msgId);
    if (msg === undefined) continue;
    for (const id of node.neighbourIds) {
      if (entry.sentTo.has(id)) continue;
      const target = state.byId.get(id);
      if (target === undefined || !withinReach(msg, target)) continue;
      entry.sentTo.add(id);
      // already has it, or is receiving it this tick from another carrier
      if (target.seen.has(msg.id) || target.nextInbox.some((p) => p.msgId === msg.id)) continue;
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

/**
 * A CLOSE passed through `node`: the request it closes is settled, so the node stops
 * carrying it. Without this every custody copy kept flushing the taken request to each
 * new neighbour until its TTL ran out, long after the CLOSE had gone by.
 */
export function releaseClosedRequest(node: Node, msg: Message): void {
  if (msg.payload.kind !== 'CLOSE' || node.store.length === 0) return;
  const requestId = msg.payload.requestId;
  if (node.store.some((entry) => entry.msgId === requestId)) {
    node.store = node.store.filter((entry) => entry.msgId !== requestId);
  }
}

/**
 * Drop stored entries whose message TTL has expired (DROPPED TTL_EXPIRED), and quietly let
 * go of region-bound copies the node has carried out of their region.
 */
export function expireStores(state: EngineState, node: Node): void {
  if (node.store.length === 0) return;
  const keep = node.store.filter((entry) => {
    const msg = state.messages.get(entry.msgId);
    if (msg === undefined) return false;
    if (!withinReach(msg, node)) return false;
    if (msg.createdTick + msg.ttlTicks < state.tick) {
      recordDrop(state, node.id, msg, 'TTL_EXPIRED');
      return false;
    }
    return true;
  });
  if (keep.length !== node.store.length) node.store = keep;
}
