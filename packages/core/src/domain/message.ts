/**
 * Message types: the protocol payloads and their containers.
 */

import type { MessageId, NodeId } from './ids';
import type { CredentialKind, MessageClass } from './mode';

export interface Signer {
  nodeId: NodeId;
  credentialKind: CredentialKind;
  valid: boolean; // trust stub: signature verification
}

export type Payload =
  | {
      kind: 'REQUEST';
      text: string;
      category?: string;
      price?: number;
    }
  | {
      kind: 'RESPONSE';
      requestId: MessageId;
      responderId: NodeId;
      targetId: NodeId;
      returnPath: NodeId[];
    }
  | {
      kind: 'CLOSE';
      requestId: MessageId;
      accepterId: NodeId;
    }
  | {
      kind: 'CHECK_IN';
      status: 'OK' | 'NEED_EVACUATION' | 'TRAPPED';
    }
  | {
      kind: 'ALERT';
      text: string;
    }
  | {
      kind: 'MODE_DECLARATION';
      level: 'L1' | 'L2' | 'L3' | 'ALL_CLEAR';
      untilTick: number;
    };

export interface Message {
  id: MessageId;
  seq: number;
  class: MessageClass;
  payload: Payload;
  originId: NodeId;
  signer: Signer;
  createdTick: number;
  ttlTicks: number;
  hopLimit: number;
  region?: Circle;
}

export interface Packet {
  msgId: MessageId;
  hop: number;
  path: NodeId[];
  lastHop: NodeId | null;
  seq: number;
  routeCursor?: number;
}

export interface Circle {
  centerX: number;
  centerY: number;
  radiusMtres: number;
}
