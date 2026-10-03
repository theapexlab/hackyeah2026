/**
 * Transaction state machine and management.
 */

import type { SimEvent } from '../domain/events';
import type { MessageId, NodeId } from '../domain/ids';
import { nodeIdFromString } from '../domain/ids';
import type { Transaction, TransactionStatus } from '../domain/transaction';

export interface TransactionMap {
  byRequestId: Map<MessageId, Transaction>;
}

export function createTransactionMap(): TransactionMap {
  return { byRequestId: new Map() };
}

export function openTransaction(
  txMap: TransactionMap,
  requestId: MessageId,
  tick: number,
  events: SimEvent[],
): void {
  if (!txMap.byRequestId.has(requestId)) {
    const tx: Transaction = {
      requestId,
      status: 'open',
      openedAtTick: tick,
    };
    txMap.byRequestId.set(requestId, tx);
    events.push({
      type: 'TX_OPENED',
      tick,
      requestId,
      from: nodeIdFromString('m-000'), // Will be set by caller
    });
  }
}

export function acceptTransaction(
  txMap: TransactionMap,
  requestId: MessageId,
  acceptedBy: NodeId,
  tick: number,
  events: SimEvent[],
): boolean {
  const tx = txMap.byRequestId.get(requestId);
  if (!tx || tx.status !== 'open') {
    return false;
  }

  if (tx.status === 'open') {
    tx.status = 'accepted';
    tx.acceptedAtTick = tick;
    tx.acceptedBy = acceptedBy;
    events.push({
      type: 'TX_ACCEPTED',
      tick,
      requestId,
      acceptedBy,
    });
    return true;
  }

  // Already accepted
  events.push({
    type: 'TX_RESPONSE_LATE',
    tick,
    requestId,
    responderId: acceptedBy,
  });
  return false;
}

export function closeTransaction(
  txMap: TransactionMap,
  requestId: MessageId,
  tick: number,
  events: SimEvent[],
): void {
  const tx = txMap.byRequestId.get(requestId);
  if (tx && tx.status !== 'closed') {
    tx.status = 'closed';
    tx.closedAtTick = tick;
    events.push({
      type: 'TX_CLOSED',
      tick,
      requestId,
    });
  }
}

export function getTransactionStatus(
  txMap: TransactionMap,
  requestId: MessageId,
): TransactionStatus {
  const tx = txMap.byRequestId.get(requestId);
  return tx?.status ?? 'open';
}
