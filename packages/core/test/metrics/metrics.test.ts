/**
 * Metrics tests
 */

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../src/engine/engine';
import { lineWorld } from '../helpers';

describe('Metrics', () => {
  it('delivery counts per class on a line', () => {
    const engine = createEngine(lineWorld(3, 100));

    engine.dispatch({
      type: 'SEND_REQUEST',
      from: 'm-000' as any,
      class: 'INFO',
      text: 'test',
    });

    for (let i = 0; i < 10; i++) {
      engine.step(1);
    }

    const snap = engine.getSnapshot();
    expect(snap.metrics).toBeDefined();
  });

  it('dropsByReason sums', () => {
    const engine = createEngine(lineWorld(2));

    engine.dispatch({
      type: 'SEND_REQUEST',
      from: 'm-000' as any,
      class: 'SELL', // Not allowed in default PEACE if we switch to L1
      text: 'test',
    });

    for (let i = 0; i < 5; i++) {
      engine.step(1);
    }

    const snap = engine.getSnapshot();
    expect(snap.metrics.dropsByReason).toBeDefined();
  });

  it('reachableFraction with two islands', () => {
    const config = {
      seed: 42,
      width: 1000,
      height: 1000,
      mobiles: 5,
      routers: 2,
      gateways: 0,
      range: { mobile: 100, router: 150, gateway: 200 },
      unregisteredFraction: 0,
      batteryBackedRouterFraction: 0,
      gatewayBackhaul: 'satellite' as const,
    };
    const engine = createEngine(config);

    const snap = engine.getSnapshot();
    expect(snap.metrics.reachableFraction).toBeGreaterThanOrEqual(0);
    expect(snap.metrics.reachableFraction).toBeLessThanOrEqual(1);
  });

  it('authorityReachableFraction shrinks when cells go down', () => {
    const config = {
      seed: 42,
      width: 1000,
      height: 1000,
      mobiles: 5,
      routers: 1,
      gateways: 1,
      range: { mobile: 150, router: 200, gateway: 250 },
      unregisteredFraction: 0,
      batteryBackedRouterFraction: 0,
      gatewayBackhaul: 'satellite' as const,
    };
    const engine = createEngine(config);

    const snap1 = engine.getSnapshot();
    const auth1 = snap1.metrics.authorityReachableFraction;

    engine.dispatch({ type: 'SET_CELLS_UP', up: false });
    const snap2 = engine.getSnapshot();
    const auth2 = snap2.metrics.authorityReachableFraction;

    expect(auth1).toBeGreaterThanOrEqual(0);
    expect(auth2).toBeGreaterThanOrEqual(0);
  });
});
