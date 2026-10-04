import type { NodeId } from '../domain/ids';
import type { Node, WalkState, Waypoint } from '../domain/node';
import type { Prng } from '../prng';
import { pointInPolygon } from '../terrain/geometry';
import { nearestPointOnGraph, randomPointInPolygon, shortestPath } from '../terrain/graph';
import { PARK_GATE_RADIUS_M } from '../terrain/index';
import { inWater } from '../terrain/placement';
import type { Pt, Terrain } from '../terrain/types';
import type { EngineState } from './state';

/** Straight-line distance band (metres) for picking a trip's destination. */
export const TRIP_MIN_M = 120;
export const TRIP_MAX_M = 600;
/** Chance that a trip is a park visit (when a park gate lies in the band). */
export const PARK_CHANCE = 0.25;
const STREET_DWELL_MIN = 10;
const STREET_DWELL_SPAN = 41;
const PARK_DWELL_MIN = 40;
const PARK_DWELL_SPAN = 121;
/** Short pause at the gate on the way out of a park. */
const GATE_PAUSE = 5;
/** Wait before retrying when no trip can be planned. */
const IDLE_TICKS = 50;
/** Walkers start staggered over this many ticks. */
const START_SPREAD = 20;

function nearestGraphNode(terrain: Terrain, p: Pt): number {
  return nearestPointOnGraph(terrain.graph, p)?.nearestNode ?? -1;
}

/**
 * Pick the walkers among generated mobiles: one shuffle of the mobile ids, the first
 * round(fraction * n) walk. Then, in id order, each walker draws its pace (0.7-1.3) and a
 * staggered start. Mobiles that do not walk keep `walk = null`.
 */
export function assignWalkers(
  nodes: readonly Node[],
  terrain: Terrain,
  prng: Prng,
  fraction: number,
): void {
  const mobiles = nodes.filter((n) => n.kind === 'mobile');
  if (mobiles.length === 0) return;
  const k = Math.min(mobiles.length, Math.max(0, Math.round(fraction * mobiles.length)));
  const chosen = new Set<NodeId>(prng.shuffle(mobiles.map((n) => n.id)).slice(0, k));
  for (const node of mobiles) {
    if (!chosen.has(node.id)) continue;
    node.walk = {
      speedFactor: prng.float(0.7, 1.3),
      anchor: nearestGraphNode(terrain, node),
      path: [],
      cursor: 0,
      dwellUntilTick: prng.int(START_SPREAD),
    };
  }
}

/** After a walker was moved by hand: forget the trip; the next one starts at the nearest street node. */
export function resetWalk(terrain: Terrain, node: Node): void {
  if (node.walk === null) return;
  node.walk.anchor = nearestGraphNode(terrain, node);
  node.walk.path = [];
  node.walk.cursor = 0;
  node.walk.dwellUntilTick = 0;
}

/**
 * Move `pos` up to `budget` metres along the waypoints. Reaching a waypoint carries the
 * leftover distance on to the next one; a waypoint with dwellTicks > 0 stops the walker
 * there (the rest of the budget is dropped) until tick + dwellTicks. Returns whether the
 * position changed. Allocation-free.
 */
export function advanceWalker(
  pos: { x: number; y: number },
  walk: WalkState,
  budget: number,
  tick: number,
): boolean {
  let moved = false;
  let left = budget;
  while (left > 0 && walk.cursor < walk.path.length) {
    const wp = walk.path[walk.cursor]!;
    const dx = wp.x - pos.x;
    const dy = wp.y - pos.y;
    const d = Math.hypot(dx, dy);
    if (d <= left) {
      if (d > 0) moved = true;
      pos.x = wp.x;
      pos.y = wp.y;
      left -= d;
      walk.cursor += 1;
      if (wp.node !== null) walk.anchor = wp.node;
      if (wp.dwellTicks > 0) {
        walk.dwellUntilTick = tick + wp.dwellTicks;
        break;
      }
    } else {
      pos.x += (dx / d) * left;
      pos.y += (dy / d) * left;
      left = 0;
      moved = true;
    }
  }
  return moved;
}

/** Every point of the straight leg a-b (sampled every 5 m) is in the park or near the gate. */
function legStaysInPark(park: readonly Pt[], gate: Pt, to: Pt): boolean {
  const d = Math.hypot(to.x - gate.x, to.y - gate.y);
  const n = Math.max(1, Math.ceil(d / 5));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const p = { x: gate.x + (to.x - gate.x) * t, y: gate.y + (to.y - gate.y) * t };
    if (t * d <= PARK_GATE_RADIUS_M) continue;
    if (!pointInPolygon(p, park)) return false;
  }
  return true;
}

/**
 * Plan the next trip from the walker's anchor. Destinations are land street nodes of the
 * anchor's component between TRIP_MIN_M and TRIP_MAX_M away (any other node of the
 * component when none is). With PARK_CHANCE the trip instead walks to a park gate in that
 * band, steps into the park, lingers and comes back to the gate. Routes follow the
 * shortest street path. PRNG draws happen only here.
 */
function planTrip(state: EngineState, walk: WalkState): void {
  const { graph, parks, parkGates } = state.terrain;
  const a = walk.anchor;
  if (a < 0 || a >= graph.nodes.length) {
    walk.dwellUntilTick = state.tick + IDLE_TICKS;
    return;
  }
  const comp = graph.componentOf[a];
  const origin = graph.nodes[a]!;
  const usable = (i: number): boolean =>
    i !== a && graph.componentOf[i] === comp && !graph.inWater[i];
  const inBand = (i: number): boolean => {
    if (!usable(i)) return false;
    const n = graph.nodes[i]!;
    const d = Math.hypot(n.x - origin.x, n.y - origin.y);
    return d >= TRIP_MIN_M && d <= TRIP_MAX_M;
  };
  const targets: number[] = [];
  for (let i = 0; i < graph.nodes.length; i++) if (inBand(i)) targets.push(i);
  if (targets.length === 0) {
    for (let i = 0; i < graph.nodes.length; i++) if (usable(i)) targets.push(i);
  }
  if (targets.length === 0) {
    walk.dwellUntilTick = state.tick + IDLE_TICKS;
    return;
  }
  const parkOptions: { park: number; gates: number[] }[] = [];
  parkGates.forEach((gates, park) => {
    const near = gates.filter(inBand);
    if (near.length > 0) parkOptions.push({ park, gates: near });
  });

  const prng = state.prng;
  const wantPark = prng.next() < PARK_CHANCE;
  const toWaypoint = (i: number): Waypoint => {
    const n = graph.nodes[i]!;
    return { x: n.x, y: n.y, node: i, dwellTicks: 0 };
  };
  let path: Waypoint[] = [];
  if (wantPark && parkOptions.length > 0) {
    const option = prng.pick(parkOptions);
    const gate = prng.pick(option.gates);
    const route = shortestPath(graph, a, gate);
    const park = parks[option.park]!.pts;
    const gatePt = graph.nodes[gate]!;
    const spot = randomPointInPolygon(
      park,
      prng,
      (p) => !inWater(state.terrain, p) && legStaysInPark(park, gatePt, p),
    );
    const dwell = PARK_DWELL_MIN + prng.int(PARK_DWELL_SPAN);
    path = route.map(toWaypoint);
    if (path.length > 0) {
      if (spot === null) {
        path[path.length - 1] = { ...path[path.length - 1]!, dwellTicks: dwell };
      } else {
        path.push({ x: spot.x, y: spot.y, node: null, dwellTicks: dwell });
        path.push({ ...toWaypoint(gate), dwellTicks: GATE_PAUSE });
      }
    }
  } else {
    const target = prng.pick(targets);
    const dwell = STREET_DWELL_MIN + prng.int(STREET_DWELL_SPAN);
    path = shortestPath(graph, a, target).map(toWaypoint);
    if (path.length > 0) path[path.length - 1] = { ...path[path.length - 1]!, dwellTicks: dwell };
  }
  if (path.length === 0) {
    walk.dwellUntilTick = state.tick + IDLE_TICKS;
    return;
  }
  walk.path = path;
  walk.cursor = 0;
}

/**
 * Tick phase 1 while mobility is on: every walker (alive or not: the person walks even
 * with the phone off) either dwells, plans its next trip, or advances
 * stepMetres * speedFactor along it. Adjacency is marked dirty only when someone moved.
 */
export function moveWalkers(state: EngineState): void {
  if (state.terrain.graph.edges.length === 0) return;
  const step = Math.max(0, state.config.mobility.stepMetres);
  let moved = false;
  for (const node of state.nodes) {
    const walk = node.walk;
    if (walk === null || state.tick < walk.dwellUntilTick) continue;
    if (walk.cursor >= walk.path.length) {
      planTrip(state, walk);
      if (walk.cursor >= walk.path.length || state.tick < walk.dwellUntilTick) continue;
    }
    if (advanceWalker(node, walk, step * walk.speedFactor, state.tick)) moved = true;
  }
  if (moved) state.adjacency.dirty = true;
}
