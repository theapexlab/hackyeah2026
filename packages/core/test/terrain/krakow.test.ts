import { describe, expect, it } from 'vitest';
import { DEFAULT_WORLD_CONFIG } from '../../src/domain/config';
import { pointInPolygon } from '../../src/terrain/geometry';
import { PARK_GATE_RADIUS_M, resolveTerrain } from '../../src/terrain/index';
import {
  KRAKOW_HEIGHT,
  KRAKOW_SEED,
  KRAKOW_TERRAIN_ID,
  KRAKOW_WIDTH,
} from '../../src/terrain/krakow';
import { inWater } from '../../src/terrain/placement';

describe('the Kraków (Kazimierz) map', () => {
  const t = resolveTerrain({ seed: KRAKOW_SEED, width: 300, height: 300 });
  const g = t.graph;

  it('is loaded for seed 42 whatever the configured size, once', () => {
    expect(t.id).toBe(KRAKOW_TERRAIN_ID);
    expect([t.width, t.height]).toEqual([KRAKOW_WIDTH, KRAKOW_HEIGHT]);
    expect(resolveTerrain(DEFAULT_WORLD_CONFIG)).toBe(t);
  });

  it('keeps every street, park and river vertex inside the map', () => {
    const all = [...t.streets, ...t.parks, ...t.water].flatMap((s) => s.pts);
    for (const p of all) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(KRAKOW_WIDTH);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(KRAKOW_HEIGHT);
    }
    expect(t.water).toHaveLength(1);
    expect(t.parks.length).toBeGreaterThanOrEqual(15);
    expect(t.streets.filter((s) => s.major).length).toBeGreaterThanOrEqual(8);
    expect(t.labels.map((l) => l.text)).toContain('Kazimierz');
  });

  it('has one street network spanning (almost) the whole map', () => {
    const sizes = new Map<number, number>();
    for (const c of g.componentOf) sizes.set(c, (sizes.get(c) ?? 0) + 1);
    const largest = Math.max(...sizes.values());
    expect(largest / g.nodes.length).toBeGreaterThan(0.98);
    expect(g.totalLength).toBeGreaterThan(40_000);
  });

  it('crosses the Vistula only on its bridges', () => {
    // group bridge edges into crossings
    const parent = new Map<number, number>();
    const find = (x: number): number => {
      let r = x;
      while (parent.get(r) !== r) r = parent.get(r)!;
      return r;
    };
    for (const e of g.edges.filter((x) => x.bridge)) {
      for (const n of [e.a, e.b]) if (!parent.has(n)) parent.set(n, n);
      parent.set(find(e.a), find(e.b));
    }
    const crossings = new Set([...parent.keys()].map(find));
    // Dębnicki, Grunwaldzki, Piłsudskiego, Bernatka, Powstańców Śląskich, Kotlarski + the Wilga
    expect(crossings.size).toBe(7);
    g.inWater.forEach((wet, i) => {
      if (!wet) return;
      for (const ei of g.adjacency[i]!) expect(g.edges[ei]!.bridge).toBe(true);
    });
    expect(g.inWater.filter(Boolean).length).toBeLessThan(0.02 * g.nodes.length);
  });

  it('gives (almost) every park a gate and keeps parks out of the river', () => {
    const gated = t.parkGates.filter((gates) => gates.length > 0).length;
    expect(gated).toBeGreaterThanOrEqual(t.parks.length - 1);
    expect(PARK_GATE_RADIUS_M).toBe(20);
    for (const gates of t.parkGates) {
      for (const n of gates) expect(g.inWater[n]).toBe(false);
    }
    // riverside greens share their edge with the river; their areas barely overlap
    t.parks.forEach((park) => {
      const xs = park.pts.map((v) => v.x);
      const ys = park.pts.map((v) => v.y);
      let insidePark = 0;
      let wet = 0;
      for (let x = Math.min(...xs); x <= Math.max(...xs); x += 3) {
        for (let y = Math.min(...ys); y <= Math.max(...ys); y += 3) {
          if (!pointInPolygon({ x, y }, park.pts)) continue;
          insidePark++;
          if (inWater(t, { x, y })) wet++;
        }
      }
      expect(wet / Math.max(1, insidePark)).toBeLessThan(0.1);
    });
    const river = t.water[0]!.pts;
    expect(pointInPolygon({ x: 700 * 1.1, y: 1040 * (1300 / 1235) }, river)).toBe(true);
  });
});
