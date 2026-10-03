import { describe, expect, it } from 'vitest';
import { nodeId } from '../../src/domain/ids';
import { buildAdjacency } from '../../src/graph/adjacency';
import { connectedComponents } from '../../src/graph/components';
import { makeNode } from '../helpers';

/** Two islands of three mobiles each, 1000 m apart; only the west island has a gateway. */
function twoIslands() {
  return [
    makeNode({ id: 'g-01', kind: 'gateway', x: 100, y: 0, range: 150, backhaul: 'satellite' }),
    makeNode({ id: 'm-001', x: 0, y: 0, hasBackhaul: false }),
    makeNode({ id: 'm-002', x: 50, y: 0, hasBackhaul: false }),
    makeNode({ id: 'm-003', x: 100, y: 0, hasBackhaul: false }),
    makeNode({ id: 'm-004', x: 1000, y: 0, hasBackhaul: false }),
    makeNode({ id: 'm-005', x: 1050, y: 0, hasBackhaul: false }),
    makeNode({ id: 'm-006', x: 1100, y: 0, hasBackhaul: false }),
  ];
}

describe('connectedComponents', () => {
  it('finds two islands and labels them in id order', () => {
    const nodes = twoIslands();
    const { neighbours } = buildAdjacency(nodes);
    const c = connectedComponents(nodes, neighbours);
    expect(c.count).toBe(2);
    expect(c.sizes).toEqual([4, 3]);
    // g-01 is lexically first ('g' < 'm'), so its island is component 0.
    expect(c.componentOf.get(nodeId('g-01'))).toBe(0);
    expect(c.componentOf.get(nodeId('m-001'))).toBe(0);
    expect(c.componentOf.get(nodeId('m-003'))).toBe(0);
    expect(c.componentOf.get(nodeId('m-004'))).toBe(1);
    expect(c.componentOf.get(nodeId('m-006'))).toBe(1);
  });

  it('marks only the island that contains an alive backhaul node', () => {
    const nodes = twoIslands();
    const { neighbours } = buildAdjacency(nodes);
    const c = connectedComponents(nodes, neighbours);
    expect([...c.backhaulComponents]).toEqual([0]);

    nodes[0]!.hasBackhaul = false;
    expect(connectedComponents(nodes, neighbours).backhaulComponents.size).toBe(0);

    nodes[5]!.hasBackhaul = true; // m-005 regains cellular
    expect([...connectedComponents(nodes, neighbours).backhaulComponents]).toEqual([1]);
  });

  it('gives dead nodes component -1, never counts them, never traverses them', () => {
    const nodes = twoIslands();
    nodes[2]!.alive = false; // m-002 dies: west island splits into {g-01,m-003} and {m-001}
    nodes[2]!.hasBackhaul = true; // inconsistent on purpose; dead nodes must be ignored
    const { neighbours } = buildAdjacency(nodes);
    // simulate a stale neighbour list that still mentions the dead node
    neighbours.get(nodeId('m-001'))!.push(nodeId('m-002'));
    const c = connectedComponents(nodes, neighbours);
    expect(c.componentOf.get(nodeId('m-002'))).toBe(-1);
    expect(c.count).toBe(3);
    expect(c.sizes).toEqual([2, 1, 3]);
    expect(c.componentOf.get(nodeId('g-01'))).toBe(0);
    expect(c.componentOf.get(nodeId('m-003'))).toBe(0);
    expect(c.componentOf.get(nodeId('m-001'))).toBe(1);
    expect(c.componentOf.get(nodeId('m-004'))).toBe(2);
    expect([...c.backhaulComponents]).toEqual([0]);
  });

  it('handles an empty world and isolated nodes', () => {
    expect(connectedComponents([], new Map())).toEqual({
      componentOf: new Map(),
      sizes: [],
      count: 0,
      backhaulComponents: new Set(),
    });
    const lonely = [makeNode({ id: 'm-001', hasBackhaul: false })];
    const c = connectedComponents(lonely, buildAdjacency(lonely).neighbours);
    expect(c.count).toBe(1);
    expect(c.sizes).toEqual([1]);
    expect(c.componentOf.get(nodeId('m-001'))).toBe(0);
  });
});
