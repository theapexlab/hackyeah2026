import { describe, expect, it } from 'vitest';
import { distanceToPolygonBoundary } from '../../src/terrain/geometry';
import { resolveTerrain } from '../../src/terrain/index';
import { KRAKOW_SEED } from '../../src/terrain/krakow';
import { proceduralTerrain } from '../../src/terrain/procedural';

declare const performance: { now(): number };

describe('procedural maps (every seed but 42)', () => {
  it('are deterministic per seed and differ across seeds', () => {
    expect(proceduralTerrain(7, 1000, 700)).toEqual(proceduralTerrain(7, 1000, 700));
    expect(proceduralTerrain(8, 1000, 700).streets).not.toEqual(
      proceduralTerrain(7, 1000, 700).streets,
    );
  });

  it('form one connected street grid with gated parks and no water', () => {
    for (const seed of [1, 7, 99, 12345]) {
      const t = resolveTerrain({ seed, width: 1000, height: 700 });
      expect(t.water).toEqual([]);
      expect(t.graph.componentCount).toBe(1);
      expect(t.graph.edges.length).toBeGreaterThan(0);
      t.parks.forEach((park, p) => {
        const gates = t.parkGates[p]!;
        expect(gates.length).toBeGreaterThan(0);
        const nearest = Math.min(
          ...gates.map((n) => distanceToPolygonBoundary(t.graph.nodes[n]!, park.pts)),
        );
        expect(nearest).toBeLessThanOrEqual(20);
      });
    }
  });

  it('stay cheap for huge areas', () => {
    const t0 = performance.now();
    const t = resolveTerrain({ seed: 3, width: 100_000, height: 100_000 });
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(t.streets.length).toBeLessThanOrEqual(120);
  });

  it('are cached per (seed, size) and forced with `procedural` even for seed 42', () => {
    const a = resolveTerrain({ seed: 5, width: 800, height: 600 });
    expect(resolveTerrain({ seed: 5, width: 800, height: 600 })).toBe(a);
    expect(resolveTerrain({ seed: 5, width: 801, height: 600 })).not.toBe(a);
    const forced = resolveTerrain(
      { seed: KRAKOW_SEED, width: 1000, height: 700 },
      { procedural: true },
    );
    expect(forced.id).toBe('procedural-42-1000x700');
    expect([forced.width, forced.height]).toEqual([1000, 700]);
  });
});
