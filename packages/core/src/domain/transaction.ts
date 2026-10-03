/**
 * Transaction state machine.
 */

import type { MessageId, NodeId } from './ids';

export type TransactionStatus = 'open' | 'accepted' | 'closed';

export interface Transaction {
  requestId: MessageId;
  status: TransactionStatus;
  openedAtTick: number;
  acceptedAtTick?: number;
  acceptedBy?: NodeId;
  closedAtTick?: number;
}

export interface Declaration {
  id: string;
  level: 'L1' | 'L2' | 'L3' | 'ALL_CLEAR';
  issuedAtTick: number;
  untilTick: number;
  forged: boolean;
}
