import { describe, expect, it } from 'vitest';
import type { EngineConfigPatch } from '../../src/domain/config';
import { DEFAULT_WORLD_CONFIG, resolveEngineConfig } from '../../src/domain/config';
import type { Node, TravelMode, WalkState } from '../../src/domain/node';
import { applyCommand } from '../../src/engine/commands';
import { createEngine } from '../../src/engine/engine';
import { advanceWalker, secondsToTicks, travelTargets } from '../../src/engine/mobility';
import type { EngineState } from '../../src/engine/state';
import { createState } from '../../src/engine/state';
import { refreshTopology, runTick } from '../../src/engine/tick';
import {
  distanceToParks,
  distanceToStreets,
  inPark,
  inWater,
  isPlaceable,
  STREET_TOLERANCE_M,
} from '../../src/terrain/placement';
import { engineFrom, mobile } from '../helpers';

const MODES: readonly TravelMode[] = ['foot', 'bike', 'car'];

const walk = (path: WalkState['path']): WalkState => ({
  mode: 'foot',
  phase: 'moving',
  speed: 1,
  anchor: 0,
  path,
  cursor: 0,
  dwellUntilTick: 0,
});

describe('advanceWalker', () => {
  it('carries leftover distance across waypoints', () => {
    const pos = { x: 0, y: 0 };
    const w = walk([
      { x: 3, y: 0, node: 1, dwellTicks: 0 },
      { x: 6, y: 0, node: 2, dwellTicks: 0 },
      { x: 20, y: 0, node: 3, dwellTicks: 5 },
    ]);
    expect(advanceWalker(pos, w, 10, 1)).toBe(true);
    expect(pos).toEqual({ x: 10, y: 0 });
    expect(w.cursor).toBe(2);
    expect(w.anchor).toBe(2);
  });

  it('stops on a dwell waypoint and drops the rest of the budget', () => {
    const pos = { x: 0, y: 0 };
    const w = walk([
      { x: 4, y: 0, node: 7, dwellTicks: 12 },
      { x: 10, y: 0, node: 8, dwellTicks: 0 },
    ]);
    advanceWalker(pos, w, 10, 100);
    expect(pos).toEqual({ x: 4, y: 0 });
    expect(w).toMatchObject({ cursor: 1, anchor: 7, dwellUntilTick: 112 });
  });

  it('moves the anchor only on street waypoints and reports standing still', () => {
    const pos = { x: 0, y: 0 };
    const w = walk([{ x: 0, y: 5, node: null, dwellTicks: 0 }]);
    advanceWalker(pos, w, 10, 1);
    expect(w.anchor).toBe(0);
    const still = walk([{ x: 0, y: 5, node: null, dwellTicks: 0 }]);
    expect(advanceWalker({ x: 0, y: 5 }, still, 10, 1)).toBe(false);
    expect(advanceWalker({ x: 0, y: 5 }, walk([]), 10, 1)).toBe(false);
  });
});

describe('travel shares and durations', () => {
  it('rounds the shares and never asks for more phones than there are', () => {
    expect(travelTargets(200, { foot: 0.1, bike: 0.05, car: 0.1 })).toEqual({
      foot: 20,
      bike: 10,
      car: 20,
    });
    expect(travelTargets(10, { foot: 0.6, bike: 0.3, car: 0.8 })).toEqual({
      foot: 6,
      bike: 3,
      car: 1,
    });
    expect(travelTargets(0, { foot: 0.1, bike: 0.1, car: 0.1 })).toEqual({
      foot: 0,
      bike: 0,
      car: 0,
    });
  });

  it('turns simulated seconds into whole ticks', () => {
    expect(secondsToTicks(30, 0.2)).toBe(150);
    expect(secondsToTicks(30, 2)).toBe(15);
    expect(secondsToTicks(0.01, 0.2)).toBe(1);
  });
});

/** A fixed Kraków world for these tests, independent of the tunable defaults. */
const WORLD = {
  ...DEFAULT_WORLD_CONFIG,
  mobiles: 200,
  routers: 120,
  gateways: 4,
  range: { mobile: 100, router: 200, gateway: 220 },
};
const SHARES = { foot: 0.1, bike: 0.05, car: 0.1 };

/** That world with traffic on at SHARES; `tickSeconds` 2 compresses long runs. */
function krakowState(patch: EngineConfigPatch = {}): EngineState {
  const state = createState(
    WORLD,
    resolveEngineConfig({
      ...patch,
      mobility: { enabled: true, shares: SHARES, ...patch.mobility },
    }),
  );
  refreshTopology(state);
  return state;
}

const movingAs = (n: Node): TravelMode | null => (n.walk?.phase === 'moving' ? n.walk.mode : null);

describe('walkers, cyclists and drivers on the Kraków map', () => {
  it('keeps 10% walking, 5% cycling and 10% driving every tick while the people change', () => {
    const state = krakowState({ tickSeconds: 2 });
    const target = [20, 10, 20];
    const count = () => MODES.map((m) => state.nodes.filter((n) => movingAs(n) === m).length);
    expect(count()).toEqual(target);
    const travelled = new Set<string>();
    const modesOf = new Map<string, Set<TravelMode>>();
    let lingering = 0;
    let stayed = 0;
    for (let tick = 0; tick < 3000; tick++) {
      runTick(state);
      expect(count(), `tick ${state.tick}`).toEqual(target);
      for (const n of state.nodes) {
        const mode = movingAs(n);
        if (mode !== null) {
          travelled.add(n.id);
          if (!modesOf.has(n.id)) modesOf.set(n.id, new Set());
          modesOf.get(n.id)!.add(mode);
        }
        if (n.walk?.phase === 'lingering') lingering++;
        if (n.walk === null && travelled.has(n.id)) stayed++;
      }
    }
    expect(state.nodes.filter((n) => n.kind !== 'mobile').every((n) => n.walk === null)).toBe(true);
    expect(lingering).toBeGreaterThan(0); // people stop where they arrive
    expect(stayed).toBeGreaterThan(0); // some stay put for good
    expect(travelled.size).toBeGreaterThan(50); // and others set off instead
    const switched = [...modesOf.values()].filter((m) => m.size >= 2).length;
    expect(switched).toBeGreaterThan(0); // somebody changed how they travel
  });

  it('moves at real speeds (2-3, 10 and 50 km/h), on streets or in parks, never in the river', () => {
    const tickSeconds = 2;
    const state = krakowState({ tickSeconds });
    const perTick = (kmh: number) => (kmh / 3.6) * tickSeconds;
    const steps: Record<TravelMode, number[]> = { foot: [], bike: [], car: [] };
    let parkVisits = 0;
    for (let tick = 0; tick < 600; tick++) {
      const before = new Map(state.nodes.map((n) => [n.id, [n.x, n.y, movingAs(n)] as const]));
      runTick(state);
      for (const n of state.nodes) {
        const [x, y, mode] = before.get(n.id)!;
        const d = Math.hypot(n.x - x, n.y - y);
        if (d === 0) continue;
        expect(n.kind).toBe('mobile');
        const onStreet = distanceToStreets(state.terrain, n) <= STREET_TOLERANCE_M;
        const inAPark = inPark(state.terrain, n) >= 0;
        const nearPark = distanceToParks(state.terrain, n) <= 21;
        expect(onStreet || inAPark || nearPark, `${n.id} at tick ${state.tick}`).toBe(true);
        expect(isPlaceable(state.terrain, n), `${n.id} in the river`).toBe(true);
        if (!onStreet && inAPark) {
          parkVisits++;
          expect(mode).toBe('foot'); // only walkers go into parks
        }
        if (mode !== null && movingAs(n) === mode) steps[mode].push(d);
      }
    }
    const eps = 1e-9;
    // a full tick of travel is exactly the trip speed; arrivals and turns cut it short
    expect(Math.max(...steps.foot)).toBeLessThanOrEqual(perTick(3) + eps);
    expect(Math.max(...steps.bike)).toBeLessThanOrEqual(perTick(10) + eps);
    expect(Math.max(...steps.car)).toBeLessThanOrEqual(perTick(50) + eps);
    expect(Math.max(...steps.foot)).toBeGreaterThan(perTick(2) - eps);
    const typical = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.75)]!;
    expect(typical(steps.bike)).toBeCloseTo(perTick(10), 6);
    expect(typical(steps.car)).toBeCloseTo(perTick(50), 6);
    expect(parkVisits).toBeGreaterThan(0);
  });

  it('is deterministic', () => {
    const a = krakowState();
    const b = krakowState();
    for (let i = 0; i < 300; i++) {
      runTick(a);
      runTick(b);
    }
    expect(a.nodes.map((n) => [n.x, n.y, movingAs(n)])).toEqual(
      b.nodes.map((n) => [n.x, n.y, movingAs(n)]),
    );
  });

  it('MoveNode keeps nodes out of the Vistula (routers out of parks too) and restarts a traveller', () => {
    const state = krakowState({ tickSeconds: 2 });
    const river = { x: 700 * 1.1, y: 1040 * (1300 / 1235) };
    const park = { x: 520 * 1.1, y: 470 * (1300 / 1235) }; // a park off the streets
    expect(inWater(state.terrain, river)).toBe(true);
    expect(inPark(state.terrain, park)).toBeGreaterThanOrEqual(0);
    const router = state.nodes.find((n) => n.kind === 'router')!;
    applyCommand(state, { type: 'MoveNode', nodeId: router.id, ...river });
    expect(inWater(state.terrain, router)).toBe(false);
    expect(inPark(state.terrain, router)).toBe(-1);
    applyCommand(state, { type: 'MoveNode', nodeId: router.id, ...park });
    expect(inPark(state.terrain, router)).toBe(-1);
    expect(Math.hypot(router.x - park.x, router.y - park.y)).toBeLessThan(150);
    const gateway = state.nodes.find((n) => n.kind === 'gateway')!;
    applyCommand(state, { type: 'MoveNode', nodeId: gateway.id, ...river });
    expect(distanceToStreets(state.terrain, gateway)).toBeLessThanOrEqual(STREET_TOLERANCE_M);

    for (let i = 0; i < 30; i++) runTick(state);
    const walker = state.nodes.find((n) => movingAs(n) === 'foot')!;
    applyCommand(state, { type: 'MoveNode', nodeId: walker.id, ...park });
    expect([walker.x, walker.y]).toEqual([park.x, park.y]);
    expect(walker.walk).toMatchObject({ path: [], cursor: 0, dwellUntilTick: 0 });
    const anchor = state.terrain.graph.nodes[walker.walk!.anchor]!;
    const distance = Math.hypot(anchor.x - park.x, anchor.y - park.y);
    const ticks = Math.ceil(distance / (walker.walk!.speed * state.config.tickSeconds)) + 2;
    for (let i = 0; i < ticks; i++) runTick(state);
    expect(distanceToStreets(state.terrain, walker)).toBeLessThanOrEqual(STREET_TOLERANCE_M);
  });

  it('a random request comes from someone standing still, who stays put until it is settled', () => {
    const state = krakowState({ tickSeconds: 2 });
    for (let i = 0; i < 20; i++) runTick(state);
    const requesters = new Set<string>();
    for (let i = 0; i < 15; i++) {
      applyCommand(state, { type: 'SendRandomRequest' });
      const origin = state.messageList.at(-1)!.originId;
      expect(movingAs(state.byId.get(origin)!), origin).toBeNull();
      requesters.add(origin);
    }
    const count = () => MODES.map((m) => state.nodes.filter((n) => movingAs(n) === m).length);
    const ttl = state.messageList.at(-1)!.ttlTicks;
    for (let i = 0; i < ttl; i++) {
      runTick(state);
      expect(count(), `tick ${state.tick}`).toEqual([20, 10, 20]); // shares still hold
      const open = [...state.transactions.values()].filter((tx) => tx.status !== 'closed');
      for (const tx of open) expect(movingAs(state.byId.get(tx.requesterId)!)).toBeNull();
    }
    // all timed out now: the requesters are free to go again
    runTick(state);
    expect([...state.transactions.values()].every((tx) => tx.status === 'closed')).toBe(true);
  });

  it('applies new shares on the next tick, and never moves explicit node lists', () => {
    const e = createEngine(WORLD, { mobility: { shares: SHARES } });
    const moving = (mode: TravelMode) => e.getSnapshot().nodes.filter((n) => n.travel === mode);
    expect(MODES.map((m) => moving(m).length)).toEqual([20, 10, 20]);
    e.dispatch({ type: 'SetMobility', enabled: true, shares: { foot: 0.3 } });
    e.step();
    expect(MODES.map((m) => moving(m).length)).toEqual([60, 10, 20]);
    const hand = engineFrom([mobile('m-001', 0, 0), mobile('m-002', 50, 0)], {
      mobility: { enabled: true, shares: { foot: 1 } },
    });
    hand.step(10);
    expect(hand.getSnapshot().nodes.map((n) => [n.travel, n.x, n.y])).toEqual([
      [null, 0, 0],
      [null, 50, 0],
    ]);
  });
});
