/**
 * Engine core tests
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createEngine } from '../src/engine/engine';
import { lineWorld, triangleWorld } from './helpers';

describe('SimEngine basic', () => {
  it('creates an engine with initial state', () => {
    const config = lineWorld(5);
    const engine = createEngine(config);

    expect(engine.tick).toBe(0);
    const snap = engine.getSnapshot();
    expect(snap.nodes.length).toBe(5);
    expect(snap.tick).toBe(0);
  });

  it('step increments tick', () => {
    const config = lineWorld(3);
    const engine = createEngine(config);

    const result1 = engine.step(1);
    expect(result1.tick).toBe(1);
    expect(engine.tick).toBe(1);

    const result5 = engine.step(4);
    expect(result5.tick).toBe(5);
    expect(engine.tick).toBe(5);
  });

  it('respects cellsUp flag', () => {
    const config = lineWorld(3);
    const engine = createEngine(config);

    let snap = engine.getSnapshot();
    expect(snap.world.cellsUp).toBe(true);
    expect(snap.nodes.every((n) => n.wanUp)).toBe(true);

    engine.dispatch({ type: 'SET_CELLS_UP', up: false });
    snap = engine.getSnapshot();
    expect(snap.world.cellsUp).toBe(false);
    // Mobiles should have wanUp=false
    expect(snap.nodes.filter((n) => n.kind === 'mobile').every((n) => !n.wanUp)).toBe(true);
  });

  it('respects gridUp flag for routers', () => {
    const config = {
      seed: 42,
      width: 1000,
      height: 1000,
      mobiles: 3,
      routers: 2,
      gateways: 0,
      range: { mobile: 100, router: 150, gateway: 200 },
      unregisteredFraction: 0,
      batteryBackedRouterFraction: 0.5,
      gatewayBackhaul: 'satellite' as const,
    };
    const engine = createEngine(config);

    const snap1 = engine.getSnapshot();
    expect(snap1.world.gridUp).toBe(true);

    engine.dispatch({ type: 'SET_GRID_UP', up: false });
    const snap2 = engine.getSnapshot();
    expect(snap2.world.gridUp).toBe(false);
  });

  it('moves nodes', () => {
    const config = lineWorld(3);
    const engine = createEngine(config);

    let snap = engine.getSnapshot();
    const firstNode = snap.nodes[0]!;
    const originalX = firstNode.x;

    engine.dispatch({
      type: 'MOVE_NODE',
      nodeId: firstNode.id,
      x: originalX + 100,
      y: firstNode.y,
    });

    snap = engine.getSnapshot();
    const movedNode = snap.nodes.find((n) => n.id === firstNode.id)!;
    expect(movedNode.x).toBe(originalX + 100);
  });

  it('mode machine: stays in PEACE with WAN up', () => {
    const config = lineWorld(2);
    const engine = createEngine(config);

    for (let i = 0; i < 20; i++) {
      engine.step(1);
    }

    const snap = engine.getSnapshot();
    expect(snap.nodes.every((n) => n.mode === 'PEACE')).toBe(true);
  });

  it('mode machine: enters L1 without WAN', () => {
    const config = lineWorld(2);
    const engine = createEngine(config);

    engine.dispatch({ type: 'SET_CELLS_UP', up: false });

    // Wait for L1 transition (localModeAfterTicks = 5)
    for (let i = 0; i < 10; i++) {
      engine.step(1);
    }

    const snap = engine.getSnapshot();
    expect(snap.nodes.every((n) => n.mode === 'L1')).toBe(true);
  });

  it('snapshot caches edges until adjacency changes', () => {
    const config = lineWorld(3);
    const engine = createEngine(config);

    const snap1 = engine.getSnapshot();
    const snap2 = engine.getSnapshot();
    expect(snap1.edges).toBe(snap2.edges); // Same reference

    engine.dispatch({
      type: 'MOVE_NODE',
      nodeId: snap1.nodes[0]!.id,
      x: 0,
      y: 0,
    });

    const snap3 = engine.getSnapshot();
    expect(snap3.edges).not.toBe(snap1.edges); // Different reference after move
  });

  it('declaration creates authority message', () => {
    const config = lineWorld(3);
    const engine = createEngine(config);

    engine.dispatch({
      type: 'DECLARE_MODE',
      level: 'L2',
      durationTicks: 100,
      forged: false,
    });

    const cmds = engine.getCommandLog();
    expect(cmds.length).toBe(1);
    expect(cmds[0]?.type).toBe('DECLARE_MODE');
  });

  it('forged declaration is dropped', () => {
    const config = lineWorld(2);
    const engine = createEngine(config);

    engine.dispatch({
      type: 'DECLARE_MODE',
      level: 'L2',
      durationTicks: 100,
      forged: true,
    });

    engine.step(1);

    const snap = engine.getSnapshot();
    // Forged declarations should be dropped, nodes stay in PEACE
    expect(snap.nodes.every((n) => n.mode === 'PEACE')).toBe(true);
  });

  it('send random request creates message', () => {
    const config = lineWorld(3);
    const engine = createEngine(config);

    engine.dispatch({ type: 'SEND_RANDOM_REQUEST' });
    engine.step(1); // Message propagates

    const snap = engine.getSnapshot();
    expect(snap.messages.length).toBeGreaterThan(0);
  });

  it('replay produces same tick', () => {
    const config = lineWorld(2);
    const engine1 = createEngine(config);

    engine1.dispatch({ type: 'SET_CELLS_UP', up: false });
    engine1.step(1);
    engine1.step(1);
    engine1.step(1);
    engine1.step(1);

    const commands = engine1.getCommandLog();

    const engine2 = createEngine(config);
    for (const cmd of commands) {
      engine2.dispatch(cmd);
    }
    for (let i = 0; i < 4; i++) {
      engine2.step(1);
    }

    // Both should be at same tick
    expect(engine2.tick).toBe(engine1.tick);
  });

  it('subscribe fires on step', () => {
    const config = lineWorld(2);
    const engine = createEngine(config);

    let called = 0;
    const unsub = engine.subscribe(() => {
      called++;
    });

    engine.step(1);
    expect(called).toBe(1);

    engine.step(1);
    expect(called).toBe(2);

    engine.step(1);
    expect(called).toBe(3);

    unsub();
    engine.step(1);
    expect(called).toBe(3); // No change after unsubscribe
  });

  it('determinism with mobility enabled', () => {
    const config = lineWorld(3);
    const engine1 = createEngine(config, { mobility: { enabled: true, stepMetres: 10 } });
    const engine2 = createEngine(config, { mobility: { enabled: true, stepMetres: 10 } });

    engine1.dispatch({ type: 'SET_MOBILITY', enabled: true, stepMetres: 10 });
    engine2.dispatch({ type: 'SET_MOBILITY', enabled: true, stepMetres: 10 });

    for (let i = 0; i < 20; i++) {
      engine1.step(1);
      engine2.step(1);
    }

    const snap1 = engine1.getSnapshot();
    const snap2 = engine2.getSnapshot();

    for (let i = 0; i < snap1.nodes.length; i++) {
      expect(snap1.nodes[i]!.x).toBeCloseTo(snap2.nodes[i]!.x, 5);
      expect(snap1.nodes[i]!.y).toBeCloseTo(snap2.nodes[i]!.y, 5);
    }
  });
});
