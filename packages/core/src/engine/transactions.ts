/**
 * Transaction lifecycle: open -> accepted -> closed.
 * Request flood, Accept, RESPONSE unicast back, CLOSE flood; first accept wins, the rest see
 * 'taken' (CLOSE) or a late response.
 */

import type { MessageId, NodeId } from '../domain/ids';
import { formatMessageId } from '../domain/ids';
import type { Message } from '../domain/message';
import { MODE_POLICIES } from '../domain/mode';
import type { Node } from '../domain/node';
import { type EngineState, registerMessage, type Sink } from './state';

export function openTransaction(
  state: EngineState,
  sink: Sink,
  requestId: MessageId,
  originId: NodeId,
): void {
  if (state.txMap.has(requestId)) return;
  state.txMap.set(requestId, { requestId, status: 'open', openedAtTick: state.tick, originId });
  sink.events.push({ type: 'TX_OPENED', tick: state.tick, requestId, from: originId });
}

/** A RESPONSE reached the requester: first one accepts (and auto-confirms), later ones are late. */
export function handleResponse(
  state: EngineState,
  sink: Sink,
  requester: Node,
  requestId: MessageId,
  responderId: NodeId,
): void {
  const tx = state.txMap.get(requestId);
  if (!tx || tx.status !== 'open') {
    sink.events.push({ type: 'TX_RESPONSE_LATE', tick: state.tick, requestId, responderId });
    return;
  }
  tx.status = 'accepted';
  tx.acceptedAtTick = state.tick;
  tx.acceptedBy = responderId;
  sink.events.push({ type: 'TX_ACCEPTED', tick: state.tick, requestId, acceptedBy: responderId });
  if (state.engineConfig.autoConfirm) queueClose(state, requester, requestId);
}

/** The requester originates a CLOSE for an accepted transaction (leaves at the next tick). */
export function queueClose(state: EngineState, requester: Node, requestId: MessageId): boolean {
  const tx = state.txMap.get(requestId);
  const request = state.messageRegistry.get(requestId);
  if (!tx || tx.status !== 'accepted' || !request || !tx.acceptedBy) return false;
  const seq = state.messageSeq++;
  const close: Message = {
    id: formatMessageId(requester.id, seq),
    seq,
    class: request.class,
    payload: { kind: 'CLOSE', requestId, accepterId: tx.acceptedBy },
    originId: requester.id,
    signer: { nodeId: requester.id, credentialKind: requester.credential.kind, valid: true },
    createdTick: state.tick,
    ttlTicks: MODE_POLICIES[requester.mode].ttlTicks,
    hopLimit: request.hopLimit,
  };
  registerMessage(state, close);
  requester.pendingOriginations.push(close);
  return true;
}

export function closeTransaction(state: EngineState, sink: Sink, requestId: MessageId): void {
  const tx = state.txMap.get(requestId);
  if (!tx || tx.status === 'closed') return;
  tx.status = 'closed';
  tx.closedAtTick = state.tick;
  sink.events.push({ type: 'TX_CLOSED', tick: state.tick, requestId });
}

/** Alive citizen phones that currently see the request as open (never the requester). */
export function eligibleResponders(state: EngineState, requestId: MessageId): Node[] {
  const tx = state.txMap.get(requestId);
  return Array.from(state.nodes.values()).filter(
    (n) =>
      n.alive &&
      n.kind === 'mobile' &&
      n.credential.kind === 'citizen' &&
      n.id !== tx?.originId &&
      n.requestView.get(requestId)?.status === 'open',
  );
}

/**
 * Responder accepts: RESPONSE unicast back along the reversed path (flood fallback if broken).
 * Returns false when the node cannot accept.
 */
export function acceptRequest(state: EngineState, responder: Node, requestId: MessageId): boolean {
  const view = responder.requestView.get(requestId);
  const request = state.messageRegistry.get(requestId);
  if (!responder.alive || !view || view.status !== 'open' || request?.payload.kind !== 'REQUEST') {
    return false;
  }
  view.status = 'accepted-by-me';
  const seq = state.messageSeq++;
  const response: Message = {
    id: formatMessageId(responder.id, seq),
    seq,
    class: request.class,
    payload: {
      kind: 'RESPONSE',
      requestId,
      responderId: responder.id,
      targetId: request.originId,
      returnPath: [...(view.path ?? [])].reverse(),
    },
    originId: responder.id,
    signer: { nodeId: responder.id, credentialKind: responder.credential.kind, valid: true },
    createdTick: state.tick,
    ttlTicks: MODE_POLICIES[responder.mode].ttlTicks,
    hopLimit: request.hopLimit,
  };
  registerMessage(state, response);
  responder.pendingOriginations.push(response);
  return true;
}
