import type { MessageId, NodeId } from './ids';
import type { CredentialKind } from './node';

/** Every protocol message class. TOPOLOGY and PORTAL_SUMMARY exist for policy tables only. */
export const MESSAGE_CLASSES = [
  'LEND',
  'BORROW',
  'GIVE',
  'INFO',
  'LIFE_CRITICAL',
  'SAFETY',
  'CHECK_IN',
  'OFFICIAL_ALERT',
  'MODE_DECLARATION',
  'TOPOLOGY',
  'PORTAL_SUMMARY',
] as const;
export type MessageClass = (typeof MESSAGE_CLASSES)[number];

/** Trust stub replacing a signature: who claims to have signed, and whether that claim holds. */
export interface Signer {
  readonly nodeId: NodeId;
  readonly credentialKind: CredentialKind;
  readonly valid: boolean;
}

/** Circular region in world metres. */
export interface Circle {
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

/** Citizen check-in status in emergency mode. */
export type CheckInStatus = 'OK' | 'NEED_EVACUATION' | 'TRAPPED';
/** Level carried by a MODE_DECLARATION payload. */
export type DeclarationLevel = 'L1' | 'L2' | 'L3' | 'ALL_CLEAR';

/** Message body, discriminated on `kind`. */
export type Payload =
  | {
      readonly kind: 'REQUEST';
      readonly text: string;
      readonly category?: string;
      readonly price?: number;
    }
  | {
      readonly kind: 'RESPONSE';
      readonly requestId: MessageId;
      readonly responderId: NodeId;
      readonly targetId: NodeId;
      readonly returnPath: readonly NodeId[];
    }
  | { readonly kind: 'CLOSE'; readonly requestId: MessageId; readonly accepterId: NodeId }
  | { readonly kind: 'CHECK_IN'; readonly status: CheckInStatus; readonly text?: string }
  | { readonly kind: 'ALERT'; readonly text: string }
  | {
      readonly kind: 'MODE_DECLARATION';
      readonly level: DeclarationLevel;
      readonly untilTick: number;
    }
  | { readonly kind: 'TOPOLOGY'; readonly neighbours: readonly NodeId[] };

export type PayloadKind = Payload['kind'];
export type RequestPayload = Extract<Payload, { kind: 'REQUEST' }>;

/**
 * Immutable message, one per id in the engine registry.
 * hopLimit is Number.POSITIVE_INFINITY for unbounded authority classes.
 */
export interface Message {
  readonly id: MessageId;
  readonly seq: number;
  readonly class: MessageClass;
  readonly payload: Payload;
  readonly originId: NodeId;
  readonly signer: Signer;
  readonly createdTick: number;
  readonly ttlTicks: number;
  readonly hopLimit: number;
  readonly region?: Circle;
}

/** One copy of a message in flight or in an inbox. */
export interface Packet {
  readonly msgId: MessageId;
  readonly hop: number;
  readonly path: readonly NodeId[];
  readonly lastHop: NodeId | null;
  /** Global monotonic enqueue counter; gives a total processing order. */
  readonly seq: number;
  /** For RESPONSE unicast along returnPath; undefined = flooding. */
  readonly routeCursor?: number;
}

/** Store-and-forward buffer entry (engine-internal). */
export interface StoredEntry {
  readonly msgId: MessageId;
  readonly packet: Packet;
  readonly storedTick: number;
  readonly sentTo: Set<NodeId>;
}

/** Readonly, JSON-safe projection of a message. Infinity is encoded as null + unbounded. */
export interface MessageView {
  readonly id: MessageId;
  readonly seq: number;
  readonly class: MessageClass;
  readonly payload: Payload;
  readonly originId: NodeId;
  readonly signer: Signer;
  readonly createdTick: number;
  readonly ttlTicks: number;
  readonly hopLimit: number | null;
  readonly unbounded: boolean;
  readonly region: Circle | null;
}

/** Project an internal Message into its JSON-safe view. */
export function toMessageView(msg: Message): MessageView {
  const unbounded = !Number.isFinite(msg.hopLimit);
  return {
    id: msg.id,
    seq: msg.seq,
    class: msg.class,
    payload: msg.payload,
    originId: msg.originId,
    signer: msg.signer,
    createdTick: msg.createdTick,
    ttlTicks: msg.ttlTicks,
    hopLimit: unbounded ? null : msg.hopLimit,
    unbounded,
    region: msg.region ?? null,
  };
}
