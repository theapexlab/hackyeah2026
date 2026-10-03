/**
 * Metrics calculation.
 * Tracks per-class counters, drops by reason, and hop / latency histograms at first delivery
 * per (message, node).
 */

import type { DropReason } from '../domain/events';
import type { MessageId } from '../domain/ids';
import type { MessageClass } from '../domain/mode';
import type { ClassMetricsView } from '../domain/snapshot';

export const ALL_CLASSES: MessageClass[] = [
  'LEND',
  'BORROW',
  'GIVE',
  'SELL',
  'INFO',
  'LIFE_CRITICAL',
  'SAFETY',
  'CHECK_IN',
  'OFFICIAL_ALERT',
  'MODE_DECLARATION',
  'TOPOLOGY',
  'PORTAL_SUMMARY',
];

export interface MetricsCollector {
  byClass: Map<MessageClass, ClassMetricsView>;
  reachedMessages: Set<MessageId>;
  dropsByReason: Map<DropReason, number>;
  hopHistogram: Map<number, number>;
  latencyHistogram: Map<number, number>;
}

export function createMetrics(): MetricsCollector {
  return {
    byClass: new Map(
      ALL_CLASSES.map((c) => [
        c,
        { originated: 0, deliveries: 0, uniqueReached: 0, dropped: 0 } as ClassMetricsView,
      ]),
    ),
    reachedMessages: new Set(),
    dropsByReason: new Map(),
    hopHistogram: new Map(),
    latencyHistogram: new Map(),
  };
}

export function recordOriginated(m: MetricsCollector, cls: MessageClass): void {
  m.byClass.get(cls)!.originated++;
}

export function recordDelivery(
  m: MetricsCollector,
  msgId: MessageId,
  cls: MessageClass,
  hops: number,
  latency: number,
): void {
  const c = m.byClass.get(cls)!;
  c.deliveries++;
  if (!m.reachedMessages.has(msgId)) {
    m.reachedMessages.add(msgId);
    c.uniqueReached++;
  }
  m.hopHistogram.set(hops, (m.hopHistogram.get(hops) ?? 0) + 1);
  m.latencyHistogram.set(latency, (m.latencyHistogram.get(latency) ?? 0) + 1);
}

export function recordDrop(m: MetricsCollector, cls: MessageClass, reason: DropReason): void {
  m.byClass.get(cls)!.dropped++;
  m.dropsByReason.set(reason, (m.dropsByReason.get(reason) ?? 0) + 1);
}

export function histogramMedian(hist: Map<number, number>): number {
  const total = Array.from(hist.values()).reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  const keys = Array.from(hist.keys()).sort((a, b) => a - b);
  const at = (rank: number) => {
    let seen = 0;
    for (const k of keys) {
      seen += hist.get(k)!;
      if (seen > rank) return k;
    }
    return keys[keys.length - 1]!;
  };
  return total % 2 === 1 ? at((total - 1) / 2) : (at(total / 2 - 1) + at(total / 2)) / 2;
}

export const medianHops = (m: MetricsCollector): number => histogramMedian(m.hopHistogram);
export const medianLatency = (m: MetricsCollector): number => histogramMedian(m.latencyHistogram);
