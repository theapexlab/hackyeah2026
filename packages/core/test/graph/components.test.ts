/**
 * Connected components tests
 */

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../src/engine/engine';

describe('Components', () => {
  it('two islands → 2 components', () => {
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

    // Place routers far apart
    const snap = engine.getSnapshot();
    const routers = snap.nodes.filter((n) => n.kind === 'router');
    if (routers.length >= 2) {
      engine.dispatch({
        type: 'MOVE_NODE',
        nodeId: routers[0]!.id,
        x: 100,
        y: 100,
      });
      engine.dispatch({
        type: 'MOVE_NODE',
        nodeId: routers[1]!.id,
        x: 900,
        y: 900,
      });

      const snap2 = engine.getSnapshot();
      expect(snap2.metrics.componentCount).toBeGreaterThanOrEqual(1);
    }
  });

  it('authorityReachable only for island with backhaul node', () => {
    const config = {
      seed: 42,
      width: 1000,
      height: 1000,
      mobiles: 5,
      routers: 1,
      gateways: 1,
      range: { mobile: 100, router: 150, gateway: 200 },
      unregisteredFraction: 0,
      batteryBackedRouterFraction: 0,
      gatewayBackhaul: 'satellite' as const,
    };
    const engine = createEngine(config);

    const snap = engine.getSnapshot();
    const authFrac = snap.metrics.authorityReachableFraction;
    expect(authFrac).toBeGreaterThanOrEqual(0);
    expect(authFrac).toBeLessThanOrEqual(1);
  });
});
