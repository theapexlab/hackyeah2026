import { describe, expect, it } from 'vitest';
import { g, m, r, twoIslandsWorld } from '../helpers';

describe('Components', () => {
  it('two islands -> 2 components, grouped as built', () => {
    const snap = twoIslandsWorld().getSnapshot();
    expect(snap.metrics.componentCount).toBe(2);
    const comp = (id: string) => snap.nodes.find((n) => n.id === id)!.componentId;
    expect(new Set([comp(m(0)), comp(m(1)), comp(m(2)), comp(r(0))]).size).toBe(1);
    expect(new Set([comp(m(3)), comp(m(4)), comp(m(5)), comp(g(0))]).size).toBe(1);
    expect(comp(m(0))).not.toBe(comp(m(3)));
  });

  it('component ids are deterministic: id order, starting at 0', () => {
    const snap = twoIslandsWorld().getSnapshot();
    // g-000 sorts first, so island B is component 0
    expect(snap.nodes.find((n) => n.id === g(0))!.componentId).toBe(0);
    expect(snap.nodes.find((n) => n.id === m(0))!.componentId).toBe(1);
  });

  it('authority reachable only for the island with a backhaul node (cells down)', () => {
    const engine = twoIslandsWorld();
    engine.dispatch({ type: 'SET_CELLS_UP', up: false });
    const snap = engine.getSnapshot();
    const backhaul = snap.nodes.filter((n) => n.hasBackhaul).map((n) => n.id);
    expect(backhaul).toEqual([g(0)]);
    expect(snap.metrics.authorityReachableFraction).toBe(0.5);
  });

  it('with cells up both islands touch a backhaul node', () => {
    const snap = twoIslandsWorld().getSnapshot();
    expect(snap.metrics.authorityReachableFraction).toBe(1);
  });

  it('dead nodes are excluded from components (componentId -1) and from the count', () => {
    const engine = twoIslandsWorld();
    engine.dispatch({ type: 'SET_NODE_POWERED', nodeId: m(5), powered: false });
    const snap = engine.getSnapshot();
    expect(snap.nodes.find((n) => n.id === m(5))!.componentId).toBe(-1);
    expect(snap.metrics.componentCount).toBe(2);
  });

  it('moving a node out of range splits it into its own component', () => {
    const engine = twoIslandsWorld();
    engine.dispatch({ type: 'MOVE_NODE', nodeId: m(5), x: 500, y: 500 });
    expect(engine.getSnapshot().metrics.componentCount).toBe(3);
  });
});
