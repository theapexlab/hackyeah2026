import type { DropReason } from '../domain/events';
import { DROP_REASONS } from '../domain/events';
import type { MessageId, NodeId } from '../domain/ids';
import type { MessageClass } from '../domain/message';
import { MESSAGE_CLASSES } from '../domain/message';
import type { ClassMetrics, MetricsView } from '../domain/snapshot';

/** Topology-derived numbers, recomputed by the engine whenever adjacency changes. */
export interface TopologyMetrics {
  readonly reachableFraction: number;
  readonly authorityReachableFraction: number;
  readonly componentCount: number;
}

/** Per-tick gauges. */
export interface TickMetrics {
  readonly storedTotal: number;
  readonly transitsThisTick: number;
}

interface MutableClassMetrics {
  originated: number;
  delivered: number;
  uniqueReached: number;
  dropped: number;
}

function zeroByClass(): Record<MessageClass, MutableClassMetrics> {
  const out = {} as Record<MessageClass, MutableClassMetrics>;
  for (const cls of MESSAGE_CLASSES) {
    out[cls] = { originated: 0, delivered: 0, uniqueReached: 0, dropped: 0 };
  }
  return out;
}

function zeroDrops(): Record<DropReason, number> {
  const out = {} as Record<DropReason, number>;
  for (const reason of DROP_REASONS) out[reason] = 0;
  return out;
}

/**
 * Median of an integer histogram (value -> count). Even totals average the two middle
 * values. Null for an empty histogram.
 */
export function medianOfHistogram(hist: ReadonlyMap<number, number>): number | null {
  let total = 0;
  for (const count of hist.values()) total += count;
  if (total === 0) return null;
  const keys = [...hist.keys()].sort((a, b) => a - b);
  const lo = Math.floor((total - 1) / 2);
  const hi = Math.floor(total / 2);
  let cumulative = 0;
  let loValue: number | null = null;
  for (const key of keys) {
    cumulative += hist.get(key) ?? 0;
    if (loValue === null && cumulative > lo) loValue = key;
    if (cumulative > hi) return loValue === null ? key : (loValue + key) / 2;
  }
  return null;
}

/**
 * Accumulates the live metrics (FR-SIM-06). The engine calls the onX() / setX() methods as
 * things happen and reads `view()` when it builds a snapshot. `view()` returns the
 * same object until something changes, so React can rely on referential equality.
 *
 * Hop and latency histograms are fed at the FIRST delivery per (msgId, nodeId) only;
 * `delivered` counts every delivery, `uniqueReached` only the first.
 */
export class MetricsState {
  private readonly byClass: Record<MessageClass, MutableClassMetrics> = zeroByClass();
  private readonly dropsByReason: Record<DropReason, number> = zeroDrops();
  private readonly hopHist = new Map<number, number>();
  private readonly latencyHist = new Map<number, number>();
  private readonly reached = new Set<string>();
  private topology: TopologyMetrics = {
    reachableFraction: 0,
    authorityReachableFraction: 0,
    componentCount: 0,
  };
  private tickStats: TickMetrics = { storedTotal: 0, transitsThisTick: 0 };
  private totals = { originated: 0, delivered: 0, dropped: 0 };
  private cache: MetricsView | null = null;

  /** Back to the emptyMetrics() shape. */
  reset(): void {
    for (const cls of MESSAGE_CLASSES) {
      const entry = this.byClass[cls];
      entry.originated = 0;
      entry.delivered = 0;
      entry.uniqueReached = 0;
      entry.dropped = 0;
    }
    for (const reason of DROP_REASONS) this.dropsByReason[reason] = 0;
    this.hopHist.clear();
    this.latencyHist.clear();
    this.reached.clear();
    this.topology = { reachableFraction: 0, authorityReachableFraction: 0, componentCount: 0 };
    this.tickStats = { storedTotal: 0, transitsThisTick: 0 };
    this.totals = { originated: 0, delivered: 0, dropped: 0 };
    this.cache = null;
  }

  onOriginated(cls: MessageClass): void {
    this.byClass[cls].originated++;
    this.totals.originated++;
    this.cache = null;
  }

  /**
   * A packet was accepted and acted on at `nodeId`. `latencyTicks` is
   * tick - message.createdTick.
   */
  onDelivered(
    cls: MessageClass,
    msgId: MessageId,
    nodeId: NodeId,
    hop: number,
    latencyTicks: number,
  ): void {
    const entry = this.byClass[cls];
    entry.delivered++;
    this.totals.delivered++;
    const key = `${msgId}|${nodeId}`;
    if (!this.reached.has(key)) {
      this.reached.add(key);
      entry.uniqueReached++;
      this.hopHist.set(hop, (this.hopHist.get(hop) ?? 0) + 1);
      this.latencyHist.set(latencyTicks, (this.latencyHist.get(latencyTicks) ?? 0) + 1);
    }
    this.cache = null;
  }

  onDropped(cls: MessageClass, reason: DropReason): void {
    this.byClass[cls].dropped++;
    this.dropsByReason[reason]++;
    this.totals.dropped++;
    this.cache = null;
  }

  /** No-op (view reference kept) when the values are unchanged. */
  setTopology(t: TopologyMetrics): void {
    const cur = this.topology;
    if (
      cur.reachableFraction === t.reachableFraction &&
      cur.authorityReachableFraction === t.authorityReachableFraction &&
      cur.componentCount === t.componentCount
    ) {
      return;
    }
    this.topology = { ...t };
    this.cache = null;
  }

  /** No-op (view reference kept) when the values are unchanged. */
  setTick(t: TickMetrics): void {
    const cur = this.tickStats;
    if (cur.storedTotal === t.storedTotal && cur.transitsThisTick === t.transitsThisTick) return;
    this.tickStats = { ...t };
    this.cache = null;
  }

  /** Immutable view; same reference until the next change. */
  view(): MetricsView {
    if (this.cache !== null) return this.cache;
    const byClass = {} as Record<MessageClass, ClassMetrics>;
    for (const cls of MESSAGE_CLASSES) byClass[cls] = { ...this.byClass[cls] };
    const view: MetricsView = {
      byClass,
      dropsByReason: { ...this.dropsByReason },
      medianHops: medianOfHistogram(this.hopHist),
      medianLatency: medianOfHistogram(this.latencyHist),
      reachableFraction: this.topology.reachableFraction,
      authorityReachableFraction: this.topology.authorityReachableFraction,
      componentCount: this.topology.componentCount,
      storedTotal: this.tickStats.storedTotal,
      transitsThisTick: this.tickStats.transitsThisTick,
      totals: { ...this.totals },
    };
    this.cache = view;
    return view;
  }
}
