import type {
  AuthorityView,
  EdgeView,
  MetricsView,
  Mode,
  NodeId,
  NodeView,
  SimEngine,
  Snapshot,
  WorldView,
} from '@pomoc/core';
import type { SimState } from './store';

export const selectEngine = (s: SimState): SimEngine => s.engine;
export const selectSnapshot = (s: SimState): Snapshot => s.snapshot;
export const selectTick = (s: SimState): number => s.snapshot.tick;
export const selectGlobalMode = (s: SimState): Mode => s.snapshot.globalMode;
export const selectWorld = (s: SimState): WorldView => s.snapshot.world;
export const selectNodes = (s: SimState): readonly NodeView[] => s.snapshot.nodes;
export const selectEdges = (s: SimState): readonly EdgeView[] => s.snapshot.edges;
export const selectMetrics = (s: SimState): MetricsView => s.snapshot.metrics;
export const selectAuthority = (s: SimState): AuthorityView => s.snapshot.authority;

const indexCache = new WeakMap<readonly NodeView[], ReadonlyMap<NodeId, NodeView>>();

/** id -> NodeView, memoised on the nodes array reference (one build per tick at most). */
export function nodeIndex(nodes: readonly NodeView[]): ReadonlyMap<NodeId, NodeView> {
  const cached = indexCache.get(nodes);
  if (cached) return cached;
  const map = new Map<NodeId, NodeView>();
  for (const node of nodes) map.set(node.id, node);
  indexCache.set(nodes, map);
  return map;
}

export const selectNodeById =
  (id: NodeId | null) =>
  (s: SimState): NodeView | undefined =>
    id === null ? undefined : nodeIndex(s.snapshot.nodes).get(id);

export interface NodeCounts {
  readonly total: number;
  readonly mobiles: number;
  readonly routers: number;
  readonly gateways: number;
  readonly alive: number;
  readonly backhaul: number;
  readonly unregistered: number;
  /** Phones on the move right now. */
  readonly walking: number;
  readonly cycling: number;
  readonly driving: number;
}

const countsCache = new WeakMap<readonly NodeView[], NodeCounts>();

/** Kind / liveness counts, memoised on the nodes array reference. */
export function countNodes(nodes: readonly NodeView[]): NodeCounts {
  const cached = countsCache.get(nodes);
  if (cached) return cached;
  let mobiles = 0;
  let routers = 0;
  let gateways = 0;
  let alive = 0;
  let backhaul = 0;
  let unregistered = 0;
  let walking = 0;
  let cycling = 0;
  let driving = 0;
  for (const node of nodes) {
    if (node.travel === 'foot') walking += 1;
    else if (node.travel === 'bike') cycling += 1;
    else if (node.travel === 'car') driving += 1;
    if (node.kind === 'mobile') mobiles += 1;
    else if (node.kind === 'router') routers += 1;
    else gateways += 1;
    if (node.alive) alive += 1;
    if (node.alive && node.hasBackhaul) backhaul += 1;
    if (node.credentialKind === 'none') unregistered += 1;
  }
  const counts: NodeCounts = {
    total: nodes.length,
    mobiles,
    routers,
    gateways,
    alive,
    backhaul,
    unregistered,
    walking,
    cycling,
    driving,
  };
  countsCache.set(nodes, counts);
  return counts;
}

export const selectCounts = (s: SimState): NodeCounts => countNodes(s.snapshot.nodes);
