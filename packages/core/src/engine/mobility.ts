import type { EngineConfig, MobilityConfig } from '../domain/config';
import type { NodeId } from '../domain/ids';
import type { Node, TravelMode, WalkState, Waypoint } from '../domain/node';
import type { Prng } from '../prng';
import { pointInPolygon } from '../terrain/geometry';
import { nearestPointOnGraph, randomPointInPolygon, shortestPath } from '../terrain/graph';
import { PARK_GATE_RADIUS_M } from '../terrain/index';
import { inWater } from '../terrain/placement';
import type { Pt, Terrain } from '../terrain/types';
import type { EngineState } from './state';

/** Straight-line distance band (metres) for a trip's destination, per mode. */
export const TRIP_BAND_M: Readonly<Record<TravelMode, readonly [number, number]>> = {
  foot: [120, 600],
  bike: [300, 1500],
  car: [500, 2000],
};
/** Chance that a walk is a park visit (when a park gate lies in the band). Only walkers enter parks. */
export const PARK_CHANCE = 0.25;
/** After lingering, the chance that a traveller stays put for good (someone else takes over). */
export const STAY_CHANCE = 0.25;
/** Simulated seconds a traveller lingers where it arrived (30 s to 5 min). */
const LINGER_S: readonly [number, number] = [30, 300];
/** Simulated seconds a walker spends inside a park (2 to 10 min). */
const PARK_STAY_S: readonly [number, number] = [120, 600];
/** Wait before retrying when no trip can be planned. */
const IDLE_S = 10;
/** The first travellers of a world set off within this many seconds. */
const START_SPREAD_S = 5;

/** Refill order on equal shortfalls. */
const MODES: readonly TravelMode[] = ['car', 'bike', 'foot'];

/** A simulated duration as a whole number of ticks (at least one). */
export function secondsToTicks(seconds: number, tickSeconds: number): number {
  return Math.max(1, Math.round(seconds / Math.max(1e-6, tickSeconds)));
}

function nearestGraphNode(terrain: Terrain, p: Pt): number {
  return nearestPointOnGraph(terrain.graph, p)?.nearestNode ?? -1;
}

/** How many mobiles should be walking, cycling and driving at once (never more than exist). */
export function travelTargets(
  mobiles: number,
  shares: MobilityConfig['shares'],
): Readonly<Record<TravelMode, number>> {
  const clampCount = (fraction: number, max: number): number =>
    Math.min(max, Math.max(0, Math.round(fraction * mobiles)));
  const foot = clampCount(shares.foot, mobiles);
  const bike = clampCount(shares.bike, mobiles - foot);
  const car = clampCount(shares.car, mobiles - foot - bike);
  return { foot, bike, car };
}

/**
 * Fill every free walking, cycling and driving place. The largest shortfall goes first (car,
 * bike, foot on a tie). A ready traveller (one who lingered and wants to go on) is picked at
 * random first, so people switch modes; only when nobody is ready does a random phone that
 * has stood still set off. Each recruit draws its speed for the trip from the mode's km/h
 * range; `spreadTicks` > 0 staggers the start. PRNG draws: per recruit one pick, the speed and
 * (with a spread) the start. A place stays empty only while every other phone is busy
 * (moving or still lingering). Phones in `pinned` (waiting on their own request) are never
 * recruited; a trip already under way is finished.
 */
function fillPlaces(
  nodes: readonly Node[],
  terrain: Terrain,
  prng: Prng,
  mobility: MobilityConfig,
  tick: number,
  spreadTicks: number,
  pinned: ReadonlySet<NodeId> = new Set(),
): void {
  const mobiles = nodes.filter((n) => n.kind === 'mobile');
  const target = travelTargets(mobiles.length, mobility.shares);
  const moving: Record<TravelMode, number> = { foot: 0, bike: 0, car: 0 };
  const ready: Node[] = [];
  const still: Node[] = [];
  for (const n of mobiles) {
    if (n.walk?.phase !== 'moving' && pinned.has(n.id)) continue;
    if (n.walk === null) still.push(n);
    else if (n.walk.phase === 'moving') moving[n.walk.mode] += 1;
    else if (n.walk.phase === 'ready') ready.push(n);
  }
  for (;;) {
    let mode: TravelMode = MODES[0]!;
    for (const m of MODES) if (target[m] - moving[m] > target[mode] - moving[mode]) mode = m;
    if (target[mode] - moving[mode] <= 0) return;
    const pool = ready.length > 0 ? ready : still;
    if (pool.length === 0) return;
    const i = prng.int(pool.length);
    const node = pool[i]!;
    pool.splice(i, 1);
    const anchor = node.walk?.anchor ?? nearestGraphNode(terrain, node);
    const [minKmh, maxKmh] = mobility.speedKmh[mode];
    node.walk = {
      mode,
      phase: 'moving',
      speed: prng.float(minKmh, maxKmh) / 3.6,
      anchor,
      path: [],
      cursor: 0,
      dwellUntilTick: spreadTicks > 0 ? tick + prng.int(spreadTicks) : tick,
    };
    moving[mode] += 1;
  }
}

/** The first walkers, cyclists and drivers of a freshly generated world (staggered start). */
export function assignTravellers(
  nodes: readonly Node[],
  terrain: Terrain,
  prng: Prng,
  config: EngineConfig,
): void {
  const spread = secondsToTicks(START_SPREAD_S, config.tickSeconds);
  fillPlaces(nodes, terrain, prng, config.mobility, 0, spread);
}

/** After a traveller was moved by hand: forget the trip; the next one starts at the nearest street node. */
export function resetTrip(terrain: Terrain, node: Node): void {
  if (node.walk === null) return;
  node.walk.anchor = nearestGraphNode(terrain, node);
  node.walk.path = [];
  node.walk.cursor = 0;
  node.walk.dwellUntilTick = 0;
}

/**
 * Move `pos` up to `budget` metres along the waypoints. Reaching a waypoint carries the
 * leftover distance on to the next one; a waypoint with dwellTicks > 0 stops the traveller
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

/** Every point of the straight leg gate-to (sampled every 5 m) is in the park or near the gate. */
function legStaysInPark(park: readonly Pt[], gate: Pt, to: Pt): boolean {
  const d = Math.hypot(to.x - gate.x, to.y - gate.y);
  const n = Math.max(1, Math.ceil(d / 5));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    if (t * d <= PARK_GATE_RADIUS_M) continue;
    const p = { x: gate.x + (to.x - gate.x) * t, y: gate.y + (to.y - gate.y) * t };
    if (!pointInPolygon(p, park)) return false;
  }
  return true;
}

/**
 * Plan the next trip from the traveller's anchor. Destinations are land street nodes of the
 * anchor's component within the mode's distance band (any other node of the component when
 * none is). A walk is, with PARK_CHANCE, a park visit instead: to a gate in the band, into
 * the park to linger on the grass, and back to the gate. Routes follow the shortest street
 * path; the last waypoint carries the linger at the destination. PRNG draws happen only here.
 */
function planTrip(state: EngineState, walk: WalkState): void {
  const { graph, parks, parkGates } = state.terrain;
  const ticks = (seconds: number): number => secondsToTicks(seconds, state.config.tickSeconds);
  const a = walk.anchor;
  if (a < 0 || a >= graph.nodes.length) {
    walk.dwellUntilTick = state.tick + ticks(IDLE_S);
    return;
  }
  const comp = graph.componentOf[a];
  const origin = graph.nodes[a]!;
  const [minM, maxM] = TRIP_BAND_M[walk.mode];
  const usable = (i: number): boolean =>
    i !== a && graph.componentOf[i] === comp && !graph.inWater[i];
  const inBand = (i: number): boolean => {
    if (!usable(i)) return false;
    const n = graph.nodes[i]!;
    const d = Math.hypot(n.x - origin.x, n.y - origin.y);
    return d >= minM && d <= maxM;
  };
  const targets: number[] = [];
  for (let i = 0; i < graph.nodes.length; i++) if (inBand(i)) targets.push(i);
  if (targets.length === 0) {
    for (let i = 0; i < graph.nodes.length; i++) if (usable(i)) targets.push(i);
  }
  if (targets.length === 0) {
    walk.dwellUntilTick = state.tick + ticks(IDLE_S);
    return;
  }
  const parkOptions: { park: number; gates: number[] }[] = [];
  if (walk.mode === 'foot') {
    parkGates.forEach((gates, park) => {
      const near = gates.filter(inBand);
      if (near.length > 0) parkOptions.push({ park, gates: near });
    });
  }

  const prng = state.prng;
  const wantPark = prng.next() < PARK_CHANCE;
  const linger = ticks(prng.float(LINGER_S[0], LINGER_S[1]));
  const toWaypoint = (i: number): Waypoint => {
    const n = graph.nodes[i]!;
    return { x: n.x, y: n.y, node: i, dwellTicks: 0 };
  };
  let path: Waypoint[];
  if (wantPark && parkOptions.length > 0) {
    const option = prng.pick(parkOptions);
    const gate = prng.pick(option.gates);
    const park = parks[option.park]!.pts;
    const gatePt = graph.nodes[gate]!;
    const spot = randomPointInPolygon(
      park,
      prng,
      (p) => !inWater(state.terrain, p) && legStaysInPark(park, gatePt, p),
    );
    const inPark = ticks(prng.float(PARK_STAY_S[0], PARK_STAY_S[1]));
    path = shortestPath(graph, a, gate).map(toWaypoint);
    if (path.length > 0 && spot !== null) {
      path.push({ x: spot.x, y: spot.y, node: null, dwellTicks: inPark });
      path.push(toWaypoint(gate));
    }
  } else {
    path = shortestPath(graph, a, prng.pick(targets)).map(toWaypoint);
  }
  if (path.length === 0) {
    walk.dwellUntilTick = state.tick + ticks(IDLE_S);
    return;
  }
  path[path.length - 1] = { ...path[path.length - 1]!, dwellTicks: linger };
  walk.path = path;
  walk.cursor = 0;
}

/**
 * Tick phase 1 while mobility is on (generated worlds only). In id order, every traveller
 * (alive or not: the person moves even with the phone off):
 *  - moving: waits out a start stagger or park stay, plans a trip when it has none, and
 *    advances speed * tickSeconds metres; on arrival it starts lingering;
 *  - lingering: when the linger is over, stays put for good with STAY_CHANCE (walk = null),
 *    otherwise becomes ready to go on;
 *  - ready: waits to be picked.
 * Then the free walking, cycling and driving places are refilled (fillPlaces), so the shares
 * hold every tick, from phones not in `pinned` (waiting on a request of their own, see activeRequesters). Adjacency is marked dirty only when someone moved.
 */
export function moveTravellers(state: EngineState, pinned: ReadonlySet<NodeId> = new Set()): void {
  if (!state.traffic || state.terrain.graph.edges.length === 0) return;
  const tickSeconds = Math.max(0, state.config.tickSeconds);
  const tick = state.tick;
  let moved = false;
  for (const node of state.nodes) {
    const walk = node.walk;
    if (walk === null || tick < walk.dwellUntilTick) continue;
    if (walk.phase === 'lingering') {
      if (state.prng.next() < STAY_CHANCE) node.walk = null;
      else walk.phase = 'ready';
      continue;
    }
    if (walk.phase !== 'moving') continue;
    if (walk.cursor >= walk.path.length) {
      planTrip(state, walk);
      if (walk.cursor >= walk.path.length || tick < walk.dwellUntilTick) continue;
    }
    if (advanceWalker(node, walk, walk.speed * tickSeconds, tick)) moved = true;
    if (walk.cursor >= walk.path.length) walk.phase = 'lingering';
  }
  fillPlaces(state.nodes, state.terrain, state.prng, state.config.mobility, tick, 0, pinned);
  if (moved) state.adjacency.dirty = true;
}
