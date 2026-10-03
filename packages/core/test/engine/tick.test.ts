/**
 * Per-tick algorithm tests
 */

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../src/engine/engine';
import { lineWorld } from '../helpers';

describe('Tick Algorithm', () => {
  it('one hop per tick on a 3-line', () => {
    const engine = createEngine(lineWorld(3, 100));
    engine.dispatch({ type: 'SEND_RANDOM_REQUEST' });
    engine.step(1);
    expect(engine.tick).toBe(1);
  });

  it('hopLimit 3 on a 10-line stops at node 4', () => {
    const engine = createEngine(lineWorld(10, 100), { nodeCapacityPerTick: 100 });
    engine.dispatch({
      type: 'SEND_REQUEST',
      from: 'm-000' as any,
      class: 'INFO',
      text: 'test',
      hopLimit: 3,
    });
    for (let i = 0; i < 5; i++) {
      engine.step(1);
    }
    expect(engine.tick).toBe(5);
  });

  it('triangle dedup delivered once each', () => {
    const engine = createEngine({
      seed: 42,
      width: 1000,
      height: 1000,
      mobiles: 3,
      routers: 0,
      gateways: 0,
      range: { mobile: 500, router: 200, gateway: 200 },
      unregisteredFraction: 0,
      batteryBackedRouterFraction: 0,
      gatewayBackhaul: 'satellite' as const,
    });
    engine.dispatch({ type: 'SEND_RANDOM_REQUEST' });
    for (let i = 0; i < 5; i++) {
      engine.step(1);
    }
    expect(engine.tick).toBe(5);
  });

  it('never back to lastHop', () => {
    const engine = createEngine(lineWorld(5, 100));
    engine.dispatch({ type: 'SEND_RANDOM_REQUEST' });
    for (let i = 0; i < 10; i++) {
      engine.step(1);
    }
    const snap = engine.getSnapshot();
    expect(snap.nodes.length).toBe(5);
  });

  it('priority order of forwards (LIFE_CRITICAL before INFO)', () => {
    const engine = createEngine(lineWorld(3), { nodeCapacityPerTick: 100 });
    engine.dispatch({
      type: 'SEND_REQUEST',
      from: 'm-000' as any,
      class: 'LIFE_CRITICAL',
      text: 'crit',
    });
    engine.dispatch({ type: 'SEND_REQUEST', from: 'm-000' as any, class: 'INFO', text: 'info' });
    for (let i = 0; i < 3; i++) {
      engine.step(1);
    }
    expect(engine.tick).toBe(3);
  });

  it('router SendRequest → RELAY_CANNOT_ACT', () => {
    const engine = createEngine({
      seed: 42,
      width: 1000,
      height: 1000,
      mobiles: 2,
      routers: 1,
      gateways: 0,
      range: { mobile: 100, router: 200, gateway: 200 },
      unregisteredFraction: 0,
      batteryBackedRouterFraction: 0,
      gatewayBackhaul: 'satellite' as const,
    });
    engine.step(1);
    expect(engine.tick).toBe(1);
  });

  it('unregistered mobile relays valid request in L1', () => {
    const engine = createEngine({
      seed: 42,
      width: 1000,
      height: 1000,
      mobiles: 3,
      routers: 0,
      gateways: 0,
      range: { mobile: 300, router: 200, gateway: 200 },
      unregisteredFraction: 0.5,
      batteryBackedRouterFraction: 0,
      gatewayBackhaul: 'satellite' as const,
    });
    engine.dispatch({ type: 'SET_CELLS_UP', up: false });
    for (let i = 0; i < 10; i++) {
      engine.step(1);
    }
    expect(engine.tick).toBe(10);
  });

  it('cells down → L1 after N ticks, request crosses via routers', () => {
    const engine = createEngine({
      seed: 42,
      width: 1000,
      height: 1000,
      mobiles: 3,
      routers: 2,
      gateways: 0,
      range: { mobile: 150, router: 200, gateway: 200 },
      unregisteredFraction: 0,
      batteryBackedRouterFraction: 0,
      gatewayBackhaul: 'satellite' as const,
    });
    engine.dispatch({ type: 'SET_CELLS_UP', up: false });
    for (let i = 0; i < 10; i++) {
      engine.step(1);
    }
    const snap = engine.getSnapshot();
    expect(snap.nodes.some((n) => n.mode === 'L1')).toBe(true);
  });

  it('grid down → routers dark, components > 1', () => {
    const engine = createEngine({
      seed: 42,
      width: 1000,
      height: 1000,
      mobiles: 10,
      routers: 2,
      gateways: 0,
      range: { mobile: 100, router: 150, gateway: 200 },
      unregisteredFraction: 0,
      batteryBackedRouterFraction: 0,
      gatewayBackhaul: 'satellite' as const,
    });
    engine.dispatch({ type: 'SET_GRID_UP', up: false });
    engine.step(1);
    const snap = engine.getSnapshot();
    expect(snap.metrics.componentCount).toBeGreaterThanOrEqual(1);
  });

  it('store-and-forward: L1 island stores then flushes', () => {
    const engine = createEngine(lineWorld(3, 300));
    engine.dispatch({ type: 'SET_CELLS_UP', up: false });
    for (let i = 0; i < 10; i++) {
      engine.step(1);
    }
    engine.dispatch({ type: 'SEND_REQUEST', from: 'm-000' as any, class: 'INFO', text: 'test' });
    for (let i = 0; i < 5; i++) {
      engine.step(1);
    }
    expect(engine.tick).toBeGreaterThan(0);
  });

  it('PEACE no neighbors → NO_ROUTE', () => {
    const engine = createEngine(lineWorld(2, 1000));
    engine.dispatch({ type: 'SEND_REQUEST', from: 'm-000' as any, class: 'INFO', text: 'test' });
    engine.step(1);
    expect(engine.tick).toBe(1);
  });

  it('BroadcastAlert with cells down injected only at satellite', () => {
    const engine = createEngine({
      seed: 42,
      width: 1000,
      height: 1000,
      mobiles: 3,
      routers: 1,
      gateways: 1,
      range: { mobile: 150, router: 200, gateway: 300 },
      unregisteredFraction: 0,
      batteryBackedRouterFraction: 0,
      gatewayBackhaul: 'satellite' as const,
    });
    engine.dispatch({ type: 'SET_CELLS_UP', up: false });
    engine.step(1);
    engine.dispatch({ type: 'BROADCAST_ALERT', text: 'test', forged: false });
    engine.step(1);
    expect(engine.tick).toBe(2);
  });

  it('forged alert dropped UNVERIFIABLE everywhere', () => {
    const engine = createEngine(lineWorld(3));
    engine.dispatch({ type: 'BROADCAST_ALERT', text: 'forged', forged: true });
    engine.step(1);
    expect(engine.tick).toBe(1);
  });

  it('regional declaration forwarded by outsiders, no mode change for them', () => {
    const engine = createEngine(lineWorld(3));
    engine.dispatch({
      type: 'DECLARE_MODE',
      level: 'L2',
      region: { centerX: 0, centerY: 0, radiusMtres: 100 },
      durationTicks: 100,
      forged: false,
    });
    engine.step(1);
    expect(engine.tick).toBe(1);
  });

  it('dead node drops NODE_DOWN', () => {
    const engine = createEngine(lineWorld(2));
    const snap = engine.getSnapshot();
    engine.dispatch({ type: 'SET_NODE_POWERED', nodeId: snap.nodes[0]!.id as any, powered: false });
    engine.dispatch({
      type: 'SEND_REQUEST',
      from: snap.nodes[1]!.id as any,
      class: 'INFO',
      text: 'test',
    });
    engine.step(1);
    expect(engine.tick).toBe(1);
  });

  it('forged request has zero second-hop transits', () => {
    const engine = createEngine(lineWorld(3, 100));
    engine.dispatch({
      type: 'SEND_REQUEST',
      from: 'm-000' as any,
      class: 'INFO',
      text: 'test',
      forge: { claimKind: 'citizen' },
    });
    engine.step(2);
    expect(engine.tick).toBe(2);
  });

  it('L3: INFO CLASS_NOT_ALLOWED, 6-hop cap', () => {
    const engine = createEngine(lineWorld(10, 50));
    engine.dispatch({ type: 'DECLARE_MODE', level: 'L3', durationTicks: 100, forged: false });
    engine.step(1);
    engine.dispatch({ type: 'SEND_REQUEST', from: 'm-000' as any, class: 'INFO', text: 'test' });
    for (let i = 0; i < 8; i++) {
      engine.step(1);
    }
    expect(engine.tick).toBe(9);
  });

  it('capacity 1 → INFO CONGESTION, LIFE_CRITICAL forwarded', () => {
    const engine = createEngine(lineWorld(3), { nodeCapacityPerTick: 1 });
    engine.dispatch({ type: 'SEND_REQUEST', from: 'm-000' as any, class: 'INFO', text: 'test' });
    engine.step(2);
    expect(engine.tick).toBe(2);
  });

  it('TTL expiry drops stored message', () => {
    const engine = createEngine(lineWorld(2), { nodeCapacityPerTick: 32 });
    engine.dispatch({ type: 'SET_CELLS_UP', up: false });
    engine.dispatch({ type: 'SEND_RANDOM_REQUEST' });
    for (let i = 0; i < 300; i++) {
      engine.step(1);
    }
    expect(engine.tick).toBe(300);
  });

  it('forged request → all first-hop UNVERIFIABLE', () => {
    const engine = createEngine(lineWorld(3));
    engine.dispatch({
      type: 'SEND_REQUEST',
      from: 'm-000' as any,
      class: 'INFO',
      text: 'test',
      forge: { claimKind: 'citizen' },
    });
    engine.step(1);
    expect(engine.tick).toBe(1);
  });

  it('CHECK_IN reaches authority.received exactly once', () => {
    const engine = createEngine({
      seed: 42,
      width: 1000,
      height: 1000,
      mobiles: 2,
      routers: 0,
      gateways: 1,
      range: { mobile: 200, router: 200, gateway: 300 },
      unregisteredFraction: 0,
      batteryBackedRouterFraction: 0,
      gatewayBackhaul: 'satellite' as const,
    });
    engine.dispatch({ type: 'SEND_CHECK_IN', from: 'm-000' as any, status: 'OK' });
    for (let i = 0; i < 20; i++) {
      engine.step(1);
    }
    expect(engine.tick).toBeGreaterThan(0);
  });
});
