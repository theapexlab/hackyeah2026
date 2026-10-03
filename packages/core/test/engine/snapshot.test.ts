import { describe, expect, it } from 'vitest';
import { createEngine } from '../../src/engine/engine';
import { baseWorld, g, layout, lineWorld, m, r, triangleWorld, twoIslandsWorld } from '../helpers';

/** Recursively assert JSON-safety: no Set/Map/function/undefined-in-array, all numbers finite. */
function assertJsonSafe(value: unknown, path = '$'): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    expect(Number.isFinite(value), `${path} = ${value}`).toBe(true);
    return;
  }
  expect(typeof value, path).toBe('object');
  expect(value instanceof Set || value instanceof Map, `${path} is a Set/Map`).toBe(false);
  if (Array.isArray(value)) {
    for (const [i, v] of value.entries()) assertJsonSafe(v, `${path}[${i}]`);
  } else {
    for (const [k, v] of Object.entries(value as object)) {
      if (v !== undefined) assertJsonSafe(v, `${path}.${k}`);
    }
  }
}

describe('Snapshot refs', () => {
  it('same ref without step/dispatch', () => {
    const e = lineWorld(3);
    expect(e.getSnapshot()).toBe(e.getSnapshot());
  });

  it('new ref after step and after dispatch', () => {
    const e = lineWorld(3);
    const s1 = e.getSnapshot();
    e.step(1);
    const s2 = e.getSnapshot();
    expect(s2).not.toBe(s1);
    e.dispatch({ type: 'SET_CELLS_UP', up: false });
    expect(e.getSnapshot()).not.toBe(s2);
  });

  it('edges ref is stable across ticks and changes after SetGridUp', () => {
    const e = layout(
      baseWorld({ mobiles: 2, routers: 1, range: { mobile: 100, router: 150, gateway: 150 } }),
      { [m(0)]: [100, 100], [m(1)]: [160, 100], [r(0)]: [130, 100] },
    );
    const edges = e.getSnapshot().edges;
    expect(edges).toHaveLength(3);
    e.step(5);
    expect(e.getSnapshot().edges).toBe(edges);
    e.dispatch({ type: 'SET_GRID_UP', up: false });
    const after = e.getSnapshot().edges;
    expect(after).not.toBe(edges);
    expect(after).toHaveLength(1);
    e.step(3);
    expect(e.getSnapshot().edges).toBe(after);
  });

  it('edges ref stays stable while mobility moves nodes without changing any edge', () => {
    const e = layout(
      baseWorld({ mobiles: 2 }),
      { [m(0)]: [500, 500], [m(1)]: [560, 500] },
      { mobility: { enabled: true, stepMetres: 0.01 } },
    );
    const edges = e.getSnapshot().edges;
    const x0 = e.getSnapshot().nodes[0]!.x;
    e.step(10);
    expect(e.getSnapshot().nodes[0]!.x).not.toBe(x0);
    expect(e.getSnapshot().edges).toBe(edges);
  });

  it('messages ref is stable until a new message is added', () => {
    const e = lineWorld(3);
    const empty = e.getSnapshot().messages;
    e.step(3);
    expect(e.getSnapshot().messages).toBe(empty);
    e.dispatch({ type: 'SEND_REQUEST', from: m(0), class: 'INFO', text: 'x' });
    const one = e.getSnapshot().messages;
    expect(one).not.toBe(empty);
    expect(one).toHaveLength(1);
    e.step(5);
    expect(e.getSnapshot().messages).toBe(one);
    e.dispatch({ type: 'SET_CELLS_UP', up: false });
    expect(e.getSnapshot().messages).toBe(one);
    e.dispatch({ type: 'BROADCAST_ALERT', text: 'x' });
    expect(e.getSnapshot().messages).toHaveLength(2);
  });

  it('messages are capped at 500, newest kept', () => {
    const e = lineWorld(2);
    for (let i = 0; i < 520; i++) {
      e.dispatch({ type: 'SEND_REQUEST', from: m(0), class: 'INFO', text: String(i) });
    }
    const msgs = e.getSnapshot().messages;
    expect(msgs).toHaveLength(500);
    expect(msgs[499]!.id).toBe('m-000#000520');
  });

  it('recentEvents is a copy: later steps never mutate an earlier snapshot', () => {
    const e = lineWorld(3);
    e.dispatch({ type: 'SEND_REQUEST', from: m(0), class: 'INFO', text: 'x' });
    e.step(1);
    const snap = e.getSnapshot();
    const len = snap.recentEvents.length;
    e.step(3);
    expect(snap.recentEvents).toHaveLength(len);
    expect(e.getSnapshot().recentEvents.length).toBeGreaterThan(len);
  });

  it('recentEvents is capped by config', () => {
    const e = lineWorld(3, 100, { recentEventsCap: 10 });
    e.dispatch({ type: 'SEND_REQUEST', from: m(0), class: 'INFO', text: 'x' });
    e.step(5);
    expect(e.getSnapshot().recentEvents).toHaveLength(10);
    expect(e.getEventLog().length).toBeGreaterThan(10);
  });

  it('transits: produced by the last step, empty after a dispatch', () => {
    const e = lineWorld(3);
    e.dispatch({ type: 'SEND_REQUEST', from: m(0), class: 'INFO', text: 'x' });
    expect(e.getSnapshot().transits).toEqual([]);
    const res = e.step(1);
    expect(e.getSnapshot().transits).toEqual(res.transits);
    expect(res.transits).toHaveLength(1);
    e.dispatch({ type: 'SET_CELLS_UP', up: false });
    expect(e.getSnapshot().transits).toEqual([]);
  });
});

describe('Snapshot is eager and read-only', () => {
  it('MOVE_NODE updates edges and neighbourCount immediately (no step needed)', () => {
    const e = lineWorld(3, 100);
    e.dispatch({ type: 'MOVE_NODE', nodeId: m(2), x: 1000, y: 100 });
    const snap = e.getSnapshot();
    expect(snap.edges.map((x) => `${x.a}|${x.b}`)).toEqual([`${m(0)}|${m(1)}`]);
    expect(snap.nodes.find((n) => n.id === m(2))!.neighbourCount).toBe(0);
    expect(snap.metrics.componentCount).toBe(2);
  });

  it('SET_GRID_UP / SET_CELLS_UP / SET_NODE_POWERED update liveness immediately', () => {
    const e = twoIslandsWorld();
    e.dispatch({ type: 'SET_GRID_UP', up: false });
    expect(e.getSnapshot().nodes.find((n) => n.id === r(0))!.alive).toBe(false);
    e.dispatch({ type: 'SET_CELLS_UP', up: false });
    const snap = e.getSnapshot();
    expect(snap.nodes.find((n) => n.id === m(0))!.wanUp).toBe(false);
    expect(snap.nodes.find((n) => n.id === g(0))!.hasBackhaul).toBe(true);
    expect(snap.nodes.find((n) => n.id === m(3))!.hasBackhaul).toBe(false);
    e.dispatch({ type: 'SET_NODE_POWERED', nodeId: g(0), powered: false });
    expect(e.getSnapshot().nodes.find((n) => n.id === g(0))!.hasBackhaul).toBe(false);
  });

  it('nodes are sorted by id', () => {
    const e = createEngine(baseWorld({ mobiles: 12, routers: 4, gateways: 2 }));
    const ids = e.getSnapshot().nodes.map((n) => n.id);
    expect(ids).toEqual([...ids].sort());
    expect(ids[0]).toBe('g-000');
  });
});

describe('Snapshot content', () => {
  it('declarations carry region, level, expiry; forged ones are not active', () => {
    const e = triangleWorld();
    const region = { centerX: 100, centerY: 100, radiusMtres: 50 };
    e.dispatch({ type: 'DECLARE_MODE', level: 'L2', region, durationTicks: 20 });
    e.dispatch({ type: 'DECLARE_MODE', level: 'L3', forged: true });
    const decls = e.getSnapshot().declarations;
    expect(decls).toHaveLength(1);
    expect(decls[0]).toMatchObject({ level: 'L2', untilTick: 20, forged: false, region });
    e.step(20);
    expect(e.getSnapshot().declarations).toEqual([]);
  });

  it('AllClear removes active declarations (regional clear only matching regions)', () => {
    const e = triangleWorld();
    const west = { centerX: 100, centerY: 100, radiusMtres: 50 };
    const east = { centerX: 900, centerY: 900, radiusMtres: 50 };
    e.dispatch({ type: 'DECLARE_MODE', level: 'L2', region: west });
    e.dispatch({ type: 'DECLARE_MODE', level: 'L3', region: east });
    expect(e.getSnapshot().declarations).toHaveLength(2);
    e.dispatch({ type: 'ALL_CLEAR', region: west });
    expect(e.getSnapshot().declarations.map((d) => d.level)).toEqual(['L3']);
    e.dispatch({ type: 'ALL_CLEAR' });
    expect(e.getSnapshot().declarations).toEqual([]);
  });

  it('a forged AllClear leaves declarations in place', () => {
    const e = triangleWorld();
    e.dispatch({ type: 'DECLARE_MODE', level: 'L2' });
    e.dispatch({ type: 'ALL_CLEAR', forged: true });
    expect(e.getSnapshot().declarations).toHaveLength(1);
  });

  it('message views never leak Infinity: unbounded flag + finite hopLimit', () => {
    const e = triangleWorld();
    e.dispatch({ type: 'BROADCAST_ALERT', text: 'x' });
    e.dispatch({ type: 'SEND_REQUEST', from: m(0), class: 'INFO', text: 'x' });
    const [alert, request] = e.getSnapshot().messages;
    expect(alert).toMatchObject({ class: 'OFFICIAL_ALERT', unbounded: true });
    expect(Number.isFinite(alert!.hopLimit)).toBe(true);
    expect(request).toMatchObject({ class: 'INFO', unbounded: false, hopLimit: 3 });
  });

  it('JSON round-trips after a busy scenario (no Set/Map, no Infinity)', () => {
    const e = twoIslandsWorld({ mobility: { enabled: true, stepMetres: 3 } });
    e.dispatch({ type: 'SET_CELLS_UP', up: false });
    e.step(6);
    e.dispatch({ type: 'BROADCAST_ALERT', text: 'x' });
    e.dispatch({
      type: 'DECLARE_MODE',
      level: 'L2',
      region: { centerX: 900, centerY: 100, radiusMtres: 200 },
    });
    e.dispatch({ type: 'SEND_CHECK_IN', from: m(3), status: 'OK' });
    e.dispatch({ type: 'SEND_REQUEST', from: m(0), class: 'LIFE_CRITICAL', text: 'x' });
    e.step(8);
    e.dispatch({ type: 'AUTO_RESPOND', strategy: 'nearest-hops' });
    e.step(10);
    const snap = e.getSnapshot();
    expect(snap.messages.length).toBeGreaterThan(2);
    expect(snap.authority.received.length).toBeGreaterThan(0);
    expect(snap.transactions.length).toBeGreaterThan(0);
    assertJsonSafe(snap);
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
    assertJsonSafe(e.getNodeDetail(m(3)));
    assertJsonSafe(e.getNodeDetail(g(0)));
  });

  it('initial snapshot round-trips', () => {
    const snap = lineWorld(2).getSnapshot();
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
    expect(snap.tick).toBe(0);
  });
});
