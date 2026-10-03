import { describe, expect, it, vi } from 'vitest';
import type { Command } from '../../src/domain/commands';
import { DEFAULT_ENGINE_CONFIG, type WorldConfig } from '../../src/domain/config';
import type { TransitEvent } from '../../src/domain/events';
import { createEngine, SimEngine } from '../../src/engine/engine';
import { baseWorld, m } from '../helpers';

const WORLD: WorldConfig = baseWorld({
  seed: 7,
  width: 600,
  height: 400,
  mobiles: 30,
  routers: 9,
  gateways: 2,
  range: { mobile: 70, router: 130, gateway: 150 },
  unregisteredFraction: 0.1,
  batteryBackedRouterFraction: 0.3,
});

const MOBILITY = { mobility: { enabled: true, stepMetres: 6 } };

const SCRIPT: Record<number, Command[]> = {
  3: [{ type: 'SEND_RANDOM_REQUEST' }],
  8: [{ type: 'SEND_RANDOM_REQUEST' }, { type: 'SEND_RANDOM_REQUEST' }],
  12: [{ type: 'AUTO_RESPOND', strategy: 'nearest-hops' }],
  20: [{ type: 'SEND_REQUEST', from: m(1), class: 'LIFE_CRITICAL', text: 'AED' }],
  40: [{ type: 'SET_CELLS_UP', up: false }],
  55: [{ type: 'BROADCAST_ALERT', text: 'flood' }],
  60: [{ type: 'SEND_CHECK_IN', from: m(3), status: 'NEED_EVACUATION' }],
  70: [{ type: 'SEND_RANDOM_REQUEST' }, { type: 'AUTO_RESPOND', strategy: 'random' }],
  90: [{ type: 'SET_GRID_UP', up: false }],
  100: [{ type: 'SEND_RANDOM_REQUEST' }],
  110: [{ type: 'AUTO_RESPOND', strategy: 'random' }],
  120: [
    {
      type: 'DECLARE_MODE',
      level: 'L3',
      region: { centerX: 150, centerY: 200, radiusMtres: 180 },
      durationTicks: 90,
    },
  ],
  150: [{ type: 'MOVE_NODE', nodeId: m(5), x: 10, y: 10 }, { type: 'SEND_RANDOM_REQUEST' }],
  180: [{ type: 'ALL_CLEAR' }, { type: 'SET_RANGE', kind: 'mobile', range: 90 }],
  200: [
    { type: 'SET_CELLS_UP', up: true },
    { type: 'SET_GRID_UP', up: true },
  ],
  220: [{ type: 'DECLARE_MODE', level: 'L2' }, { type: 'SEND_RANDOM_REQUEST' }],
  250: [
    { type: 'SET_CONFIG', patch: { nodeCapacityPerTick: 4 } },
    { type: 'SET_PARTICIPATION', fraction: 0.8 },
  ],
  270: [
    { type: 'SET_PARTICIPATION', fraction: 1 },
    { type: 'BROADCAST_ALERT', text: 'again' },
  ],
};

interface Run {
  engine: SimEngine;
  transits: TransitEvent[][];
  capture?: { snapshot: string; events: string; ring: TransitEvent[] };
}

function run(
  world: WorldConfig,
  ticks: number,
  opts: { captureAt?: number; peek?: boolean } = {},
): Run {
  const engine = createEngine(world, MOBILITY);
  const transits: TransitEvent[][] = [];
  let capture: Run['capture'];
  for (let t = 0; t < ticks; t++) {
    for (const cmd of SCRIPT[t] ?? []) engine.dispatch(cmd);
    if (opts.captureAt === t) {
      capture = {
        snapshot: JSON.stringify(engine.getSnapshot()),
        events: JSON.stringify(engine.getEventLog()),
        ring: engine.getTransits(t),
      };
    }
    transits.push(engine.step(1).transits);
    if (opts.peek) {
      engine.getSnapshot();
      engine.getSnapshot();
      engine.getNodeDetail(m(0));
    }
  }
  return { engine, transits, capture };
}

describe('Determinism', () => {
  it('same seed + same script, mobility on, 300 ticks: identical event log and transits', () => {
    const a = run(WORLD, 300);
    const b = run(WORLD, 300);
    const events = a.engine.getEventLog();
    expect(events.length).toBeGreaterThan(1000);
    expect(JSON.stringify(a.engine.getEventLog())).toBe(JSON.stringify(b.engine.getEventLog()));
    expect(a.transits.flat().length).toBeGreaterThan(500);
    expect(a.transits).toEqual(b.transits);
    expect(JSON.stringify(a.engine.getSnapshot())).toBe(JSON.stringify(b.engine.getSnapshot()));

    // the script really exercised the engine
    const types = new Set(events.map((e) => e.type));
    for (const t of [
      'DELIVERED',
      'DROPPED',
      'MODE_CHANGED',
      'STORED',
      'STORE_FLUSHED',
      'TX_ACCEPTED',
      'TX_CLOSED',
      'AUTHORITY_INJECTED',
      'AUTHORITY_RECEIVED',
      'ADJACENCY',
    ]) {
      expect(types.has(t as never), t).toBe(true);
    }
  });

  it('mobility actually moves phones, only phones, inside the world', () => {
    const e = createEngine(WORLD, MOBILITY);
    const before = e.getSnapshot().nodes;
    e.step(100);
    const after = e.getSnapshot().nodes;
    for (const [i, n] of after.entries()) {
      const b = before[i]!;
      if (n.kind === 'mobile') expect(Math.hypot(n.x - b.x, n.y - b.y)).toBeGreaterThan(0);
      else expect([n.x, n.y]).toEqual([b.x, b.y]);
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.x).toBeLessThanOrEqual(WORLD.width);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeLessThanOrEqual(WORLD.height);
    }
  });

  it('a different seed produces a different run', () => {
    const a = run(WORLD, 120);
    const b = run({ ...WORLD, seed: 8 }, 120);
    expect(JSON.stringify(a.engine.getEventLog())).not.toBe(JSON.stringify(b.engine.getEventLog()));
    expect(a.engine.getSnapshot().nodes.map((n) => n.x)).not.toEqual(
      b.engine.getSnapshot().nodes.map((n) => n.x),
    );
  });

  it('replay(..., 150) equals live at 150 (snapshot, events, transit ring)', () => {
    const live = run(WORLD, 300, { captureAt: 150 });
    const replayed = SimEngine.replay(WORLD, live.engine.getTimedCommandLog(), 150, MOBILITY);
    expect(replayed.tick).toBe(150);
    expect(JSON.stringify(replayed.getSnapshot())).toBe(live.capture!.snapshot);
    expect(JSON.stringify(replayed.getEventLog())).toBe(live.capture!.events);
    expect(replayed.getTransits(150)).toEqual(live.capture!.ring);
  });

  it('replay of the full log reproduces the final state', () => {
    const live = run(WORLD, 300);
    const replayed = SimEngine.replay(WORLD, live.engine.getTimedCommandLog(), 300, MOBILITY);
    expect(JSON.stringify(replayed.getEventLog())).toBe(JSON.stringify(live.engine.getEventLog()));
    expect(JSON.stringify(replayed.getSnapshot())).toBe(JSON.stringify(live.engine.getSnapshot()));
  });

  it('replay across RESET_WORLD restarts the clock and still matches', () => {
    const live = createEngine(WORLD, MOBILITY);
    live.step(10);
    live.dispatch({ type: 'RESET_WORLD', world: { ...WORLD, seed: 99 } });
    live.dispatch({ type: 'SEND_RANDOM_REQUEST' });
    for (let i = 0; i < 30; i++) live.step(1);
    expect(live.getTimedCommandLog()[0]).toMatchObject({
      tick: 0,
      command: { type: 'RESET_WORLD' },
    });
    const replayed = SimEngine.replay(WORLD, live.getTimedCommandLog(), 30, MOBILITY);
    expect(JSON.stringify(replayed.getSnapshot())).toBe(JSON.stringify(live.getSnapshot()));
  });

  it('getSnapshot() / getNodeDetail() are pure reads: peeking never changes the run', () => {
    const quiet = run(WORLD, 160);
    const peeking = run(WORLD, 160, { peek: true });
    expect(JSON.stringify(peeking.engine.getEventLog())).toBe(
      JSON.stringify(quiet.engine.getEventLog()),
    );
    expect(peeking.transits).toEqual(quiet.transits);
  });

  it('repeated getSnapshot() leaves the event log untouched', () => {
    const e = createEngine(WORLD);
    e.dispatch({ type: 'SEND_RANDOM_REQUEST' });
    e.step(5);
    const log = JSON.stringify(e.getEventLog());
    for (let i = 0; i < 5; i++) e.getSnapshot();
    expect(JSON.stringify(e.getEventLog())).toBe(log);
  });

  it('engines are isolated: SET_MOBILITY on one never leaks into defaults or other engines', () => {
    const before = JSON.stringify(DEFAULT_ENGINE_CONFIG);
    const a = createEngine(WORLD);
    a.dispatch({ type: 'SET_MOBILITY', enabled: true, stepMetres: 50 });
    a.dispatch({ type: 'SET_CONFIG', patch: { mobility: { stepMetres: 77 }, autoConfirm: false } });
    expect(JSON.stringify(DEFAULT_ENGINE_CONFIG)).toBe(before);
    const b = createEngine(WORLD);
    const x0 = b.getSnapshot().nodes.map((n) => [n.x, n.y]);
    b.step(10);
    expect(b.getSnapshot().nodes.map((n) => [n.x, n.y])).toEqual(x0);
    expect(b.getSnapshot().world.mobility).toEqual({ enabled: false, stepMetres: 4 });
  });

  it('the world is independent of engine config (PRNG draw order is fixed)', () => {
    const plain = createEngine(WORLD)
      .getSnapshot()
      .nodes.map((n) => [n.id, n.x, n.y, n.credentialKind]);
    const configured = createEngine(WORLD, { ...MOBILITY, nodeCapacityPerTick: 3 })
      .getSnapshot()
      .nodes.map((n) => [n.id, n.x, n.y, n.credentialKind]);
    expect(configured).toEqual(plain);
  });

  it('never touches ambient randomness or clocks (traps on Math.random / Date / performance)', () => {
    const trap = (name: string) => () => {
      throw new Error(`${name} must not be used by the engine`);
    };
    vi.spyOn(Math, 'random').mockImplementation(trap('Math.random'));
    vi.spyOn(performance, 'now').mockImplementation(trap('performance.now'));
    vi.stubGlobal(
      'Date',
      class {
        constructor() {
          trap('Date')();
        }
        static now = trap('Date.now');
      },
    );
    try {
      expect(run(WORLD, 150).engine.getEventLog().length).toBeGreaterThan(300);
    } finally {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  });
});
