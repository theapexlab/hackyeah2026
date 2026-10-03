/**
 * Snapshot: the complete immutable view of engine state at a tick.
 * JSON-safe (no Set/Map). Same ref until next step/dispatch.
 */

import type { TransitEvent } from './events';
import type { MessageId, NodeId } from './ids';
import type { MessageClass, Mode } from './mode';
import type { MessageView, NodeView } from './node';

export interface EdgeView {
  a: NodeId;
  b: NodeId;
  quality: 'near' | 'medium' | 'far';
}

export interface MetricsView {
  reachableFraction: number;
  authorityReachableFraction: number;
  componentCount: number;
  storedTotal: number;
  transitsThisTick: number;
  deliveriesByClass: Record<MessageClass, number>;
  dropsByReason: Record<string, number>;
  medianHops: number;
  medianLatency: number;
}

export interface Snapshot {
  tick: number;
  world: {
    seed: number | string;
    width: number;
    height: number;
    cellsUp: boolean;
    gridUp: boolean;
    mobility: {
      enabled: boolean;
      stepMetres: number;
    };
  };
  nodes: NodeView[];
  edges: EdgeView[];
  transits: TransitEvent[];
  messages: MessageView[];
  transactions: Array<{
    requestId: MessageId;
    status: 'open' | 'accepted' | 'closed';
  }>;
  declarations: Array<{
    id: string;
    level: Mode;
    untilTick: number;
    forged: boolean;
  }>;
  authority: {
    received: Array<{
      msgId: MessageId;
      tick: number;
      via: string;
    }>;
  };
  metrics: MetricsView;
  recentEvents: Array<{
    type: string;
    tick: number;
    [key: string]: unknown;
  }>;
}
