import { describe, expect, it } from 'vitest';
import type { Command } from '../../src/domain/commands';
import type { TransitEvent } from '../../src/domain/events';
import { nodeId } from '../../src/domain/ids';
import { createEngine, SimEngine } from '../../src/engine/engine';
import { TRANSIT_RING_SIZE } from '../../src/engine/state';

/**
 * One command script over 300 ticks that touches every PRNG consumer (mobility, random
 * requests, random auto-respond, participation) and every mode path (local L1, declared
 * L2/L3, all-clear step-down), with store-and-forward islands while the grid is down.
 */
const script: readonly { tick: number; command: Command }[] = [
  { tick: 0, command: { type: 'SetMobility', enabled: true, stepMetres: 6 } },
  { tick: 2, command: { type: 'SendRandomRequest' } },
  { tick: 3, command: { type: 'SetCellsUp', up: false } },
  { tick: 6, command: { type: 'SendRandomRequest' } },
  { tick: 9, command: { type: 'AutoRespond' } },
  { tick: 12, command: { type: 'DeclareMode', level: 'L2', region: { x: 300, y: 300, r: 400 } } },
  { tick: 20, command: { type: 'SetGridUp', up: false } },
  { tick: 22, command: { type: 'BroadcastAlert', text: 'shelter in place' } },
  { tick: 30, command: { type: 'SendRandomRequest' } },
  { tick: 31, command: { type: 'AutoRespond', strategy: 'random' } },
  { tick: 40, command: { type: 'SetGridUp', up: true } },
  { tick: 45, command: { type: 'AllClear' } },
  { tick: 50, command: { type: 'SetCellsUp', up: true } },
  { tick: 70, command: { type: 'DeclareMode', level: 'L3', durationTicks: 60 } },
  { tick: 80, command: { type: 'SendRandomRequest' } },
  { tick: 85, command: { type: 'AutoRespond' } },
  { tick: 100, command: { type: 'SetParticipation', fraction: 0.6 } },
  { tick: 120, command: { type: 'SendCheckIn', from: nodeId('m-003'), status: 'OK' } },
  { tick: 140, command: { type: 'SetParticipation', fraction: 1 } },
  { tick: 160, command: { type: 'SendRandomRequest' } },
  { tick: 161, command: { type: 'AutoRespond', strategy: 'random' } },
  { tick: 200, command: { type: 'SetCellsUp', up: false } },
  { tick: 210, command: { type: 'SendRandomRequest' } },
  { tick: 215, command: { type: 'AutoRespond' } },
  { tick: 250, command: { type: 'SetCellsUp', up: true } },
  { tick: 280, command: { type: 'SendRandomRequest' } },
];

interface Run {
  readonly engine: SimEngine;
  /** Transits of every tick in order (index = tick - 1), straight from each TickResult. */
  readonly transits: readonly (readonly TransitEvent[])[];
}

function run(seed: number, until: number, betweenSteps?: (e: SimEngine) => void): Run {
  const engine = createEngine({ seed });
  const transits: (readonly TransitEvent[])[] = [];
  const stepOnce = () => {
    transits.push(engine.step().transits);
    betweenSteps?.(engine);
  };
  for (const entry of script) {
    if (entry.tick > until) break;
    while (engine.tick < entry.tick) stepOnce();
    engine.dispatch(entry.command);
  }
  while (engine.tick < until) stepOnce();
  return { engine, transits };
}

const logJson = (e: SimEngine) => JSON.stringify(e.getEventLog());
const transitsJson = (r: Run) => JSON.stringify(r.transits);

describe('determinism (FR-SIM-05)', () => {
  it('same seed and script, mobility on, 300 ticks: identical event logs and transit lists', () => {
    const a = run(42, 300);
    const b = run(42, 300);
    expect(a.engine.tick).toBe(300);
    expect(a.engine.getSnapshot().world.mobility).toBe(true);
    expect(a.engine.getEventLog().length).toBeGreaterThan(300);
    expect(a.transits).toHaveLength(300);
    expect(a.transits.some((t) => t.length > 0)).toBe(true);
    expect(logJson(a.engine)).toBe(logJson(b.engine));
    expect(transitsJson(a)).toBe(transitsJson(b));
    expect(JSON.stringify(a.engine.getSnapshot())).toBe(JSON.stringify(b.engine.getSnapshot()));
  });

  it('a different seed produces a different log and different transits', () => {
    const a = run(42, 300);
    const b = run(43, 300);
    expect(logJson(a.engine)).not.toBe(logJson(b.engine));
    expect(transitsJson(a)).not.toBe(transitsJson(b));
  });

  it('replay(initialWorld, commandLog, 150) deep-equals the live engine at tick 150', () => {
    const live = run(42, 300).engine;
    const at150 = run(42, 150).engine;
    const replayed = SimEngine.replay(
      live.initialWorld,
      live.getCommandLog(),
      150,
      live.initialConfig,
    );
    expect(replayed.tick).toBe(150);
    expect(replayed.getSnapshot()).toEqual(at150.getSnapshot());
    expect(replayed.getEventLog()).toEqual(at150.getEventLog());
    for (let t = 150 - TRANSIT_RING_SIZE + 1; t <= 150; t++) {
      expect(replayed.getTransits(t)).toEqual(at150.getTransits(t));
    }
    expect(replayed.getCommandLog()).toEqual(live.getCommandLog().filter((c) => c.tick <= 150));
  });

  it('calling getSnapshot() and getNodeDetail() between steps never changes the log or the transits', () => {
    const quiet = run(42, 80);
    const noisy = run(42, 80, (e) => {
      e.getSnapshot();
      e.getSnapshot();
      e.getNodeDetail(nodeId('m-001'));
      e.getNodeDetail(nodeId('g-01'));
      e.getNodeDetail(nodeId('authority'));
      e.getTransits(e.tick);
    });
    expect(logJson(noisy.engine)).toBe(logJson(quiet.engine));
    expect(transitsJson(noisy)).toBe(transitsJson(quiet));
  });

  it('getTransits(tick) answers for the last 64 ticks with the exact TickResult arrays', () => {
    const { engine, transits } = run(42, 300);
    for (let t = 300 - TRANSIT_RING_SIZE + 1; t <= 300; t++) {
      const slot = engine.getTransits(t);
      expect(slot).toBe(transits[t - 1]);
      expect(slot.every((tr) => tr.tick === t)).toBe(true);
    }
    expect(engine.getTransits(300 - TRANSIT_RING_SIZE)).toEqual([]);
    expect(engine.getTransits(0)).toEqual([]);
    expect(engine.getTransits(301)).toEqual([]);
    expect(engine.getTransits(-1)).toEqual([]);
  });

  it('replay lines up with a ResetWorld in the log when started from initialWorld', () => {
    const live = createEngine({ seed: 42 });
    live.step(5);
    live.dispatch({ type: 'SendRandomRequest' });
    live.dispatch({ type: 'AutoRespond' });
    live.step(5);
    live.dispatch({ type: 'ResetWorld', world: { ...live.world, seed: 7 } });
    live.dispatch({ type: 'SendRandomRequest' });
    live.step(10);
    expect(live.world.seed).toBe(7);
    expect(live.initialWorld.seed).toBe(42);
    const replayed = SimEngine.replay(live.initialWorld, live.getCommandLog(), live.tick);
    expect(replayed.getSnapshot()).toEqual(live.getSnapshot());
    expect(replayed.getEventLog()).toEqual(live.getEventLog());
  });
});
