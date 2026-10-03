/**
 * Determinism tests with mobility on
 */

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../src/engine/engine';
import { lineWorld } from '../helpers';

describe('Determinism', () => {
  it('same seed + same commands produce same tick with mobility', () => {
    const config = lineWorld(5);

    const engine1 = createEngine(config, { mobility: { enabled: true, stepMetres: 10 } });
    engine1.dispatch({ type: 'SET_MOBILITY', enabled: true, stepMetres: 10 });

    for (let i = 0; i < 5; i++) {
      engine1.step(1);
    }

    const commands1 = engine1.getCommandLog();

    const engine2 = createEngine(config, { mobility: { enabled: true, stepMetres: 10 } });
    for (const cmd of commands1) {
      engine2.dispatch(cmd);
    }
    for (let i = 0; i < 5; i++) {
      engine2.step(1);
    }

    // Ticks should match
    expect(engine2.tick).toBe(engine1.tick);
  });

  it('different seed differs', () => {
    const config1 = lineWorld(5);
    const config2 = { ...config1, seed: 99 };

    const engine1 = createEngine(config1, { mobility: { enabled: true, stepMetres: 10 } });
    const engine2 = createEngine(config2, { mobility: { enabled: true, stepMetres: 10 } });

    engine1.dispatch({ type: 'SEND_RANDOM_REQUEST' });
    engine2.dispatch({ type: 'SEND_RANDOM_REQUEST' });

    for (let i = 0; i < 20; i++) {
      engine1.step(1);
      engine2.step(1);
    }

    // Node positions should differ
    const snap1 = engine1.getSnapshot();
    const snap2 = engine2.getSnapshot();

    let positionsDiffer = false;
    for (let i = 0; i < snap1.nodes.length; i++) {
      if (Math.abs(snap1.nodes[i]!.x - snap2.nodes[i]!.x) > 0.1) {
        positionsDiffer = true;
        break;
      }
    }

    expect(positionsDiffer).toBe(true);
  });

  it('replay equals live at same tick', () => {
    const config = lineWorld(3);

    const engine1 = createEngine(config);
    engine1.dispatch({ type: 'SEND_RANDOM_REQUEST' });

    for (let i = 0; i < 5; i++) {
      engine1.step(1);
    }

    const commands = engine1.getCommandLog();

    const engine2 = createEngine(config);
    for (const cmd of commands) {
      engine2.dispatch(cmd);
    }
    for (let i = 0; i < 5; i++) {
      engine2.step(1);
    }

    expect(engine2.tick).toBe(engine1.tick);
  });

  it('repeated getSnapshot() never changes the log', () => {
    const engine = createEngine(lineWorld(2));

    engine.dispatch({ type: 'SEND_RANDOM_REQUEST' });
    engine.step(5);

    const snap1 = engine.getSnapshot();
    const snap2 = engine.getSnapshot();
    const snap3 = engine.getSnapshot();

    expect(snap1.nodes).toBe(snap2.nodes);
    expect(snap2.nodes).toBe(snap3.nodes);
  });
});
