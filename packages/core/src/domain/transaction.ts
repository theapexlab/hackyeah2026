import type { MessageId, NodeId } from './ids';
import type { MessageClass } from './message';

/** Lifecycle of a request: open -> accepted -> closed. */
export type TransactionStatus = 'open' | 'accepted' | 'closed';

/** Engine-internal transaction record, keyed by the request message id. */
export interface Transaction {
  readonly requestId: MessageId;
  readonly requesterId: NodeId;
  readonly class: MessageClass;
  readonly openedTick: number;
  status: TransactionStatus;
  accepterId: NodeId | null;
  acceptedTick: number | null;
  closedTick: number | null;
  /** Number of RESPONSE messages that reached the requester (including late ones). */
  responses: number;
}

/** Readonly projection of a transaction for the snapshot. */
export interface TransactionView {
  readonly requestId: MessageId;
  readonly requesterId: NodeId;
  readonly class: MessageClass;
  readonly openedTick: number;
  readonly status: TransactionStatus;
  readonly accepterId: NodeId | null;
  readonly acceptedTick: number | null;
  readonly closedTick: number | null;
  readonly responses: number;
}

/** How one node sees a request it has received. */
export type RequestViewStatus = 'open' | 'taken' | 'mine' | 'accepted-by-me';

/** Per-node view of a request (lives in Node.requestView and NodeDetail.requests). */
export interface RequestViewEntry {
  readonly requestId: MessageId;
  readonly status: RequestViewStatus;
  /** Hop distance at which this node first received the request (0 for the requester). */
  readonly hop: number;
  /**
   * Nodes the request passed through before reaching this node, origin first (empty for
   * the requester). A RESPONSE's returnPath is [this node, ...reverse(path)].
   */
  readonly path?: readonly NodeId[];
}
