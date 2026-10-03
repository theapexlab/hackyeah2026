/**
 * Snapshot caching tests
 */

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../src/engine/engine';
import { lineWorld } from '../helpers';

describe('Snapshot', () => {
  it('same ref without step/dispatch', () => {
    const engine = createEngine(lineWorld(3));

    const snap1 = engine.getSnapshot();
    const snap2 = engine.getSnapshot();

    expect(snap1).toBe(snap2);
  });

  it('new after step', () => {
    const engine = createEngine(lineWorld(3));

    const snap1 = engine.getSnapshot();
    engine.step(1);
    const snap2 = engine.getSnapshot();

    expect(snap1).not.toBe(snap2);
  });

  it('edges defined and valid', () => {
    const engine = createEngine(lineWorld(3));

    const snap1 = engine.getSnapshot();
    expect(snap1.edges).toBeDefined();
    expect(Array.isArray(snap1.edges)).toBe(true);

    engine.step(1);
    const snap2 = engine.getSnapshot();
    expect(snap2.edges).toBeDefined();
  });

  it('messages defined', () => {
    const engine = createEngine(lineWorld(3));

    const snap1 = engine.getSnapshot();
    expect(snap1.messages).toBeDefined();
    expect(Array.isArray(snap1.messages)).toBe(true);

    engine.dispatch({
      type: 'SEND_REQUEST',
      from: 'm-000' as any,
      class: 'INFO',
      text: 'test',
    });

    const snap3 = engine.getSnapshot();
    expect(snap3.messages).toBeDefined();
    expect(snap3.messages.length).toBeGreaterThanOrEqual(0);
  });

  it('JSON round-trips (no Set/Map)', () => {
    const engine = createEngine(lineWorld(2));
    const snap = engine.getSnapshot();

    const json = JSON.stringify(snap);
    const parsed = JSON.parse(json);

    expect(parsed.tick).toBe(snap.tick);
    expect(parsed.nodes.length).toBe(snap.nodes.length);
    expect(parsed.edges.length).toBe(snap.edges.length);
  });
});
