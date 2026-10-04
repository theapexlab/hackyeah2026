import type { Terrain } from '../terrain/types';
import type { Command } from './commands';
import type { DropReason, SimEvent, TransitEvent } from './events';
import { DROP_REASONS } from './events';
import type { MessageId, NodeId } from './ids';
import type { Circle, MessageClass, MessageView } from './message';
import { MESSAGE_CLASSES } from './message';
import type { Mode } from './mode';
import type { DeclaredLevel, NodeView } from './node';
import type { TransactionView } from './transaction';

/** Signal quality bucket of an edge, by distance thirds of the smaller range. */
export type EdgeQuality = 'near' | 'medium' | 'far';

/** Radio adjacency between two nodes; a < b lexically. */
export interface EdgeView {
  readonly a: NodeId;
  readonly b: NodeId;
  readonly quality: EdgeQuality;
}

/** An active, verified declaration. */
export interface DeclarationView {
  readonly id: MessageId;
  readonly level: DeclaredLevel;
  readonly region: Circle | null;
  readonly fromTick: number;
  readonly untilTick: number;
}

/** A message that reached the Authority through a backhaul node. */
export interface AuthorityReceipt {
  readonly msgId: MessageId;
  readonly tick: number;
  readonly via: NodeId;
  readonly class: MessageClass;
  readonly originId: NodeId;
}

/** What the virtual Authority has seen and done. */
export interface AuthorityView {
  readonly received: readonly AuthorityReceipt[];
  readonly injected: number;
}

/** Per-class counters. */
export interface ClassMetrics {
  readonly originated: number;
  readonly delivered: number;
  readonly uniqueReached: number;
  readonly dropped: number;
}

/**
 * Live metrics (FR-SIM-06). Delivery counters, hop and latency medians count phones only
 * (people): routers and gateways relay, they are not an audience. Medians are null until at
 * least one delivery.
 */
export interface MetricsView {
  readonly byClass: Readonly<Record<MessageClass, ClassMetrics>>;
  readonly dropsByReason: Readonly<Record<DropReason, number>>;
  readonly medianHops: number | null;
  readonly medianLatency: number | null;
  readonly reachableFraction: number;
  readonly authorityReachableFraction: number;
  readonly componentCount: number;
  readonly storedTotal: number;
  readonly transitsThisTick: number;
  readonly totals: {
    readonly originated: number;
    readonly delivered: number;
    readonly dropped: number;
  };
  /** Phones in the world: the audience of alerts, declarations and check-ins. */
  readonly phones: number;
  /** Registered phones: the only ones that act on requests. */
  readonly citizenPhones: number;
}

/** World-level flags and dimensions. */
export interface WorldView {
  readonly seed: number;
  readonly width: number;
  readonly height: number;
  readonly cellsUp: boolean;
  readonly gridUp: boolean;
  readonly mobility: boolean;
  readonly nodeCount: number;
}

/**
 * Immutable, JSON-safe view of the whole simulation for rendering.
 * Same reference until the next step() or dispatch(); `edges` and `messages`
 * keep their reference until their own content changes.
 */
export interface Snapshot {
  readonly tick: number;
  readonly world: WorldView;
  /** The map (streets, parks, water); the same object until the world is rebuilt. */
  readonly terrain: Terrain;
  /** Highest mode among alive nodes. */
  readonly globalMode: Mode;
  readonly nodes: readonly NodeView[];
  readonly edges: readonly EdgeView[];
  /** Transits produced by the last step(). */
  readonly transits: readonly TransitEvent[];
  readonly messages: readonly MessageView[];
  readonly transactions: readonly TransactionView[];
  readonly declarations: readonly DeclarationView[];
  readonly authority: AuthorityView;
  readonly metrics: MetricsView;
  readonly recentEvents: readonly SimEvent[];
}

/** Returned by step(). */
export interface TickResult {
  readonly tick: number;
  readonly transits: readonly TransitEvent[];
  readonly events: readonly SimEvent[];
}

/** A dispatched command and the tick it was applied at; replay() consumes these. */
export interface CommandLogEntry {
  readonly tick: number;
  readonly command: Command;
}

/** Zeroed metrics with every class and drop reason present. */
export function emptyMetrics(): MetricsView {
  const byClass = {} as Record<MessageClass, ClassMetrics>;
  for (const cls of MESSAGE_CLASSES) {
    byClass[cls] = { originated: 0, delivered: 0, uniqueReached: 0, dropped: 0 };
  }
  const dropsByReason = {} as Record<DropReason, number>;
  for (const reason of DROP_REASONS) dropsByReason[reason] = 0;
  return {
    byClass,
    dropsByReason,
    medianHops: null,
    medianLatency: null,
    reachableFraction: 0,
    authorityReachableFraction: 0,
    componentCount: 0,
    storedTotal: 0,
    transitsThisTick: 0,
    totals: { originated: 0, delivered: 0, dropped: 0 },
    phones: 0,
    citizenPhones: 0,
  };
}
