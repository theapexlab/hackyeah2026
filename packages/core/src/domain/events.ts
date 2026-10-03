/**
 * Events: transits and simulation state changes.
 * Transit events track message movement per edge per tick.
 * SimEvents are discriminated union of all engine state transitions.
 */

import type { Command } from './commands';
import type { MessageId, NodeId } from './ids';
import type { MessageClass, Mode } from './mode';

export interface TransitEvent {
  tick: number;
  msgId: MessageId;
  class: MessageClass;
  from: NodeId;
  to: NodeId;
  hop: number;
  via: 'hop' | 'store-flush' | 'authority-inject' | 'uplink';
}

export type DropReason =
  | 'UNVERIFIABLE'
  | 'DUPLICATE'
  | 'RELAY_CANNOT_ACT'
  | 'CLASS_NOT_ALLOWED'
  | 'PRICED_IN_EMERGENCY'
  | 'TTL_EXPIRED'
  | 'HOP_LIMIT'
  | 'OUT_OF_REGION'
  | 'NO_ROUTE'
  | 'CONGESTION'
  | 'NODE_DOWN';

export type SimEvent =
  | {
      type: 'COMMAND';
      tick: number;
      command: Command;
    }
  | {
      type: 'ORIGINATED';
      tick: number;
      msgId: MessageId;
      class: MessageClass;
      originId: NodeId;
    }
  | {
      type: 'DELIVERED';
      tick: number;
      msgId: MessageId;
      class: MessageClass;
      to: NodeId;
      hop: number;
    }
  | {
      type: 'DROPPED';
      tick: number;
      msgId: MessageId;
      class: MessageClass;
      at: NodeId;
      reason: DropReason;
      hop: number;
    }
  | {
      type: 'STORED';
      tick: number;
      msgId: MessageId;
      class: MessageClass;
      at: NodeId;
      hop: number;
    }
  | {
      type: 'STORE_FLUSHED';
      tick: number;
      msgId: MessageId;
      class: MessageClass;
      from: NodeId;
      to: NodeId;
    }
  | {
      type: 'MODE_CHANGED';
      tick: number;
      nodeId: NodeId;
      from: Mode;
      to: Mode;
      source: 'local' | 'declared' | 'stepdown';
    }
  | {
      type: 'TX_OPENED';
      tick: number;
      requestId: MessageId;
      from: NodeId;
    }
  | {
      type: 'TX_ACCEPTED';
      tick: number;
      requestId: MessageId;
      acceptedBy: NodeId;
    }
  | {
      type: 'TX_CLOSED';
      tick: number;
      requestId: MessageId;
    }
  | {
      type: 'TX_RESPONSE_LATE';
      tick: number;
      requestId: MessageId;
      responderId: NodeId;
    }
  | {
      type: 'AUTHORITY_RECEIVED';
      tick: number;
      msgId: MessageId;
      via: 'uplink';
    }
  | {
      type: 'AUTHORITY_INJECTED';
      tick: number;
      msgId: MessageId;
      to: NodeId;
    }
  | {
      type: 'ADJACENCY';
      tick: number;
      version: number;
    }
  | {
      type: 'AUTO_RESPOND_NONE';
      tick: number;
      requestId: MessageId;
    };
