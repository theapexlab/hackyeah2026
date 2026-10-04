import type { SimEvent } from './events';
import type { MessageId, NodeId } from './ids';
import type { Message, MessageView, Packet, StoredEntry } from './message';
import type { Mode } from './mode';
import type { RequestViewEntry } from './transaction';

/** Physical node caste. The Authority is virtual and not a Node. */
export type NodeKind = 'mobile' | 'router' | 'gateway';
/** What the node's credential lets it originate. 'none' = unregistered relay-only device. */
export type CredentialKind = 'citizen' | 'relay' | 'authority' | 'none';
/** How a node reaches the Authority when alive. */
export type Backhaul = 'none' | 'cellular' | 'fibre' | 'satellite';
/** Why a node is in its current mode. */
export type ModeSource = 'local' | 'declared' | 'stepdown';
/** Emergency levels that can be declared. */
export type DeclaredLevel = 'L1' | 'L2' | 'L3';

/** Trust stub replacing real certificates. */
export interface Credential {
  readonly kind: CredentialKind;
}

/** An accepted, still-active declaration applied to a node. */
export interface DeclaredMode {
  level: DeclaredLevel;
  untilTick: number;
  declarationId: MessageId;
}

/** One stop on a walker's route; `node` is the street-graph node it stands on, if any. */
export interface Waypoint {
  readonly x: number;
  readonly y: number;
  readonly node: number | null;
  /** Ticks to stay once reached (0: walk straight on). */
  readonly dwellTicks: number;
}

/** How a traveller gets around. */
export type TravelMode = 'foot' | 'car';

/**
 * Where a traveller is in its cycle: moving (on a trip, or pausing in a park on the way),
 * lingering where it arrived, then ready to set off again in whichever mode needs someone.
 */
export type TripPhase = 'moving' | 'lingering' | 'ready';

/** A travelling mobile's state. */
export interface WalkState {
  /** Current mode while moving; the last one used while lingering or ready. */
  mode: TravelMode;
  phase: TripPhase;
  /** Pace multiplier for this trip (walker step, or car step). */
  speedFactor: number;
  /** Street-graph node the next trip starts from. */
  anchor: number;
  path: Waypoint[];
  /** Next waypoint in `path`; the trip is over when it reaches path.length. */
  cursor: number;
  /** Stays put while tick < dwellUntilTick. */
  dwellUntilTick: number;
}

/** Mutable, engine-internal node state. Never exposed to the UI. */
export interface Node {
  readonly id: NodeId;
  readonly kind: NodeKind;
  x: number;
  y: number;
  range: number;
  credential: Credential;
  backhaul: Backhaul;
  batteryBacked: boolean;
  /** Travel state; null for nodes that stay put. */
  walk: WalkState | null;
  /** Per-node power override; null = derived from world grid state. */
  poweredOverride: boolean | null;
  // derived every tick
  alive: boolean;
  wanUp: boolean;
  hasBackhaul: boolean;
  // mode machine
  mode: Mode;
  modeSource: ModeSource;
  declared: DeclaredMode | null;
  l1HoldUntilTick: number;
  ticksWithoutWan: number;
  ticksWithWan: number;
  // protocol state (double-buffered inbox gives one hop per tick)
  inbox: Packet[];
  nextInbox: Packet[];
  seen: Set<MessageId>;
  /** FIFO of seen ids for seenCap eviction. */
  seenOrder: MessageId[];
  store: StoredEntry[];
  requestView: Map<MessageId, RequestViewEntry>;
  neighbourIds: NodeId[];
  prevNeighbourIds: NodeId[];
  /** Messages queued by dispatch, originated at the next tick. */
  pendingOriginations: Message[];
}

/** Readonly, JSON-safe projection of a node for rendering. */
export interface NodeView {
  readonly id: NodeId;
  readonly kind: NodeKind;
  readonly x: number;
  readonly y: number;
  readonly range: number;
  readonly credentialKind: CredentialKind;
  readonly backhaul: Backhaul;
  readonly batteryBacked: boolean;
  /** On the move right now (walking or driving); null when standing still. */
  readonly travel: TravelMode | null;
  readonly poweredOverride: boolean | null;
  readonly alive: boolean;
  readonly wanUp: boolean;
  readonly hasBackhaul: boolean;
  readonly mode: Mode;
  readonly modeSource: ModeSource;
  readonly declaredLevel: DeclaredLevel | null;
  readonly componentId: number;
  readonly neighbourCount: number;
  readonly inboxSize: number;
  readonly storeSize: number;
  readonly openRequests: number;
}

/** One packet waiting in a node's inbox, as shown in the inspector. */
export interface InboxEntryView {
  readonly message: MessageView;
  readonly hop: number;
  readonly path: readonly NodeId[];
  readonly lastHop: NodeId | null;
}

/** One store-and-forward entry, as shown in the inspector. */
export interface StoreEntryView {
  readonly message: MessageView;
  readonly hop: number;
  readonly storedTick: number;
  readonly sentTo: readonly NodeId[];
}

/** On-demand detail for one node (engine.getNodeDetail). Not part of the snapshot. */
export interface NodeDetail {
  readonly id: NodeId;
  readonly inbox: readonly InboxEntryView[];
  readonly store: readonly StoreEntryView[];
  readonly requests: readonly RequestViewEntry[];
  readonly seenCount: number;
  readonly log: readonly SimEvent[];
}
