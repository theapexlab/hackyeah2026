import { describe, expect, it } from 'vitest';
import { nodeId } from '../../src/domain/ids';
import type { Node } from '../../src/domain/node';
import type { EdgeView } from '../../src/domain/snapshot';
import { buildAdjacency, edgesEqual } from '../../src/graph/adjacency';
import { dist2, qualityBucket } from '../../src/graph/distance';
import { Prng } from '../../src/prng';
import { lineNodes, makeNode } from '../helpers';

/** The plain O(n^2) double loop the grid version must reproduce exactly. */
function bruteForce(nodes: readonly Node[]) {
  const neighbours = new Map(nodes.map((n) => [n.id, [] as string[]] as const));
  const edges: EdgeView[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i]!;
    if (!a.alive) continue;
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j]!;
      if (!b.alive) continue;
      const range = Math.min(a.range, b.range);
      const d2 = dist2(a.x, a.y, b.x, b.y);
      if (d2 > range * range) continue;
      neighbours.get(a.id)!.push(b.id);
      neighbours.get(b.id)!.push(a.id);
      edges.push({ a: a.id, b: b.id, quality: qualityBucket(Math.sqrt(d2), range) });
    }
  }
  return { neighbours, edges };
}

describe('buildAdjacency', () => {
  it('matches the plain double loop exactly on random worlds (grid shortcut)', () => {
    const prng = new Prng(11);
    for (let round = 0; round < 20; round++) {
      const n = 50 + prng.int(250);
      const nodes = Array.from({ length: n }, (_, i) =>
        makeNode({
          id: `m-${String(i + 1).padStart(4, '0')}`,
          x: prng.float(-50, 1500),
          y: prng.float(-50, 900),
          range: [0, 30, 60, 120, 250][prng.int(5)]!,
          alive: prng.next() > 0.1,
        }),
      );
      const got = buildAdjacency(nodes);
      const want = bruteForce(nodes);
      expect(got.edges).toEqual(want.edges);
      expect([...got.neighbours]).toEqual([...want.neighbours]);
    }
  });

  it('makes an edge iff distance <= min(rangeA, rangeB), boundary inclusive', () => {
    const nodes = [
      makeNode({ id: 'm-001', x: 0, y: 0, range: 60 }),
      makeNode({ id: 'm-002', x: 60, y: 0, range: 120 }), // exactly 60 from m-001
      makeNode({ id: 'm-003', x: 160, y: 0, range: 120 }), // 100 from m-002, 160 from m-001
    ];
    const { edges, neighbours } = buildAdjacency(nodes);
    expect(edges).toEqual([
      { a: 'm-001', b: 'm-002', quality: 'far' },
      { a: 'm-002', b: 'm-003', quality: 'far' },
    ]);
    expect(neighbours.get(nodeId('m-001'))).toEqual(['m-002']);
    expect(neighbours.get(nodeId('m-002'))).toEqual(['m-001', 'm-003']);
    expect(neighbours.get(nodeId('m-003'))).toEqual(['m-002']);
  });

  it('uses the smaller range for both the edge test and the quality bucket', () => {
    const nodes = [
      makeNode({ id: 'm-001', x: 0, y: 0, range: 60 }),
      makeNode({ id: 'r-001', x: 50, y: 0, range: 300, kind: 'router' }),
    ];
    const { edges } = buildAdjacency(nodes);
    // d=50 is 'near' under range 300 but 'far' under the binding range 60.
    expect(edges).toEqual([{ a: 'm-001', b: 'r-001', quality: 'far' }]);
    expect(
      buildAdjacency([nodes[0]!, makeNode({ id: 'r-001', x: 61, y: 0, range: 300 })]).edges,
    ).toHaveLength(0);
  });

  it('buckets quality by thirds of the range', () => {
    const at = (x: number) => [
      makeNode({ id: 'm-001', x: 0, y: 0, range: 90 }),
      makeNode({ id: 'm-002', x, y: 0, range: 90 }),
    ];
    expect(buildAdjacency(at(30)).edges[0]?.quality).toBe('near');
    expect(buildAdjacency(at(31)).edges[0]?.quality).toBe('medium');
    expect(buildAdjacency(at(60)).edges[0]?.quality).toBe('medium');
    expect(buildAdjacency(at(61)).edges[0]?.quality).toBe('far');
    expect(buildAdjacency(at(90)).edges[0]?.quality).toBe('far');
    expect(buildAdjacency(at(91)).edges).toHaveLength(0);
  });

  it('a dead node (dark router) has no edges and is absent from its neighbours lists', () => {
    const nodes = lineNodes(3, 50, { range: 60 });
    const line = buildAdjacency(nodes);
    expect(line.edges).toHaveLength(2);

    nodes[1]!.alive = false;
    const { edges, neighbours } = buildAdjacency(nodes);
    expect(edges).toHaveLength(0);
    expect(neighbours.get(nodeId('m-001'))).toEqual([]);
    expect(neighbours.get(nodeId('m-002'))).toEqual([]);
    expect(neighbours.get(nodeId('m-003'))).toEqual([]);
  });

  it('an alive battery-backed router keeps its edges', () => {
    const nodes = [
      makeNode({ id: 'm-001', x: 0, y: 0, range: 60 }),
      makeNode({ id: 'r-001', x: 40, y: 0, range: 120, kind: 'router', batteryBacked: true }),
    ];
    expect(buildAdjacency(nodes).edges).toEqual([{ a: 'm-001', b: 'r-001', quality: 'medium' }]);
  });

  it('every input node has a neighbours entry, dead ones empty', () => {
    const nodes = [makeNode({ id: 'm-001' }), makeNode({ id: 'm-002', alive: false, x: 10 })];
    const { neighbours } = buildAdjacency(nodes);
    expect([...neighbours.keys()]).toEqual(['m-001', 'm-002']);
    expect(neighbours.get(nodeId('m-002'))).toEqual([]);
  });

  it('emits edges sorted by (a, b) with a < b and neighbour lists sorted by id', () => {
    // A 2x3 grid of mobiles, spacing 50, range 60: horizontal and vertical edges only.
    const nodes = [
      makeNode({ id: 'm-001', x: 0, y: 0 }),
      makeNode({ id: 'm-002', x: 50, y: 0 }),
      makeNode({ id: 'm-003', x: 100, y: 0 }),
      makeNode({ id: 'm-004', x: 0, y: 50 }),
      makeNode({ id: 'm-005', x: 50, y: 50 }),
      makeNode({ id: 'm-006', x: 100, y: 50 }),
    ];
    const { edges, neighbours } = buildAdjacency(nodes);
    const pairs = edges.map((e) => `${e.a}-${e.b}`);
    expect(pairs).toEqual([
      'm-001-m-002',
      'm-001-m-004',
      'm-002-m-003',
      'm-002-m-005',
      'm-003-m-006',
      'm-004-m-005',
      'm-005-m-006',
    ]);
    for (const e of edges) expect(e.a < e.b).toBe(true);
    for (const list of neighbours.values()) {
      expect(list).toEqual([...list].sort());
    }
    expect(neighbours.get(nodeId('m-005'))).toEqual(['m-002', 'm-004', 'm-006']);
  });

  it('is pure: does not touch node.neighbourIds', () => {
    const nodes = lineNodes(2, 10);
    buildAdjacency(nodes);
    expect(nodes[0]!.neighbourIds).toEqual([]);
  });
});

describe('edgesEqual', () => {
  it('is true for identical rebuilds and false after any topology or quality change', () => {
    const nodes = lineNodes(4, 50, { range: 120 });
    const first = buildAdjacency(nodes).edges;
    const again = buildAdjacency(nodes).edges;
    expect(first).not.toBe(again);
    expect(edgesEqual(first, again)).toBe(true);
    expect(edgesEqual(first, first)).toBe(true);

    // quality change only (m-002 moves from 50 to 30 from m-001: medium -> near)
    nodes[1]!.x = 30;
    nodes[2]!.x = 80;
    nodes[3]!.x = 130;
    const moved = buildAdjacency(nodes).edges;
    expect(moved.length).toBe(first.length);
    expect(edgesEqual(first, moved)).toBe(false);

    // length change
    nodes[3]!.alive = false;
    expect(edgesEqual(moved, buildAdjacency(nodes).edges)).toBe(false);
    expect(edgesEqual([], [])).toBe(true);
  });
});
