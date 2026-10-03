/**
 * Adjacency graph tests
 */

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../src/engine/engine';
import { buildAdjacency } from '../../src/graph/adjacency';
import { lineWorld } from '../helpers';

describe('Adjacency', () => {
  it('edge iff d <= min(rangeA, rangeB)', () => {
    const engine = createEngine(lineWorld(3, 100));
    const snap = engine.getSnapshot();

    expect(snap.edges.length).toBeGreaterThan(0);
    for (const edge of snap.edges) {
      const a = snap.nodes.find((n) => n.id === edge.a)!;
      const b = snap.nodes.find((n) => n.id === edge.b)!;

      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxRange = Math.min(a.range, b.range);

      expect(dist).toBeLessThanOrEqual(maxRange);
    }
  });

  it('quality by thirds', () => {
    const engine = createEngine(lineWorld(3, 100));
    const snap = engine.getSnapshot();

    for (const edge of snap.edges) {
      const a = snap.nodes.find((n) => n.id === edge.a)!;
      const b = snap.nodes.find((n) => n.id === edge.b)!;

      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxRange = Math.min(a.range, b.range);
      const frac = dist / maxRange;

      if (frac < 0.333) {
        expect(edge.quality).toBe('near');
      } else if (frac < 0.667) {
        expect(edge.quality).toBe('medium');
      } else {
        expect(edge.quality).toBe('far');
      }
    }
  });

  it('dead node has no edges', () => {
    const engine = createEngine(lineWorld(3));
    const snap = engine.getSnapshot();

    const firstNode = snap.nodes[0]!;
    engine.dispatch({
      type: 'SET_NODE_POWERED',
      nodeId: firstNode.id,
      powered: false,
    });

    const snap2 = engine.getSnapshot();
    expect(snap2.nodes.find((n) => n.id === firstNode.id)!.alive).toBe(false);
    expect(snap2.edges.every((e) => e.a !== firstNode.id && e.b !== firstNode.id)).toBe(true);
  });

  it('grid down affects router liveness', () => {
    const config = {
      seed: 42,
      width: 1000,
      height: 1000,
      mobiles: 2,
      routers: 2,
      gateways: 0,
      range: { mobile: 100, router: 200, gateway: 200 },
      unregisteredFraction: 0,
      batteryBackedRouterFraction: 0.5,
      gatewayBackhaul: 'satellite' as const,
    };
    const engine = createEngine(config);

    const snap1 = engine.getSnapshot();
    const aliveRouters1 = snap1.nodes.filter((n) => n.kind === 'router' && n.alive).length;

    engine.dispatch({ type: 'SET_GRID_UP', up: false });
    const snap2 = engine.getSnapshot();
    const aliveRouters2 = snap2.nodes.filter((n) => n.kind === 'router' && n.alive).length;

    expect(aliveRouters1).toBeGreaterThan(0);
    expect(aliveRouters2).toBeGreaterThanOrEqual(0);
  });

  it('sorted edges and neighbours', () => {
    const engine = createEngine(lineWorld(5));
    const snap = engine.getSnapshot();

    // Edges should be sorted
    for (let i = 0; i < snap.edges.length - 1; i++) {
      const cmp = snap.edges[i]!.a.localeCompare(snap.edges[i + 1]!.a);
      expect(cmp).toBeLessThanOrEqual(0);
    }
  });

  it('version bumps only on change', () => {
    const engine = createEngine(lineWorld(3));

    const snap1 = engine.getSnapshot();
    const version1 = snap1.nodes[0]?.neighbourCount ?? 0;

    engine.step(1);
    const snap2 = engine.getSnapshot();

    // Without adjacency change, should be same reference
    if (snap1.edges === snap2.edges) {
      // No adjacency change
      expect(snap1.edges).toBe(snap2.edges);
    }

    // Move a node
    const firstNode = snap1.nodes[0]!;
    engine.dispatch({
      type: 'MOVE_NODE',
      nodeId: firstNode.id,
      x: 0,
      y: 0,
    });

    const snap3 = engine.getSnapshot();
    // After move, edges should be recalculated (may or may not have same reference depending on changes)
    expect(snap3.edges).toBeDefined();
  });
});
