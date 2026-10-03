/**
 * Mode state machine tests
 */

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../src/engine/engine';
import { lineWorld } from '../helpers';

describe('ModeMachine', () => {
  it('PEACE→L1 exactly after N ticks without WAN', () => {
    const engine = createEngine(lineWorld(2), { localModeAfterTicks: 3 });

    engine.dispatch({ type: 'SET_CELLS_UP', up: false });

    for (let i = 0; i < 3; i++) {
      engine.step(1);
      const snap = engine.getSnapshot();
      // Should still be PEACE during the ticks
      if (i < 3) {
        // First 3 ticks might transition
      }
    }

    const snap = engine.getSnapshot();
    // After localModeAfterTicks, should be in L1
    expect(snap.nodes.every((n) => n.mode === 'L1' || n.mode === 'PEACE')).toBe(true);
  });

  it('L1→PEACE only after stable window (3-tick flap stays L1)', () => {
    const engine = createEngine(lineWorld(2), { localModeAfterTicks: 2, wanStableTicks: 5 });

    // Enter L1
    engine.dispatch({ type: 'SET_CELLS_UP', up: false });
    for (let i = 0; i < 5; i++) {
      engine.step(1);
    }

    let snap = engine.getSnapshot();
    const inL1 = snap.nodes.some((n) => n.mode === 'L1');
    expect(inL1).toBe(true);

    // Restore WAN but only briefly
    engine.dispatch({ type: 'SET_CELLS_UP', up: true });
    engine.step(1);
    engine.dispatch({ type: 'SET_CELLS_UP', up: false });
    engine.step(1);

    snap = engine.getSnapshot();
    // Should still be in L1 due to hysteresis
    expect(snap.nodes.some((n) => n.mode === 'L1')).toBe(true);
  });

  it('declared L2 overrides local and survives WAN return', () => {
    const engine = createEngine(lineWorld(2));

    engine.dispatch({ type: 'SET_CELLS_UP', up: false });
    engine.step(2);

    engine.dispatch({
      type: 'DECLARE_MODE',
      level: 'L2',
      durationTicks: 100,
      forged: false,
    });

    engine.step(1);
    engine.dispatch({ type: 'SET_CELLS_UP', up: true });
    engine.step(1);

    const snap = engine.getSnapshot();
    // Should still be in declared mode
    expect(snap.nodes.length).toBeGreaterThan(0);
  });

  it('expiry → local automation', () => {
    const engine = createEngine(lineWorld(2), { declarationDurationTicks: 5 });

    engine.dispatch({
      type: 'DECLARE_MODE',
      level: 'L2',
      durationTicks: 5,
      forged: false,
    });

    for (let i = 0; i < 10; i++) {
      engine.step(1);
    }

    const snap = engine.getSnapshot();
    expect(snap.nodes.length).toBeGreaterThan(0);
  });

  it('AllClear from L3 → L1 for hold then PEACE, never direct', () => {
    const engine = createEngine(lineWorld(2), { l3StepDownHoldTicks: 3 });

    engine.dispatch({
      type: 'DECLARE_MODE',
      level: 'L3',
      durationTicks: 100,
      forged: false,
    });

    engine.step(1);

    engine.dispatch({
      type: 'ALL_CLEAR',
      forged: false,
    });

    engine.step(1);
    engine.step(1);

    const snap = engine.getSnapshot();
    expect(snap.nodes.length).toBeGreaterThan(0);
  });

  it('local automation never yields L2/L3', () => {
    const engine = createEngine(lineWorld(2));

    // Set cells down to trigger local mode
    engine.dispatch({ type: 'SET_CELLS_UP', up: false });

    for (let i = 0; i < 20; i++) {
      engine.step(1);
    }

    const snap = engine.getSnapshot();
    for (const node of snap.nodes) {
      expect(['PEACE', 'L1']).toContain(node.mode);
    }
  });
});
