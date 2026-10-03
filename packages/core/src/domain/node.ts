/**
 * Node types: internal mutable state of the simulation.
 * One node per phone, router, or gateway.
 */

import type { MessageId, NodeId } from './ids';
import type { Message, Packet } from './message';
import type { CredentialKind, Mode } from './mode';

export type NodeKind = 'mobile' | 'router' | 'gateway';
export type BackhaulKind = 'none' | 'cellular' | 'fibre' | 'satellite';

export interface Credential {
  kind: CredentialKind;
}

export interface Node {
  // identity
  id: NodeId;
  kind: NodeKind;
  x: number;
  y: number;
  range: number;
  credential: Credential;

  // power and connectivity
  backhaul: BackhaulKind;
  batteryBacked: boolean;
  poweredOverride: boolean | null;
  participating: boolean;

  // derived each tick
  alive: boolean;
  wanUp: boolean;
  hasBackhaul: boolean;

  // mode state
  mode: Mode;
  modeSource: 'local' | 'declared' | 'stepdown';
  declared: {
    level: Mode;
    untilTick: number;
    declarationId: string;
  } | null;
  l1HoldUntilTick: number;
  ticksWithoutWan: number;
  ticksWithWan: number;

  // messaging
  inbox: Packet[];
  nextInbox: Packet[];
  seen: Set<MessageId>;
  store: Array<{
    msgId: MessageId;
    packet: Packet;
    sentTo: Set<NodeId>;
  }>;

  // transactions
  requestView: Map<
    MessageId,
    {
      status: 'open' | 'taken' | 'mine' | 'accepted-by-me';
      hop: number;
      path?: NodeId[];
    }
  >;

  // origination queue
  pendingOriginations: Message[];

  // topology
  neighbourIds: NodeId[];
}

export interface NodeView {
  id: NodeId;
  kind: NodeKind;
  x: number;
  y: number;
  range: number;
  credentialKind: CredentialKind;
  alive: boolean;
  wanUp: boolean;
  hasBackhaul: boolean;
  mode: Mode;
  modeSource: 'local' | 'declared' | 'stepdown';
  componentId: number;
  neighbourCount: number;
  inboxSize: number;
  storeSize: number;
  openRequests: number;
}

export interface NodeDetail {
  id: NodeId;
  kind: NodeKind;
  x: number;
  y: number;
  range: number;
  credentialKind: CredentialKind;
  alive: boolean;
  wanUp: boolean;
  hasBackhaul: boolean;
  mode: Mode;
  modeSource: 'local' | 'declared' | 'stepdown';
  backhaul: BackhaulKind;
  batteryBacked: boolean;
  poweredOverride: boolean | null;
  inbox: MessageView[];
  store: Array<{
    msgId: MessageId;
    hop: number;
    class: string;
  }>;
  requestView: Array<{
    msgId: MessageId;
    status: 'open' | 'taken' | 'mine' | 'accepted-by-me';
    hop: number;
  }>;
  nodeLog: string[];
}

export interface MessageView {
  id: MessageId;
  class: string;
  originId: NodeId;
  hop: number;
  /** Finite; `Number.MAX_SAFE_INTEGER` when `unbounded` (Infinity does not survive JSON). */
  hopLimit: number;
  unbounded: boolean;
  ttlRemaining: number;
  createdTick: number;
  ttlTicks: number;
  status?: string;
}
