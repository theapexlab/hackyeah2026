import type { AutoRespondStrategy } from '../domain/commands';
import type { MessageId, NodeId } from '../domain/ids';
import type { Message, Payload } from '../domain/message';
import { MODE_POLICIES } from '../domain/mode';
import type { Node } from '../domain/node';
import type { RequestViewEntry, Transaction } from '../domain/transaction';
import { createMessage, queueOrigination } from './originate';
import type { EngineState } from './state';
import { logEvent } from './state';

type ClosePayload = Extract<Payload, { kind: 'CLOSE' }>;

/** Open a transaction for a verified REQUEST at its origination (TX_OPENED). */
export function openTransaction(state: EngineState, msg: Message): Transaction {
  const tx: Transaction = {
    requestId: msg.id,
    requesterId: msg.originId,
    class: msg.class,
    openedTick: state.tick,
    status: 'open',
    accepterId: null,
    acceptedTick: null,
    closedTick: null,
    responses: 0,
  };
  state.transactions.set(msg.id, tx);
  logEvent(state, { type: 'TX_OPENED', tick: state.tick, requestId: msg.id, nodeId: msg.originId });
  return tx;
}

/**
 * Close a transaction now (TX_CLOSED) and queue the CLOSE message at the requester. The
 * CLOSE inherits the request's class and hop limit so it floods the same radius; its
 * accepterId is the accepter, or the requester itself when nobody had accepted.
 */
export function closeTransaction(state: EngineState, tx: Transaction): void {
  tx.status = 'closed';
  tx.closedTick = state.tick;
  logEvent(state, {
    type: 'TX_CLOSED',
    tick: state.tick,
    requestId: tx.requestId,
    nodeId: tx.requesterId,
  });
  const requester = state.byId.get(tx.requesterId);
  if (requester === undefined) return;
  const request = state.messages.get(tx.requestId);
  const msg = createMessage(
    state,
    requester,
    tx.class,
    { kind: 'CLOSE', requestId: tx.requestId, accepterId: tx.accepterId ?? tx.requesterId },
    request === undefined ? {} : { hopLimit: request.hopLimit },
  );
  queueOrigination(requester, msg);
}

/**
 * A RESPONSE was delivered at its target (the requester). The first one accepts the
 * transaction (TX_ACCEPTED) and, with cfg.autoConfirm, closes it at once; later ones are
 * TX_RESPONSE_LATE. Every response is counted in tx.responses.
 */
export function onResponseAtRequester(state: EngineState, node: Node, msg: Message): void {
  const payload = msg.payload;
  if (payload.kind !== 'RESPONSE') return;
  const tx = state.transactions.get(payload.requestId);
  if (tx === undefined) return;
  tx.responses += 1;
  if (tx.status === 'open') {
    tx.status = 'accepted';
    tx.accepterId = payload.responderId;
    tx.acceptedTick = state.tick;
    logEvent(state, {
      type: 'TX_ACCEPTED',
      tick: state.tick,
      requestId: tx.requestId,
      nodeId: node.id,
      accepterId: payload.responderId,
    });
    if (state.config.autoConfirm) closeTransaction(state, tx);
    return;
  }
  logEvent(state, {
    type: 'TX_RESPONSE_LATE',
    tick: state.tick,
    requestId: tx.requestId,
    nodeId: node.id,
    responderId: payload.responderId,
  });
}

/**
 * A CLOSE was delivered at `node`: its view of the request becomes 'taken', except for
 * the accepter ('accepted-by-me') and the requester ('mine'). Nodes that never saw the
 * request get no entry.
 */
export function onCloseSeen(state: EngineState, node: Node, payload: ClosePayload): void {
  const entry = node.requestView.get(payload.requestId);
  if (entry === undefined) return;
  const tx = state.transactions.get(payload.requestId);
  let status: RequestViewEntry['status'] = 'taken';
  if (node.id === payload.accepterId) status = 'accepted-by-me';
  else if (entry.status === 'mine' || tx?.requesterId === node.id) status = 'mine';
  node.requestView.set(payload.requestId, { ...entry, status });
}

/** Why an Accept was refused. */
export type AcceptRejection =
  | 'UNKNOWN_NODE'
  | 'NODE_DOWN'
  | 'NOT_CITIZEN_MOBILE'
  | 'UNKNOWN_REQUEST'
  | 'EXPIRED'
  | 'NOT_OPEN_HERE';

export type AcceptEligibility =
  | {
      readonly ok: true;
      readonly node: Node;
      readonly entry: RequestViewEntry;
      readonly request: Message;
    }
  | { readonly ok: false; readonly reason: AcceptRejection };

/**
 * Accept eligibility (plan A5): an alive citizen mobile whose own view of the request is
 * 'open' (so never the requester, whose view is 'mine', and never someone who already
 * saw the CLOSE), for a request still within its TTL (EXPIRED otherwise). The global
 * transaction status is NOT consulted: a node that has not seen the CLOSE yet may still
 * accept, and its response then arrives late.
 */
export function acceptEligibility(
  state: EngineState,
  nodeId: NodeId,
  requestId: MessageId,
): AcceptEligibility {
  const node = state.byId.get(nodeId);
  if (node === undefined) return { ok: false, reason: 'UNKNOWN_NODE' };
  if (!node.alive) return { ok: false, reason: 'NODE_DOWN' };
  if (node.kind !== 'mobile' || node.credential.kind !== 'citizen') {
    return { ok: false, reason: 'NOT_CITIZEN_MOBILE' };
  }
  const request = state.messages.get(requestId);
  if (request === undefined || request.payload.kind !== 'REQUEST') {
    return { ok: false, reason: 'UNKNOWN_REQUEST' };
  }
  if (request.createdTick + request.ttlTicks < state.tick) return { ok: false, reason: 'EXPIRED' };
  const entry = node.requestView.get(requestId);
  if (entry === undefined || entry.status !== 'open') return { ok: false, reason: 'NOT_OPEN_HERE' };
  return { ok: true, node, entry, request };
}

/**
 * Accept a request at an eligible node: the node's view becomes 'accepted-by-me' and a
 * RESPONSE (class inherited from the request) is queued with
 * returnPath = [node, ...reverse(recorded path)], so returnPath[0] is the responder and
 * the last element is the requester. The hop limit is max(request.hopLimit, the node
 * policy's maxHopLimit): the request's budget always covers the recorded return path, the
 * policy max keeps flood-fallback headroom.
 */
export function accept(
  state: EngineState,
  node: Node,
  entry: RequestViewEntry,
  request: Message,
): Message {
  node.requestView.set(request.id, { ...entry, status: 'accepted-by-me' });
  const recorded = entry.path ?? [];
  const returnPath: NodeId[] = [node.id, ...[...recorded].reverse()];
  const msg = createMessage(
    state,
    node,
    request.class,
    {
      kind: 'RESPONSE',
      requestId: request.id,
      responderId: node.id,
      targetId: request.originId,
      returnPath,
    },
    { hopLimit: Math.max(request.hopLimit, MODE_POLICIES[node.mode].maxHopLimit) },
  );
  queueOrigination(node, msg);
  return msg;
}

/** Nodes (in id order) that could Accept `requestId` right now, with their view entries. */
export function eligibleResponders(
  state: EngineState,
  requestId: MessageId,
): { readonly node: Node; readonly entry: RequestViewEntry }[] {
  const out: { node: Node; entry: RequestViewEntry }[] = [];
  for (const node of state.nodes) {
    const e = acceptEligibility(state, node.id, requestId);
    if (e.ok) out.push({ node: e.node, entry: e.entry });
  }
  return out;
}

/**
 * Pick the responder for AutoRespond. 'nearest-hops' sorts by (hop, id) and takes the
 * first; 'random' draws one with the PRNG (one draw, only when candidates exist).
 * Null when nobody is eligible.
 */
export function pickResponder(
  state: EngineState,
  requestId: MessageId,
  strategy: AutoRespondStrategy,
): Node | null {
  const candidates = eligibleResponders(state, requestId);
  if (candidates.length === 0) return null;
  if (strategy === 'random') return state.prng.pick(candidates).node;
  candidates.sort((a, b) => {
    if (a.entry.hop !== b.entry.hop) return a.entry.hop - b.entry.hop;
    if (a.node.id < b.node.id) return -1;
    if (a.node.id > b.node.id) return 1;
    return 0;
  });
  const first = candidates[0];
  return first === undefined ? null : first.node;
}

/**
 * Open transactions whose request is still within its TTL, ordered by
 * (openedTick, request seq): the oldest first.
 */
export function openTransactionsOldestFirst(state: EngineState): Transaction[] {
  const open: Transaction[] = [];
  for (const tx of state.transactions.values()) {
    if (tx.status === 'open' && !requestExpired(state, tx.requestId)) open.push(tx);
  }
  open.sort((a, b) => {
    if (a.openedTick !== b.openedTick) return a.openedTick - b.openedTick;
    const sa = state.messages.get(a.requestId)?.seq ?? 0;
    const sb = state.messages.get(b.requestId)?.seq ?? 0;
    return sa - sb;
  });
  return open;
}

/** True when the request message is gone or past its TTL at the current tick. */
export function requestExpired(state: EngineState, requestId: MessageId): boolean {
  const msg = state.messages.get(requestId);
  return msg === undefined || msg.createdTick + msg.ttlTicks < state.tick;
}

/**
 * Drop a node's request views whose request is missing or past its TTL. Runs for every
 * node, alive or not, so openRequests badges and the per-node map never outlive the
 * request.
 */
export function pruneExpiredRequestViews(state: EngineState, node: Node): void {
  if (node.requestView.size === 0) return;
  const stale: MessageId[] = [];
  for (const requestId of node.requestView.keys()) {
    if (requestExpired(state, requestId)) stale.push(requestId);
  }
  for (const requestId of stale) node.requestView.delete(requestId);
}

/**
 * Close every not-yet-closed transaction whose request has expired: status 'closed',
 * closedTick = now, TX_CLOSED at the requester. No CLOSE message is originated (nobody
 * can accept an expired request and every view of it is pruned the same tick).
 * Iterates in creation order, so the events are deterministic.
 */
export function closeExpiredTransactions(state: EngineState): void {
  for (const tx of state.transactions.values()) {
    if (tx.status === 'closed' || !requestExpired(state, tx.requestId)) continue;
    tx.status = 'closed';
    tx.closedTick = state.tick;
    logEvent(state, {
      type: 'TX_CLOSED',
      tick: state.tick,
      requestId: tx.requestId,
      nodeId: tx.requesterId,
    });
  }
}
