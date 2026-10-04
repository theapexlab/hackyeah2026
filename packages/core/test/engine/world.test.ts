import { describe, expect, it } from 'vitest';
import type { WorldConfig } from '../../src/domain/config';
import { DEFAULT_WORLD_CONFIG } from '../../src/domain/config';
import { generateWorld } from '../../src/engine/world';
import { Prng } from '../../src/prng';
import { resolveTerrain } from '../../src/terrain/index';
import { KRAKOW_HEIGHT, KRAKOW_WIDTH } from '../../src/terrain/krakow';
import {
  distanceToStreets,
  inPark,
  inWater,
  isPlaceable,
  isRouterSpot,
  STREET_TOLERANCE_M,
} from '../../src/terrain/placement';

/** The config a generated world really uses: the terrain's own width and height. */
function onTerrain(config: WorldConfig) {
  const terrain = resolveTerrain(config);
  return { terrain, config: { ...config, width: terrain.width, height: terrain.height } };
}

const pad = (n: number, w: number) => String(n).padStart(w, '0');

describe('generateWorld on the Kraków map (seed 42)', () => {
  const { terrain, config } = onTerrain(DEFAULT_WORLD_CONFIG);
  const nodes = generateWorld(config, new Prng(42), terrain);
  const counts = DEFAULT_WORLD_CONFIG;

  it('creates the configured counts with zero-padded ids, sorted', () => {
    expect(config.width).toBe(KRAKOW_WIDTH);
    expect(config.height).toBe(KRAKOW_HEIGHT);
    expect(nodes).toHaveLength(counts.mobiles + counts.routers + counts.gateways);
    const ids = nodes.map((n) => n.id);
    expect(ids).toEqual([...ids].sort());
    expect(ids[0]).toBe('g-01');
    expect(ids[counts.gateways - 1]).toBe(`g-${pad(counts.gateways, 2)}`);
    expect(ids[counts.gateways]).toBe('m-001');
    expect(ids[counts.gateways + counts.mobiles]).toBe('r-001');
    expect(ids.at(-1)).toBe(`r-${pad(counts.routers, 3)}`);
  });

  it('keeps every node out of the Vistula: phones and gateways on streets, routers anywhere but parks', () => {
    for (const n of nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.x).toBeLessThanOrEqual(KRAKOW_WIDTH);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeLessThanOrEqual(KRAKOW_HEIGHT);
      expect(inWater(terrain, n)).toBe(false);
      expect(isPlaceable(terrain, n)).toBe(true);
      if (n.kind === 'router') {
        expect(isRouterSpot(terrain, n), n.id).toBe(true);
        expect(inPark(terrain, n)).toBe(-1);
      } else {
        expect(distanceToStreets(terrain, n)).toBeLessThanOrEqual(STREET_TOLERANCE_M);
      }
    }
    // routers keep their grid spots, mostly in the blocks between the streets
    const routers = nodes.filter((n) => n.kind === 'router');
    const offStreet = routers.filter((n) => distanceToStreets(terrain, n) > 10);
    expect(offStreet.length).toBeGreaterThan(routers.length / 4);
  });

  it('assigns ranges, credentials and backhaul by kind; every node starts PEACE and empty', () => {
    for (const n of nodes) {
      expect(n.mode).toBe('PEACE');
      expect(n.alive).toBe(true);
      expect(n.seen.size).toBe(0);
      expect(n.inbox).toEqual([]);
      expect(n.walk).toBeNull();
      if (n.kind === 'router') {
        expect(n.range).toBe(counts.range.router);
        expect(n.credential.kind).toBe('relay');
        expect(n.backhaul).toBe('none');
      } else if (n.kind === 'gateway') {
        expect(n.range).toBe(counts.range.gateway);
        expect(n.credential.kind).toBe('relay');
        expect(n.backhaul).toBe('satellite');
        expect(n.batteryBacked).toBe(false);
      } else {
        expect(n.range).toBe(counts.range.mobile);
        expect(n.backhaul).toBe('cellular');
        expect(['citizen', 'none']).toContain(n.credential.kind);
      }
    }
  });

  it('applies the unregistered and battery-backed fractions', () => {
    const unregistered = nodes.filter((n) => n.kind === 'mobile' && n.credential.kind === 'none');
    expect(unregistered).toHaveLength(Math.round(0.1 * counts.mobiles));
    const battery = nodes.filter((n) => n.kind === 'router' && n.batteryBacked);
    expect(battery).toHaveLength(Math.round(0.1 * counts.routers));
  });

  it('keeps gateways near the inset corners (snapped onto the nearest street)', () => {
    const anchors = [
      [0.12, 0.12],
      [0.88, 0.88],
      [0.88, 0.12],
      [0.12, 0.88],
    ] as const;
    anchors.forEach(([fx, fy], i) => {
      const g = nodes.find((n) => n.id === `g-${pad(i + 1, 2)}`)!;
      expect(Math.hypot(g.x - fx * KRAKOW_WIDTH, g.y - fy * KRAKOW_HEIGHT)).toBeLessThan(150);
    });
  });

  it('is deterministic per seed and differs across seeds', () => {
    const again = generateWorld(config, new Prng(42), terrain);
    const pos = (ns: typeof nodes) =>
      ns.map((n) => [n.id, n.x, n.y, n.credential.kind, n.batteryBacked]);
    expect(pos(again)).toEqual(pos(nodes));
    const other = generateWorld(config, new Prng(7), terrain);
    expect(pos(other)).not.toEqual(pos(nodes));
  });

  it('handles empty counts', () => {
    expect(
      generateWorld({ ...config, mobiles: 0, routers: 0, gateways: 0 }, new Prng(1), terrain),
    ).toEqual([]);
  });
});

describe('generateWorld on a procedural map (any other seed)', () => {
  const { terrain, config } = onTerrain({
    ...DEFAULT_WORLD_CONFIG,
    seed: 7,
    width: 1000,
    height: 700,
    mobiles: 40,
    routers: 25,
    gateways: 2,
  });
  const nodes = generateWorld(config, new Prng(7), terrain);

  it('keeps the configured size, phones and gateways on streets and routers out of parks', () => {
    expect([config.width, config.height]).toEqual([1000, 700]);
    expect(nodes).toHaveLength(67);
    for (const n of nodes) {
      if (n.kind === 'router') expect(isRouterSpot(terrain, n), n.id).toBe(true);
      else expect(distanceToStreets(terrain, n)).toBeLessThanOrEqual(STREET_TOLERANCE_M);
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.x).toBeLessThanOrEqual(1000);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeLessThanOrEqual(700);
    }
  });

  it('defaults the terrain from the config', () => {
    const implicit = generateWorld(config, new Prng(7));
    expect(implicit.map((n) => [n.id, n.x, n.y])).toEqual(nodes.map((n) => [n.id, n.x, n.y]));
  });
});
