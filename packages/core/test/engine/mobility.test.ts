import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ENGINE_CONFIG,
  DEFAULT_WORLD_CONFIG,
  resolveEngineConfig,
} from '../../src/domain/config';
import type { Node, TravelMode, WalkState } from '../../src/domain/node';
import { applyCommand } from '../../src/engine/commands';
import { createEngine } from '../../src/engine/engine';
import { advanceWalker, travelTargets } from '../../src/engine/mobility';
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

const walk = (path: WalkState['path']): WalkState => ({
  mode: 'foot',
  phase: 'moving',
  speedFactor: 1,
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

describe('travelTargets', () => {
  it('rounds the shares and never asks for more phones than there are', () => {
    expect(travelTargets(200, { walkerFraction: 0.1, driverFraction: 0.1 })).toEqual({
      foot: 20,
      car: 20,
    });
    expect(travelTargets(10, { walkerFraction: 0.8, driverFraction: 0.8 })).toEqual({
      foot: 8,
      car: 2,
    });
    expect(travelTargets(0, { walkerFraction: 0.1, driverFraction: 0.1 })).toEqual({
      foot: 0,
      car: 0,
    });
  });
});

function krakowState(): EngineState {
  const state = createState(
    DEFAULT_WORLD_CONFIG,
    resolveEngineConfig({ mobility: { ...DEFAULT_ENGINE_CONFIG.mobility, enabled: true } }),
  );
  refreshTopology(state);
  return state;
}

const movingAs = (n: Node): TravelMode | null => (n.walk?.phase === 'moving' ? n.walk.mode : null);

describe('walkers and drivers on the Kraków map', () => {
  it('keeps a tenth walking and a tenth driving at every tick while the people change', () => {
    const state = krakowState();
    const target = Math.round(0.1 * DEFAULT_WORLD_CONFIG.mobiles);
    const count = (mode: TravelMode) => state.nodes.filter((n) => movingAs(n) === mode).length;
    expect([count('foot'), count('car')]).toEqual([target, target]);
    const travelled = new Set<string>();
    const modesOf = new Map<string, Set<TravelMode>>();
    let lingering = 0;
    let stayed = 0;
    for (let tick = 0; tick < 800; tick++) {
      runTick(state);
      expect([count('foot'), count('car')], `tick ${state.tick}`).toEqual([target, target]);
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
    expect(travelled.size).toBeGreaterThan(2 * target); // and others set off instead
    const switched = [...modesOf.values()].filter((m) => m.size === 2).length;
    expect(switched).toBeGreaterThan(0); // somebody walked and later drove, or the reverse
  });

  it('drives 20 times as fast as it walks, on streets or in parks, never in the river', () => {
    const state = krakowState();
    const step = state.config.mobility.stepMetres;
    const speed: Record<TravelMode, number[]> = { foot: [], car: [] };
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
        if (!onStreet && inAPark) parkVisits++;
        if (mode !== null && movingAs(n) === mode) speed[mode].push(d);
      }
    }
    const max = (xs: number[]) => Math.max(...xs);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(max(speed.foot)).toBeLessThanOrEqual(step * 1.3 + 1e-9);
    expect(max(speed.car)).toBeLessThanOrEqual(step * 20 * 1.3 + 1e-9);
    const ratio = mean(speed.car) / mean(speed.foot);
    expect(ratio).toBeGreaterThan(12);
    expect(ratio).toBeLessThan(28);
    expect(parkVisits).toBeGreaterThan(0); // walkers step into parks, cars never do
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
    const state = krakowState();
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
    const ticks = Math.ceil(distance / (state.config.mobility.stepMetres * 0.7)) + 2;
    for (let i = 0; i < ticks; i++) runTick(state);
    expect(distanceToStreets(state.terrain, walker)).toBeLessThanOrEqual(STREET_TOLERANCE_M);
  });

  it('applies new shares on the next tick, and never moves explicit node lists', () => {
    const e = createEngine(DEFAULT_WORLD_CONFIG);
    const moving = (mode: TravelMode) => e.getSnapshot().nodes.filter((n) => n.travel === mode);
    expect(moving('foot')).toHaveLength(20);
    expect(moving('car')).toHaveLength(20);
    e.dispatch({ type: 'SetMobility', enabled: true, walkerFraction: 0.3 });
    e.step();
    expect(moving('foot')).toHaveLength(60);
    expect(moving('car')).toHaveLength(20);
    const hand = engineFrom([mobile('m-001', 0, 0), mobile('m-002', 50, 0)], {
      mobility: { ...DEFAULT_ENGINE_CONFIG.mobility, enabled: true, walkerFraction: 1 },
    });
    hand.step(10);
    expect(hand.getSnapshot().nodes.map((n) => [n.travel, n.x, n.y])).toEqual([
      [null, 0, 0],
      [null, 50, 0],
    ]);
  });
});
