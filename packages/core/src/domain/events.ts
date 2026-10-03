import type { Command } from './commands';
import type { MessageId, NodeId } from './ids';
import type { MessageClass } from './message';
import type { Mode } from './mode';
import type { ModeSource } from './node';

/** Every reason a node drops a packet, one per branch of the forwarding decision. */
export const DROP_REASONS = [
  'UNVERIFIABLE',
  'DUPLICATE',
  'RELAY_CANNOT_ACT',
  'CLASS_NOT_ALLOWED',
  'PRICED_IN_EMERGENCY',
  'TTL_EXPIRED',
  'HOP_LIMIT',
  'OUT_OF_REGION',
  'NO_ROUTE',
  'CONGESTION',
  'NODE_DOWN',
] as const;
export type DropReason = (typeof DROP_REASONS)[number];

/** How a packet moved between two nodes. */
export type TransitVia = 'hop' | 'store-flush' | 'authority-inject' | 'uplink';

/** A packet crossed one edge during a tick; the UI animates these. */
export interface TransitEvent {
  readonly tick: number;
  readonly msgId: MessageId;
  readonly class: MessageClass;
  readonly from: NodeId;
  readonly to: NodeId;
  readonly hop: number;
  readonly via: TransitVia;
}

/** Everything observable that happened in the engine, discriminated on `type`. */
export type SimEvent =
  | { readonly type: 'COMMAND'; readonly tick: number; readonly command: Command }
  | {
      readonly type: 'ORIGINATED';
      readonly tick: number;
      readonly msgId: MessageId;
      readonly nodeId: NodeId;
      readonly class: MessageClass;
    }
  | {
      readonly type: 'DELIVERED';
      readonly tick: number;
      readonly msgId: MessageId;
      readonly nodeId: NodeId;
      readonly class: MessageClass;
      readonly hop: number;
    }
  | {
      readonly type: 'DROPPED';
      readonly tick: number;
      readonly msgId: MessageId;
      readonly nodeId: NodeId;
      readonly class: MessageClass;
      readonly reason: DropReason;
    }
  | {
      readonly type: 'STORED';
      readonly tick: number;
      readonly msgId: MessageId;
      readonly nodeId: NodeId;
    }
  | {
      readonly type: 'STORE_FLUSHED';
      readonly tick: number;
      readonly msgId: MessageId;
      readonly nodeId: NodeId;
      readonly to: NodeId;
    }
  | {
      readonly type: 'MODE_CHANGED';
      readonly tick: number;
      readonly nodeId: NodeId;
      readonly from: Mode;
      readonly to: Mode;
      readonly source: ModeSource;
    }
  | {
      readonly type: 'TX_OPENED';
      readonly tick: number;
      readonly requestId: MessageId;
      readonly nodeId: NodeId;
    }
  | {
      readonly type: 'TX_ACCEPTED';
      readonly tick: number;
      readonly requestId: MessageId;
      readonly nodeId: NodeId;
      readonly accepterId: NodeId;
    }
  | {
      readonly type: 'TX_CLOSED';
      readonly tick: number;
      readonly requestId: MessageId;
      readonly nodeId: NodeId;
    }
  | {
      readonly type: 'TX_RESPONSE_LATE';
      readonly tick: number;
      readonly requestId: MessageId;
      readonly nodeId: NodeId;
      readonly responderId: NodeId;
    }
  | {
      readonly type: 'AUTHORITY_RECEIVED';
      readonly tick: number;
      readonly msgId: MessageId;
      readonly via: NodeId;
      readonly class: MessageClass;
    }
  | {
      readonly type: 'AUTHORITY_INJECTED';
      readonly tick: number;
      readonly msgId: MessageId;
      readonly class: MessageClass;
      readonly count: number;
    }
  | {
      readonly type: 'ADJACENCY';
      readonly tick: number;
      readonly version: number;
      readonly edges: number;
      readonly components: number;
    }
  | {
      readonly type: 'AUTO_RESPOND_NONE';
      readonly tick: number;
      readonly requestId: MessageId | null;
    };

export type SimEventType = SimEvent['type'];
