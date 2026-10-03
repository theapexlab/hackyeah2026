/**
 * Metrics calculation.
 * Tracks delivery counts, drops, hops, latency per message.
 */

import type { DropReason } from '../domain/events';
import type { MessageClass } from '../domain/mode';

export interface ClassMetrics {
  originated: number;
  deliveries: number;
  uniqueReached: number;
  dropped: number;
}

export interface MetricsCollector {
  deliveries: Map<MessageClass, number>;
  dropsByReason: Map<DropReason, number>;
  hopCounts: number[]; // All hops at delivery
  latencies: number[]; // ticks from creation to first delivery
  messageCount: number;
  droppedCount: number;
}

export function createMetrics(): MetricsCollector {
  return {
    deliveries: new Map(),
    dropsByReason: new Map(),
    hopCounts: [],
    latencies: [],
    messageCount: 0,
    droppedCount: 0,
  };
}

export function recordDelivery(
  m: MetricsCollector,
  cls: MessageClass,
  hops: number,
  latency: number,
): void {
  m.deliveries.set(cls, (m.deliveries.get(cls) ?? 0) + 1);
  m.hopCounts.push(hops);
  m.latencies.push(latency);
}

export function recordDrop(m: MetricsCollector, reason: DropReason): void {
  m.dropsByReason.set(reason, (m.dropsByReason.get(reason) ?? 0) + 1);
  m.droppedCount++;
}

export function medianHops(m: MetricsCollector): number {
  if (m.hopCounts.length === 0) return 0;
  const sorted = [...m.hopCounts].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

export function medianLatency(m: MetricsCollector): number {
  if (m.latencies.length === 0) return 0;
  const sorted = [...m.latencies].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}
