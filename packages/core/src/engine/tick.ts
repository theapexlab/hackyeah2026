import type { TransitEvent } from '../domain/events';
import type { Message, Packet } from '../domain/message';
import { MODE_POLICIES } from '../domain/mode';
import type { Node } from '../domain/node';
import type { TickResult } from '../domain/snapshot';
import { buildAdjacency, edgesEqual } from '../graph/adjacency';
import { connectedComponents } from '../graph/components';
import { PRIORITY_RANK } from '../policies/classes';
import { decide, decisionContextFor } from '../policies/forwarding';
import { applyAllClear, applyDeclaration, evaluateMode } from '../policies/modeMachine';
import { verifySigner } from '../policies/trust';
import { isAuthorityBound, uplink } from './authority';
import { moveTravellers } from './mobility';
import { expireStores, flushStores, forwardOrStore } from './routing';
import type { EngineState } from './state';
import { addSeen, logEvent, nextPacketSeq, recordDrop, TRANSIT_RING_SIZE } from './state';
import {
  closeExpiredTransactions,
  onCloseSeen,
  onResponseAtRequester,
  openTransaction,
  pruneExpiredRequestViews,
} from './transactions';

/** FIFO-trim the event log to config.eventLogCap (Number.POSITIVE_INFINITY: keep everything). */
function trimEventLog(state: EngineState): void {
  const cap = Math.max(0, state.config.eventLogCap);
  if (state.eventLog.length > cap) state.eventLog.splice(0, state.eventLog.length - cap);
}

function participates(state: EngineState, node: Node, participating: number): boolean {
  const rank = state.participationRank.get(node.id);
  return rank === undefined ? true : rank < participating;
}

function baseAlive(state: EngineState, node: Node, participating: number): boolean {
  switch (node.kind) {
    case 'mobile':
      return participates(state, node, participating);
    case 'router':
      return state.gridUp || node.batteryBacked;
    case 'gateway':
      return true;
  }
}

function backhaulUp(state: EngineState, node: Node): boolean {
  switch (node.backhaul) {
    case 'cellular':
      return state.cellsUp;
    case 'satellite':
      return true;
    case 'fibre':
      return state.cellsUp;
    case 'none':
      return false;
  }
}

/**
 * Phase 2a: derive alive / wanUp / hasBackhaul for every node (plan A5):
 *   alive = poweredOverride ?? (mobile: participating | router: gridUp || batteryBacked | gateway: true)
 *   wanUp = alive && cellsUp
 *   hasBackhaul = alive && (cellular: cellsUp | satellite: true | fibre: cellsUp | none: false)
 * Any change marks the adjacency dirty.
 */
export function updateLiveness(state: EngineState): void {
  const participating = Math.round(state.participation * state.participationRank.size);
  let changed = false;
  for (const node of state.nodes) {
    const alive = node.poweredOverride ?? baseAlive(state, node, participating);
    const wanUp = alive && state.cellsUp;
    const hasBackhaul = alive && backhaulUp(state, node);
    if (alive !== node.alive || wanUp !== node.wanUp || hasBackhaul !== node.hasBackhaul) {
      changed = true;
    }
    node.alive = alive;
    node.wanUp = wanUp;
    node.hasBackhaul = hasBackhaul;
  }
  if (changed) state.adjacency.dirty = true;
}

function updateTopologyMetrics(state: EngineState): void {
  let alive = 0;
  for (const node of state.nodes) if (node.alive) alive++;
  const c = state.components;
  let largest = 0;
  for (const size of c.sizes) largest = Math.max(largest, size);
  let backhaulReach = 0;
  for (let i = 0; i < c.sizes.length; i++) {
    if (c.backhaulComponents.has(i)) backhaulReach += c.sizes[i] ?? 0;
  }
  state.metrics.setTopology({
    reachableFraction: alive === 0 ? 0 : largest / alive,
    authorityReachableFraction: alive === 0 ? 0 : backhaulReach / alive,
    componentCount: c.count,
  });
}

/**
 * Phase 2b: rebuild adjacency and components. `adjacency.edges` keeps its reference
 * (and version) when the edge list is unchanged; ADJACENCY is logged when the edges or
 * the component count changed. Copies each neighbour list into node.neighbourIds.
 */
export function rebuildAdjacency(state: EngineState): void {
  const adj = buildAdjacency(state.nodes);
  for (const node of state.nodes) {
    node.prevNeighbourIds = node.neighbourIds;
    node.neighbourIds = adj.neighbours.get(node.id) ?? [];
  }
  const components = connectedComponents(state.nodes, adj.neighbours);
  const edgesChanged = !edgesEqual(state.adjacency.edges, adj.edges);
  const componentsChanged = components.count !== state.components.count;
  const prev = state.adjacency;
  state.adjacency = {
    neighbours: adj.neighbours,
    edges: edgesChanged ? adj.edges : prev.edges,
    version: edgesChanged ? prev.version + 1 : prev.version,
    dirty: false,
  };
  state.components = components;
  updateTopologyMetrics(state);
  if (edgesChanged || componentsChanged) {
    logEvent(state, {
      type: 'ADJACENCY',
      tick: state.tick,
      version: state.adjacency.version,
      edges: state.adjacency.edges.length,
      components: components.count,
    });
  }
}

/** Liveness, then adjacency if anything is dirty. Used by commands (eager) and the tick. */
export function refreshTopology(state: EngineState): void {
  updateLiveness(state);
  if (state.adjacency.dirty) rebuildAdjacency(state);
}

function evaluateModes(state: EngineState): void {
  for (const node of state.nodes) {
    if (!node.alive) continue;
    if (node.wanUp) {
      node.ticksWithWan += 1;
      node.ticksWithoutWan = 0;
    } else {
      node.ticksWithoutWan += 1;
      node.ticksWithWan = 0;
    }
    const r = evaluateMode(node, state.config, state.tick);
    if (r.mode !== node.mode) {
      logEvent(state, {
        type: 'MODE_CHANGED',
        tick: state.tick,
        nodeId: node.id,
        from: node.mode,
        to: r.mode,
        source: r.source,
      });
    }
    node.mode = r.mode;
    node.modeSource = r.source;
  }
}

function maybeUplink(
  state: EngineState,
  node: Node,
  msg: Message,
  hop: number,
  transits: TransitEvent[],
): void {
  if (node.hasBackhaul && isAuthorityBound(msg) && verifySigner(msg.signer, msg.class))
    uplink(state, node, msg, state.tick, transits, hop);
}

function originate(state: EngineState, transits: TransitEvent[]): void {
  for (const node of state.nodes) {
    if (node.pendingOriginations.length === 0) continue;
    const pending = node.pendingOriginations;
    node.pendingOriginations = [];
    for (const msg of pending) {
      if (!node.alive) {
        recordDrop(state, node.id, msg, 'NODE_DOWN');
        continue;
      }
      addSeen(node, msg.id, state.config.seenCap);
      logEvent(state, {
        type: 'ORIGINATED',
        tick: state.tick,
        msgId: msg.id,
        nodeId: node.id,
        class: msg.class,
      });
      state.metrics.onOriginated(msg.class);
      if (msg.payload.kind === 'REQUEST' && verifySigner(msg.signer, msg.class)) {
        openTransaction(state, msg);
        node.requestView.set(msg.id, { requestId: msg.id, status: 'mine', hop: 0, path: [] });
      }
      maybeUplink(state, node, msg, 0, transits);
      const base = { msgId: msg.id, hop: 0, path: [], lastHop: null, seq: nextPacketSeq(state) };
      const packet: Packet = msg.payload.kind === 'RESPONSE' ? { ...base, routeCursor: 0 } : base;
      forwardOrStore(state, node, msg, packet, transits);
    }
  }
}

/** Side effects of accepting a packet whose verdict says deliverLocally (plan A5). */
function deliverLocally(state: EngineState, node: Node, msg: Message, packet: Packet): void {
  logEvent(state, {
    type: 'DELIVERED',
    tick: state.tick,
    msgId: msg.id,
    nodeId: node.id,
    class: msg.class,
    hop: packet.hop,
  });
  state.metrics.onDelivered(msg.class, msg.id, node.id, packet.hop, state.tick - msg.createdTick);
  const payload = msg.payload;
  switch (payload.kind) {
    case 'MODE_DECLARATION':
      if (payload.level === 'ALL_CLEAR') {
        // the mode machine already ran this tick, so the hold starts at the next
        // evaluation (plan A8): from tick + 1 it lasts exactly l3StepDownHoldTicks
        applyAllClear(node, state.tick + 1, state.config.l3StepDownHoldTicks);
      } else {
        applyDeclaration(node, payload.level, payload.untilTick, msg.id);
      }
      break;
    case 'REQUEST':
      if (!node.requestView.has(msg.id)) {
        node.requestView.set(msg.id, {
          requestId: msg.id,
          status: 'open',
          hop: packet.hop,
          path: packet.path,
        });
      }
      break;
    case 'RESPONSE':
      onResponseAtRequester(state, node, msg);
      break;
    case 'CLOSE':
      onCloseSeen(state, node, payload);
      break;
    case 'CHECK_IN':
    case 'ALERT':
    case 'TOPOLOGY':
      break;
  }
}

function processInbox(state: EngineState, node: Node, transits: TransitEvent[]): void {
  const packets = node.inbox;
  node.inbox = [];
  if (packets.length === 0) return;

  const entries: { packet: Packet; msg: Message }[] = [];
  for (const packet of packets) {
    const msg = state.messages.get(packet.msgId);
    if (msg !== undefined) entries.push({ packet, msg });
  }

  if (!node.alive) {
    for (const { msg } of entries) recordDrop(state, node.id, msg, 'NODE_DOWN');
    return;
  }

  entries.sort((a, b) => {
    const d = PRIORITY_RANK[a.msg.class] - PRIORITY_RANK[b.msg.class];
    return d !== 0 ? d : a.packet.seq - b.packet.seq;
  });

  const ctx = decisionContextFor(node, state.tick);
  const capacity = state.config.nodeCapacityPerTick;
  let forwarded = 0;
  for (const { packet, msg } of entries) {
    const verdict = decide(ctx, msg, packet);
    if (!verdict.ok) {
      recordDrop(state, node.id, msg, verdict.reason);
      continue;
    }
    addSeen(node, msg.id, state.config.seenCap);
    if (verdict.deliverLocally) deliverLocally(state, node, msg, packet);
    maybeUplink(state, node, msg, packet.hop, transits);
    if (forwarded >= capacity) {
      recordDrop(state, node.id, msg, 'CONGESTION');
      continue;
    }
    if (forwardOrStore(state, node, msg, packet, transits)) forwarded++;
  }
}

/**
 * One simulation tick (plan A5), in this order:
 *  1 mobility (if enabled, generated worlds only): walkers and drivers follow their street
 *    trips in id order, arrivals linger, and freed places are refilled (moveTravellers);
 *    adjacency is marked dirty only if someone moved
 *  2 liveness, then adjacency + components when dirty
 *  3 mode machine per alive node (WAN counters first, then evaluateMode)
 *  4 originations: pendingOriginations leave as hop-0 packets (dead origin: NODE_DOWN)
 *  5 inbox per node, (priority, seq) order; dead nodes drop NODE_DOWN; CONGESTION past capacity
 *  6 expiry and store-and-forward, every node alive or not: stored entries past their TTL
 *    drop (TTL_EXPIRED) and request views of expired requests are pruned; the store is
 *    flushed to new neighbours only while the node is alive AND its current policy has
 *    storeAndForward (back in PEACE it holds the buffer until TTL, diagram 06); then every
 *    transaction whose request expired closes (TX_CLOSED, no CLOSE message)
 *  7 buffer swap (inbox <- nextInbox)
 *  8 metrics, transit ring
 * Every loop runs over state.nodes in id order. Transits pending from dispatch
 * (authority injection) are emitted first. The event log is FIFO-trimmed to
 * config.eventLogCap before the tick (so TickResult.events stays exact) and after it (so
 * the log never rests above the cap).
 */
export function runTick(state: EngineState): TickResult {
  state.tick += 1;
  const tick = state.tick;
  trimEventLog(state);
  const firstEvent = state.eventLog.length;
  const transits: TransitEvent[] = state.pendingTransits;
  state.pendingTransits = [];

  // 1 mobility
  if (state.config.mobility.enabled) moveTravellers(state);

  // 2 liveness + adjacency
  refreshTopology(state);

  // 3 mode machine
  evaluateModes(state);

  // 4 originations
  originate(state, transits);

  // 5 inbox processing
  for (const node of state.nodes) processInbox(state, node, transits);

  // 6 expiry and store-and-forward
  for (const node of state.nodes) {
    expireStores(state, node);
    pruneExpiredRequestViews(state, node);
    if (node.alive && MODE_POLICIES[node.mode].storeAndForward) flushStores(state, node, transits);
  }
  closeExpiredTransactions(state);

  // 7 swap
  for (const node of state.nodes) {
    node.inbox = node.nextInbox;
    node.nextInbox = [];
  }

  // 8 metrics and bookkeeping
  let storedTotal = 0;
  for (const node of state.nodes) storedTotal += node.store.length;
  state.metrics.setTick({ storedTotal, transitsThisTick: transits.length });
  if (state.declarations.some((d) => d.untilTick <= tick)) {
    state.declarations = state.declarations.filter((d) => d.untilTick > tick);
  }

  const result: TickResult = { tick, transits, events: state.eventLog.slice(firstEvent) };
  trimEventLog(state);
  state.lastTick = result;
  state.transitRing[tick % TRANSIT_RING_SIZE] = { tick, transits };
  return result;
}
