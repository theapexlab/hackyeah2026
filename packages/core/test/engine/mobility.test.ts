import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ENGINE_CONFIG,
  DEFAULT_WORLD_CONFIG,
  resolveEngineConfig,
} from '../../src/domain/config';
import { nodeId } from '../../src/domain/ids';
import type { WalkState } from '../../src/domain/node';
import { applyCommand } from '../../src/engine/commands';
import { createEngine } from '../../src/engine/engine';
import { advanceWalker } from '../../src/engine/mobility';
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

function krakowState(): EngineState {
  const state = createState(
    DEFAULT_WORLD_CONFIG,
    resolveEngineConfig({ mobility: { ...DEFAULT_ENGINE_CONFIG.mobility, enabled: true } }),
  );
  refreshTopology(state);
  return state;
}

describe('walkers on the Kraków map', () => {
  it('only a tenth of the phones walk, and they stay on streets or in parks, never in the river', () => {
    const state = krakowState();
    const walkers = state.nodes.filter((n) => n.walk !== null);
    expect(walkers).toHaveLength(Math.round(0.1 * DEFAULT_WORLD_CONFIG.mobiles));
    expect(walkers.every((n) => n.kind === 'mobile')).toBe(true);
    const still = state.nodes.filter((n) => n.walk === null).map((n) => [n.id, n.x, n.y]);
    const anchors = new Map(walkers.map((n) => [n.id, new Set([n.walk!.anchor])]));
    let parkVisits = 0;
    let dwelling = 0;
    for (let tick = 0; tick < 600; tick++) {
      runTick(state);
      for (const n of walkers) {
        const onStreet = distanceToStreets(state.terrain, n) <= STREET_TOLERANCE_M;
        const inAPark = inPark(state.terrain, n) >= 0;
        const nearPark = distanceToParks(state.terrain, n) <= 21;
        expect(onStreet || inAPark || nearPark, `${n.id} at tick ${state.tick}`).toBe(true);
        expect(isPlaceable(state.terrain, n), `${n.id} in the river`).toBe(true);
        if (!onStreet && inAPark) parkVisits++;
        if (state.tick < n.walk!.dwellUntilTick) dwelling++;
        anchors.get(n.id)!.add(n.walk!.anchor);
      }
    }
    expect(state.nodes.filter((n) => n.walk === null).map((n) => [n.id, n.x, n.y])).toEqual(still);
    // everybody got somewhere, some lingered, and someone went into a park
    for (const set of anchors.values()) expect(set.size).toBeGreaterThan(2);
    expect(dwelling).toBeGreaterThan(0);
    expect(parkVisits).toBeGreaterThan(0);
  });

  it('is deterministic', () => {
    const a = krakowState();
    const b = krakowState();
    for (let i = 0; i < 300; i++) {
      runTick(a);
      runTick(b);
    }
    expect(a.nodes.map((n) => [n.x, n.y])).toEqual(b.nodes.map((n) => [n.x, n.y]));
  });

  it('MoveNode never drops a node in the Vistula and restarts a walker from the nearest street', () => {
    const state = krakowState();
    const river = { x: 700 * 1.1, y: 1040 * (1300 / 1235) };
    expect(inWater(state.terrain, river)).toBe(true);
    const router = state.nodes.find((n) => n.kind === 'router')!;
    applyCommand(state, { type: 'MoveNode', nodeId: router.id, ...river });
    expect(inWater(state.terrain, router)).toBe(false);
    expect(distanceToStreets(state.terrain, router)).toBeLessThanOrEqual(STREET_TOLERANCE_M);

    const walker = state.nodes.find((n) => n.walk !== null)!;
    for (let i = 0; i < 30; i++) runTick(state);
    const park = { x: 520 * 1.1, y: 470 * (1300 / 1235) }; // a park off the streets
    applyCommand(state, { type: 'MoveNode', nodeId: walker.id, ...park });
    expect([walker.x, walker.y]).toEqual([park.x, park.y]);
    expect(walker.walk).toMatchObject({ path: [], cursor: 0, dwellUntilTick: 0 });
    const anchor = state.terrain.graph.nodes[walker.walk!.anchor]!;
    const distance = Math.hypot(anchor.x - park.x, anchor.y - park.y);
    const ticks = Math.ceil(distance / (state.config.mobility.stepMetres * 0.7)) + 2;
    for (let i = 0; i < ticks; i++) runTick(state);
    expect(distanceToStreets(state.terrain, walker)).toBeLessThanOrEqual(STREET_TOLERANCE_M);
  });

  it('takes a new walker share on the next world and none for explicit node lists', () => {
    const e = createEngine(DEFAULT_WORLD_CONFIG);
    e.dispatch({ type: 'SetMobility', enabled: true, walkerFraction: 0.3 });
    expect(e.getSnapshot().nodes.filter((n) => n.walker)).toHaveLength(20);
    e.dispatch({ type: 'ResetWorld', world: e.world });
    expect(e.getSnapshot().nodes.filter((n) => n.walker)).toHaveLength(60);
    const hand = engineFrom([mobile('m-001', 0, 0), mobile('m-002', 50, 0)], {
      mobility: { enabled: true, stepMetres: 10, walkerFraction: 1 },
    });
    hand.step(10);
    expect(hand.getSnapshot().nodes.map((n) => [n.walker, n.x, n.y])).toEqual([
      [false, 0, 0],
      [false, 50, 0],
    ]);
    expect(nodeId('m-001')).toBe('m-001');
  });
});
