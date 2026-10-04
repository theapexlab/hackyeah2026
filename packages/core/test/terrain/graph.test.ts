import { describe, expect, it } from 'vitest';
import { Prng } from '../../src/prng';
import { nearestPointOnSegment, pointInPolygon } from '../../src/terrain/geometry';
import {
  buildStreetGraph,
  centralJunctions,
  distancesFrom,
  nearestPointOnGraph,
  randomPointInPolygon,
  randomPointOnStreets,
  shortestPath,
} from '../../src/terrain/graph';
import type { Polygon, Polyline, Pt, StreetGraph } from '../../src/terrain/types';

const P = (x: number, y: number): Pt => ({ x, y });
const street = (pts: Pt[], major = false): Polyline => ({ pts, major });
const square = (x0: number, y0: number, x1: number, y1: number): Polygon => ({
  pts: [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)],
});
const nodeAt = (g: StreetGraph, x: number, y: number) =>
  g.nodes.findIndex((n) => Math.hypot(n.x - x, n.y - y) < 1e-6);

describe('buildStreetGraph', () => {
  it('splits a crossing into a four-way junction', () => {
    const g = buildStreetGraph(
      [street([P(0, 50), P(100, 50)]), street([P(50, 0), P(50, 100)], true)],
      [],
    );
    expect(g.nodes).toHaveLength(5);
    expect(g.edges).toHaveLength(4);
    const centre = nodeAt(g, 50, 50);
    expect(g.adjacency[centre]).toHaveLength(4);
    expect(g.edges.filter((e) => e.major)).toHaveLength(2);
    expect(g.componentCount).toBe(1);
    expect(g.totalLength).toBeCloseTo(200);
  });

  it('turns an endpoint on another street (T-junction) and near misses into a shared node', () => {
    const t = buildStreetGraph([street([P(0, 0), P(100, 0)]), street([P(50, 5), P(50, 80)])], []);
    expect(t.nodes).toHaveLength(4);
    expect(t.edges).toHaveLength(3);
    expect(t.componentCount).toBe(1);
    // two streets ending 3 m apart become one node
    const near = buildStreetGraph(
      [street([P(0, 0), P(100, 0)]), street([P(103, 0), P(200, 0)])],
      [],
    );
    expect(near.nodes).toHaveLength(3);
    expect(near.componentCount).toBe(1);
  });

  it('dedups overlapping streets and drops zero-length pieces', () => {
    const g = buildStreetGraph(
      [
        street([P(0, 0), P(100, 0)]),
        street([P(0, 0), P(100, 0)], true),
        street([P(5, 5), P(5, 5)]),
      ],
      [],
    );
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0]!.major).toBe(true);
  });

  it('flags edges touching water as bridges, including a crossing with dry ends', () => {
    const river = square(40, -10, 60, 210);
    const g = buildStreetGraph(
      [street([P(0, 50), P(100, 50)]), street([P(0, 150), P(30, 150)])],
      [river],
    );
    const bridges = g.edges.filter((e) => e.bridge);
    expect(bridges).toHaveLength(1);
    expect(g.inWater.every((w) => !w)).toBe(true);
    expect(g.landTotalLength).toBeCloseTo(30);
    expect(g.totalLength).toBeCloseTo(130);
  });

  it('labels components and keeps adjacency ascending', () => {
    const g = buildStreetGraph(
      [street([P(0, 0), P(10, 0)]), street([P(100, 100), P(110, 100), P(110, 120)])],
      [],
    );
    expect(g.componentCount).toBe(2);
    expect(new Set(g.componentOf).size).toBe(2);
    for (const list of g.adjacency) expect([...list]).toEqual([...list].sort((a, b) => a - b));
  });
});

describe('graph queries', () => {
  // a 3 x 3 grid of 100 m blocks with a river through the middle column's top
  const lines: Polyline[] = [];
  for (let i = 0; i <= 3; i++) {
    lines.push(street([P(0, i * 100), P(300, i * 100)]));
    lines.push(street([P(i * 100, 0), P(i * 100, 300)]));
  }
  const g = buildStreetGraph(lines, []);

  it('nearestPointOnGraph projects onto the closest street and reports the nearer node', () => {
    const q = nearestPointOnGraph(g, P(130, 107))!;
    expect(q.x).toBeCloseTo(130);
    expect(q.y).toBeCloseTo(100);
    expect(q.distance).toBeCloseTo(7);
    expect(g.nodes[q.nearestNode]).toEqual(P(100, 100));
    expect(nearestPointOnGraph(buildStreetGraph([], []), P(0, 0))).toBeNull();
  });

  it('shortestPath follows streets (Manhattan length) and handles trivial cases', () => {
    const from = nodeAt(g, 0, 0);
    const to = nodeAt(g, 300, 200);
    const path = shortestPath(g, from, to);
    expect(path[0]).toBe(from);
    expect(path.at(-1)).toBe(to);
    let len = 0;
    for (let i = 1; i < path.length; i++) {
      const a = g.nodes[path[i - 1]!]!;
      const b = g.nodes[path[i]!]!;
      expect(a.x === b.x || a.y === b.y).toBe(true);
      len += Math.hypot(b.x - a.x, b.y - a.y);
    }
    expect(len).toBeCloseTo(500);
    expect(shortestPath(g, from, from)).toEqual([from]);
    expect(shortestPath(g, from, to)).toEqual(path); // deterministic
    const split = buildStreetGraph(
      [street([P(0, 0), P(10, 0)]), street([P(50, 50), P(60, 50)])],
      [],
    );
    expect(shortestPath(split, 0, split.nodes.length - 1)).toEqual([]);
  });

  it('distancesFrom measures street distance to every node', () => {
    const d = distancesFrom(g, nodeAt(g, 0, 0));
    expect(d[nodeAt(g, 300, 300)]).toBeCloseTo(600);
    expect(d[nodeAt(g, 100, 0)]).toBeCloseTo(100);
  });

  it('centralJunctions ranks hubs on major streets by closeness', () => {
    const withMajor = buildStreetGraph(
      lines.map((l, i) => (i === 2 ? street([...l.pts], true) : l)), // y = 100 is an avenue
      [],
    );
    const hubs = centralJunctions(withMajor);
    expect(hubs.every((h) => withMajor.nodes[h]!.y === 100)).toBe(true);
    expect([100, 200]).toContain(withMajor.nodes[hubs[0]!]!.x);
    expect(centralJunctions(withMajor)).toBe(hubs); // memoised
    // without avenues: the inner junctions of the grid come first
    const plain = centralJunctions(g);
    const first = g.nodes[plain[0]!]!;
    expect([100, 200]).toContain(first.x);
    expect([100, 200]).toContain(first.y);
    expect(centralJunctions(buildStreetGraph([], []))).toEqual([]);
  });

  it('randomPointOnStreets stays on a street, samples by length and skips bridges with land', () => {
    const prng = new Prng(3);
    for (let i = 0; i < 200; i++) {
      const p = randomPointOnStreets(g, prng, { land: false })!;
      const q = nearestPointOnGraph(g, p)!;
      expect(q.distance).toBeLessThan(1e-9);
    }
    const lopsided = buildStreetGraph(
      [street([P(0, 0), P(900, 0)]), street([P(0, 500), P(100, 500)])],
      [],
    );
    let long = 0;
    const r = new Prng(9);
    for (let i = 0; i < 2000; i++)
      if (randomPointOnStreets(lopsided, r, { land: false })!.y === 0) long++;
    expect(long / 2000).toBeGreaterThan(0.85);
    const bridged = buildStreetGraph(
      [street([P(0, 0), P(100, 0)]), street([P(0, 50), P(100, 50)])],
      [square(-10, 40, 110, 60)],
    );
    for (let i = 0; i < 100; i++) {
      expect(randomPointOnStreets(bridged, r, { land: true })!.y).toBe(0);
    }
    expect(randomPointOnStreets(buildStreetGraph([], []), r, { land: false })).toBeNull();
  });

  it('randomPointInPolygon respects the polygon and the accept test, deterministically', () => {
    const park = square(0, 0, 50, 20).pts;
    const a = randomPointInPolygon(park, new Prng(5), (p) => p.x > 25)!;
    expect(pointInPolygon(a, park)).toBe(true);
    expect(a.x).toBeGreaterThan(25);
    expect(randomPointInPolygon(park, new Prng(5), (p) => p.x > 25)).toEqual(a);
    expect(randomPointInPolygon(park, new Prng(5), () => false, 4)).toBeNull();
    expect(nearestPointOnSegment(a, P(0, 0), P(50, 0)).dist2).toBeGreaterThanOrEqual(0);
  });
});
