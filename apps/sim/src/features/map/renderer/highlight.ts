/**
 * The highlighted message trail: every edge a message crossed, reconstructed from the
 * engine's transit ring buffer (last 64 ticks). Pure TypeScript.
 */
import type { MessageId, NodeId, TransitEvent } from '@pomoc/core';
import { isAuthorityId } from '@pomoc/core';

/** How many past ticks of transits the trail looks at (the engine keeps 64). */
export const TRAIL_TICKS = 64;

export interface TrailEdge {
  readonly from: NodeId;
  readonly to: NodeId;
  /** Tick of the first crossing. */
  readonly tick: number;
}

export interface Trail {
  readonly msgId: MessageId;
  readonly edges: readonly TrailEdge[];
  /** Every node the message visited (origin included when it appears as a `from`). */
  readonly nodes: ReadonlySet<NodeId>;
}

/**
 * Collect the unique edges `msgId` crossed across the given ticks (oldest first).
 * Authority injections and uplinks have no drawable edge and are skipped, but the
 * node they touched is still part of the trail.
 */
export function collectTrail(ticks: readonly (readonly TransitEvent[])[], msgId: MessageId): Trail {
  const seen = new Set<string>();
  const edges: TrailEdge[] = [];
  const nodes = new Set<NodeId>();
  for (const transits of ticks) {
    for (const transit of transits) {
      if (transit.msgId !== msgId) continue;
      if (!isAuthorityId(transit.from)) nodes.add(transit.from);
      if (!isAuthorityId(transit.to)) nodes.add(transit.to);
      if (isAuthorityId(transit.from) || isAuthorityId(transit.to)) continue;
      const key = `${transit.from}|${transit.to}`;
      const reverse = `${transit.to}|${transit.from}`;
      if (seen.has(key) || seen.has(reverse)) continue;
      seen.add(key);
      edges.push({ from: transit.from, to: transit.to, tick: transit.tick });
    }
  }
  return { msgId, edges, nodes };
}

/** Consecutive pairs of a recorded packet path, e.g. from an inbox entry or a RESPONSE returnPath. */
export function chainEdges(path: readonly NodeId[]): TrailEdge[] {
  const out: TrailEdge[] = [];
  for (let i = 1; i < path.length; i++) {
    const from = path[i - 1];
    const to = path[i];
    if (from === undefined || to === undefined) continue;
    if (isAuthorityId(from) || isAuthorityId(to)) continue;
    out.push({ from, to, tick: i });
  }
  return out;
}
