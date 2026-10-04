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
  /**
   * Where the ends stood at that crossing. Drawn instead of the current positions: a phone
   * that carried the message on (store-and-forward) would otherwise pull every hand-off it
   * made along the way into one long-spoked star at wherever it is now.
   */
  readonly fromPos?: XY;
  readonly toPos?: XY;
}

interface XY {
  readonly x: number;
  readonly y: number;
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
      const edge: TrailEdge = { from: transit.from, to: transit.to, tick: transit.tick };
      edges.push(
        transit.fromPos && transit.toPos
          ? { ...edge, fromPos: transit.fromPos, toPos: transit.toPos }
          : edge,
      );
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

/**
 * Give chain edges the crossing positions of the matching trail edges (either direction),
 * so the recorded route is drawn where the hops happened. Edges with no match keep none.
 */
export function placeChain(chain: readonly TrailEdge[], trail: Trail): TrailEdge[] {
  const byKey = new Map<string, TrailEdge>();
  for (const edge of trail.edges) byKey.set(`${edge.from}|${edge.to}`, edge);
  return chain.map((edge) => {
    const same = byKey.get(`${edge.from}|${edge.to}`);
    if (same?.fromPos && same.toPos) return { ...edge, fromPos: same.fromPos, toPos: same.toPos };
    const reverse = byKey.get(`${edge.to}|${edge.from}`);
    if (reverse?.fromPos && reverse.toPos) {
      return { ...edge, fromPos: reverse.toPos, toPos: reverse.fromPos };
    }
    return edge;
  });
}
