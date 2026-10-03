import { describe, expect, it } from 'vitest';
import type { NodeId } from '../../src/domain/ids';
import type { Node } from '../../src/domain/node';
import { buildAdjacency } from '../../src/graph/adjacency';
import { baseWorld, fakeNode, layout, m, r } from '../helpers';

const nodeMap = (nodes: Node[]): Map<NodeId, Node> => new Map(nodes.map((n) => [n.id, n]));

describe('Adjacency', () => {
  it('edge iff d <= min(rangeA, rangeB)', () => {
    const phone = fakeNode({ id: m(0), x: 0, y: 0, range: 60 });
    const router = fakeNode({ id: r(0), kind: 'router', x: 100, y: 0, range: 120 });
    // d = 100 > min(60, 120) = 60: no edge although within the router's own range
    expect(buildAdjacency(nodeMap([phone, router])).edges).toEqual([]);
    router.x = 60; // exactly on the boundary
    expect(buildAdjacency(nodeMap([phone, router])).edges).toHaveLength(1);
    router.x = 60.01;
    expect(buildAdjacency(nodeMap([phone, router])).edges).toHaveLength(0);
  });

  it('range is symmetric: the smaller range decides', () => {
    const a = fakeNode({ id: m(0), x: 0, range: 200 });
    const b = fakeNode({ id: m(1), x: 150, range: 100 });
    expect(buildAdjacency(nodeMap([a, b])).edges).toEqual([]);
  });

  it('quality by thirds of min range', () => {
    const at = (d: number) => {
      const a = fakeNode({ id: m(0), x: 0, range: 90 });
      const b = fakeNode({ id: m(1), x: d, range: 90 });
      return buildAdjacency(nodeMap([a, b])).edges[0]!.quality;
    };
    expect(at(10)).toBe('near');
    expect(at(29)).toBe('near');
    expect(at(31)).toBe('medium');
    expect(at(59)).toBe('medium');
    expect(at(61)).toBe('far');
    expect(at(90)).toBe('far');
  });

  it('dead node has no edges, neither as a or b', () => {
    const nodes = [0, 1, 2].map((i) => fakeNode({ id: m(i), x: i * 10, range: 100 }));
    expect(buildAdjacency(nodeMap(nodes)).edges).toHaveLength(3);
    nodes[1]!.alive = false;
    const adj = buildAdjacency(nodeMap(nodes));
    expect(adj.edges).toEqual([{ a: m(0), b: m(2), quality: 'near' }]);
    expect(adj.neighbours.get(m(1))).toEqual([]);
  });

  it('dark router has no edges; battery-backed router keeps them (engine, grid down)', () => {
    const world = baseWorld({
      mobiles: 2,
      routers: 2,
      range: { mobile: 100, router: 150, gateway: 150 },
      batteryBackedRouterFraction: 0,
    });
    const positions = {
      [m(0)]: [100, 100] as [number, number],
      [m(1)]: [160, 100] as [number, number],
      [r(0)]: [130, 100] as [number, number],
      [r(1)]: [130, 140] as [number, number],
    };
    const dark = layout(world, positions);
    expect(dark.getSnapshot().edges).toHaveLength(6);
    dark.dispatch({ type: 'SET_GRID_UP', up: false });
    const darkSnap = dark.getSnapshot();
    expect(darkSnap.nodes.filter((n) => n.kind === 'router').every((n) => !n.alive)).toBe(true);
    expect(darkSnap.edges).toEqual([{ a: m(0), b: m(1), quality: 'medium' }]);

    const backed = layout({ ...world, batteryBackedRouterFraction: 1 }, positions);
    backed.dispatch({ type: 'SET_GRID_UP', up: false });
    const backedSnap = backed.getSnapshot();
    expect(backedSnap.nodes.filter((n) => n.kind === 'router').every((n) => n.alive)).toBe(true);
    expect(backedSnap.edges).toHaveLength(6);
  });

  it('edges and neighbour lists are sorted regardless of insertion order', () => {
    const nodes = [3, 1, 4, 0, 2].map((i) => fakeNode({ id: m(i), x: i * 10, range: 100 }));
    const adj = buildAdjacency(nodeMap(nodes));
    const keys = adj.edges.map((e) => `${e.a}|${e.b}`);
    expect(keys).toEqual([...keys].sort());
    expect(adj.edges.every((e) => e.a < e.b)).toBe(true);
    for (const list of adj.neighbours.values()) expect(list).toEqual([...list].sort());
    expect(adj.neighbours.get(m(2))).toEqual([m(0), m(1), m(3), m(4)]);
  });

  it('version bumps only when the edge set (or a quality bucket) changes; same ref otherwise', () => {
    const a = fakeNode({ id: m(0), x: 0, range: 90 });
    const b = fakeNode({ id: m(1), x: 10, range: 90 });
    const nodes = nodeMap([a, b]);
    const first = buildAdjacency(nodes);
    expect(first.version).toBe(1);

    expect(buildAdjacency(nodes, first)).toBe(first);

    b.x = 20; // same 'near' bucket
    expect(buildAdjacency(nodes, first)).toBe(first);

    b.x = 45; // near -> medium
    const second = buildAdjacency(nodes, first);
    expect(second).not.toBe(first);
    expect(second.version).toBe(2);

    b.x = 500; // edge gone
    const third = buildAdjacency(nodes, second);
    expect(third.version).toBe(3);
    expect(third.edges).toEqual([]);
  });

  it('engine: ADJACENCY events and snapshot.edges ref follow the version', () => {
    const engine = layout(baseWorld({ mobiles: 2 }), { [m(0)]: [100, 100], [m(1)]: [150, 100] });
    const edges0 = engine.getSnapshot().edges;
    const adjacencyEvents = () => engine.getEventLog().filter((e) => e.type === 'ADJACENCY').length;
    const before = adjacencyEvents();
    engine.step(5);
    expect(adjacencyEvents()).toBe(before);
    expect(engine.getSnapshot().edges).toBe(edges0);

    engine.dispatch({ type: 'MOVE_NODE', nodeId: m(1), x: 1500, y: 100 });
    expect(adjacencyEvents()).toBe(before + 1);
    expect(engine.getSnapshot().edges).not.toBe(edges0);
    expect(engine.getSnapshot().edges).toEqual([]);
  });
});
