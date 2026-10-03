/**
 * Engine commands: all state mutations triggered by the UI.
 */

import type { WorldConfig } from './config';
import type { MessageId, NodeId } from './ids';
import type { Circle } from './message';
import type { MessageClass, Mode } from './mode';

export type Command =
  | {
      type: 'RESET_WORLD';
      world: WorldConfig;
    }
  | {
      type: 'SET_CELLS_UP';
      up: boolean;
    }
  | {
      type: 'SET_GRID_UP';
      up: boolean;
    }
  | {
      type: 'SET_NODE_POWERED';
      nodeId: NodeId;
      powered: boolean | null;
    }
  | {
      type: 'MOVE_NODE';
      nodeId: NodeId;
      x: number;
      y: number;
    }
  | {
      type: 'SET_MOBILITY';
      enabled: boolean;
      stepMetres?: number;
    }
  | {
      type: 'SET_CONFIG';
      patch: Record<string, unknown>;
    }
  | {
      type: 'DECLARE_MODE';
      level: Mode;
      region?: Circle;
      durationTicks?: number;
      forged?: boolean;
    }
  | {
      type: 'ALL_CLEAR';
      region?: Circle;
      forged?: boolean;
    }
  | {
      type: 'BROADCAST_ALERT';
      text: string;
      region?: Circle;
      forged?: boolean;
    }
  | {
      type: 'SEND_REQUEST';
      from: NodeId;
      class: MessageClass;
      text: string;
      /** Optional structured payload (takes precedence over `text`). */
      payload?: { text?: string; category?: string; price?: number };
      category?: string;
      price?: number;
      hopLimit?: number;
      region?: Circle;
      forge?: {
        claimKind: string;
      };
    }
  | {
      type: 'SEND_CHECK_IN';
      from: NodeId;
      status: 'OK' | 'NEED_EVACUATION' | 'TRAPPED';
    }
  | {
      type: 'SEND_RANDOM_REQUEST';
      from?: NodeId;
    }
  | {
      type: 'ACCEPT';
      nodeId: NodeId;
      requestId: MessageId;
    }
  | {
      type: 'AUTO_RESPOND';
      requestId?: MessageId;
      strategy: 'nearest-hops' | 'random';
    }
  | {
      type: 'CLOSE';
      requestId: MessageId;
    }
  | {
      type: 'SET_RANGE';
      kind: 'mobile' | 'router' | 'gateway';
      range: number;
    }
  | {
      type: 'SET_PARTICIPATION';
      fraction: number;
    };
