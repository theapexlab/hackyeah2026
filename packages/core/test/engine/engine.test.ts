import { describe, expect, it } from 'vitest';
import type { NodeId } from '../../src/domain/ids';
import { MODE_POLICIES } from '../../src/domain/mode';
import type { Node } from '../../src/domain/node';
import { createEngine } from '../../src/engine/engine';
import {
  baseWorld,
  eventsOf,
  layout,
  lineWorld,
  m,
  modeOf,
  r,
  setCredential,
  triangleWorld,
} from '../helpers';

describe('SimEngine basics', () => {
  it('initial state: tick 0, nodes created, wan/backhaul derived eagerly', () => {
    const e = createEngine(baseWorld({ mobiles: 3, routers: 2, gateways: 1 }));
    const snap = e.getSnapshot();
    expect(e.tick).toBe(0);
    expect(snap.nodes).toHaveLength(6);
    expect(snap.nodes.every((n) => n.alive && n.wanUp && n.hasBackhaul && n.mode === 'PEACE')).toBe(
      true,
    );
    expect(
      snap.nodes.filter((n) => n.kind === 'router').every((n) => n.credentialKind === 'relay'),
    ).toBe(true);
    expect(
      snap.nodes.filter((n) => n.kind === 'gateway').every((n) => n.credentialKind === 'relay'),
    ).toBe(true);
  });

  it('step(n) advances n ticks and aggregates events and transits', () => {
    const e = lineWorld(3, 100);
    e.dispatch({ type: 'SEND_REQUEST', from: m(0), class: 'INFO', text: 'x' });
    const res = e.step(3);
    expect(res.tick).toBe(3);
    expect(e.tick).toBe(3);
    expect(res.transits).toHaveLength(2);
    expect(res.events.map((x) => x.type)).toContain('ORIGINATED');
  });

  it('subscribe fires once per step() call and once per dispatch; unsubscribe works', () => {
    const e = lineWorld(2);
    let calls = 0;
    const off = e.subscribe(() => calls++);
    e.step(3);
    expect(calls).toBe(1);
    e.dispatch({ type: 'SET_CELLS_UP', up: false });
    expect(calls).toBe(2);
    off();
    e.step(1);
    expect(calls).toBe(2);
  });

  it('a subscriber unsubscribing during notification does not skip the others', () => {
    const e = lineWorld(2);
    const seen: string[] = [];
    const offA = e.subscribe(() => {
      seen.push('a');
      offA();
    });
    e.subscribe(() => seen.push('b'));
    e.step(1);
    expect(seen).toEqual(['a', 'b']);
  });

  it('subscribers see the fresh snapshot', () => {
    const e = lineWorld(2);
    let tick = -1;
    e.subscribe(() => {
      tick = e.getSnapshot().tick;
    });
    e.step(2);
    expect(tick).toBe(2);
  });

  it('COMMAND events and the timed command log carry the tick', () => {
    const e = createEngine(baseWorld({ mobiles: 2 }));
    e.step(4);
    e.dispatch({ type: 'SET_CELLS_UP', up: false });
    expect(eventsOf(e, 'COMMAND')[0]).toMatchObject({ tick: 4, command: { type: 'SET_CELLS_UP' } });
    expect(e.getCommandLog()).toEqual([{ type: 'SET_CELLS_UP', up: false }]);
    expect(e.getTimedCommandLog()).toEqual([
      { tick: 4, command: { type: 'SET_CELLS_UP', up: false } },
    ]);
  });
});

describe('SimEngine commands', () => {
  it('MOVE_NODE moves, clamps to the world, ignores unknown ids', () => {
    const e = lineWorld(2);
    e.dispatch({ type: 'MOVE_NODE', nodeId: m(0), x: -50, y: 99999 });
    const n = e.getSnapshot().nodes.find((x) => x.id === m(0))!;
    expect([n.x, n.y]).toEqual([0, 200]);
    e.dispatch({ type: 'MOVE_NODE', nodeId: 'zz' as NodeId, x: 1, y: 1 });
    expect(e.getSnapshot().nodes).toHaveLength(2);
  });

  it('SET_RANGE updates node ranges and edges', () => {
    const e = layout(baseWorld({ mobiles: 2 }), { [m(0)]: [0, 0], [m(1)]: [300, 0] });
    expect(e.getSnapshot().edges).toEqual([]);
    e.dispatch({ type: 'SET_RANGE', kind: 'mobile', range: 400 });
    expect(e.getSnapshot().edges).toHaveLength(1);
    expect(e.getSnapshot().nodes.every((n) => n.range === 400)).toBe(true);
  });

  it('SET_PARTICIPATION switches off a deterministic fraction of phones, never infrastructure', () => {
    const e = layout(
      baseWorld({ mobiles: 10, routers: 2 }),
      Object.fromEntries([...Array(10).keys()].map((i) => [m(i), [100 + i * 10, 100]])),
    );
    e.dispatch({ type: 'SET_PARTICIPATION', fraction: 0.5 });
    let snap = e.getSnapshot();
    expect(snap.nodes.filter((n) => n.kind === 'mobile' && n.alive)).toHaveLength(5);
    expect(snap.nodes.filter((n) => n.kind === 'router').every((n) => n.alive)).toBe(true);
    e.dispatch({ type: 'SET_PARTICIPATION', fraction: 1 });
    snap = e.getSnapshot();
    expect(snap.nodes.every((n) => n.alive)).toBe(true);
    e.dispatch({ type: 'SET_PARTICIPATION', fraction: 0 });
    expect(e.getSnapshot().nodes.filter((n) => n.kind === 'mobile' && n.alive)).toHaveLength(0);
  });

  it('SET_CONFIG patches known engine keys only, with matching types', () => {
    const e = lineWorld(2);
    e.dispatch({
      type: 'SET_CONFIG',
      patch: { localModeAfterTicks: 2, bogus: 1, wanStableTicks: 'x' },
    });
    e.dispatch({ type: 'SET_CELLS_UP', up: false });
    e.step(2);
    expect(modeOf(e, m(0))).toBe('L1');
    const cfg = (e as unknown as { state: { engineConfig: Record<string, unknown> } }).state
      .engineConfig;
    expect(cfg.wanStableTicks).toBe(8);
    expect('bogus' in cfg).toBe(false);
  });

  it('RESET_WORLD rebuilds everything, keeps subscribers, restarts the clock and logs', () => {
    const e = lineWorld(3);
    let calls = 0;
    e.subscribe(() => calls++);
    e.dispatch({ type: 'SEND_REQUEST', from: m(0), class: 'INFO', text: 'x' });
    e.step(5);
    e.dispatch({ type: 'RESET_WORLD', world: baseWorld({ mobiles: 5 }) });
    expect(e.tick).toBe(0);
    const snap = e.getSnapshot();
    expect(snap.nodes).toHaveLength(5);
    expect(snap.messages).toEqual([]);
    expect(snap.transactions).toEqual([]);
    expect(snap.recentEvents).toHaveLength(1);
    expect(e.getEventLog()).toHaveLength(1);
    expect(e.getCommandLog()).toHaveLength(1);
    expect(calls).toBe(3);
    e.step(1);
    expect(e.tick).toBe(1);
    expect(e.getNodeDetail(m(0)).nodeLog).toEqual([]);
  });

  it('SEND_RANDOM_REQUEST draws citizen phones and classes the mode allows', () => {
    const e = triangleWorld();
    for (let i = 0; i < 200; i++) e.dispatch({ type: 'SEND_RANDOM_REQUEST' });
    e.step(1);
    const classes = eventsOf(e, 'ORIGINATED').map((o) => o.class);
    expect(classes).toHaveLength(200);
    expect(new Set(classes)).toEqual(new Set(MODE_POLICIES.PEACE.originClasses));
  });

  it('SEND_RANDOM_REQUEST in an emergency favours LIFE_CRITICAL and never picks a forbidden class', () => {
    const e = triangleWorld();
    e.dispatch({ type: 'SET_CELLS_UP', up: false });
    e.step(5);
    for (let i = 0; i < 300; i++) e.dispatch({ type: 'SEND_RANDOM_REQUEST' });
    e.step(1);
    const classes = eventsOf(e, 'ORIGINATED').map((o) => o.class);
    const allowed = new Set(MODE_POLICIES.L1.originClasses);
    expect(classes.every((c) => allowed.has(c))).toBe(true);
    const lifeCritical = classes.filter((c) => c === 'LIFE_CRITICAL').length;
    expect(lifeCritical / classes.length).toBeGreaterThan(0.4);
  });

  it('SEND_RANDOM_REQUEST only picks alive registered phones; no candidates is a no-op', () => {
    const e = triangleWorld();
    setCredential(e, m(0), 'none');
    e.dispatch({ type: 'SET_NODE_POWERED', nodeId: m(1), powered: false });
    for (let i = 0; i < 20; i++) e.dispatch({ type: 'SEND_RANDOM_REQUEST' });
    e.step(1);
    expect(new Set(eventsOf(e, 'ORIGINATED').map((o) => o.originId))).toEqual(new Set([m(2)]));

    const none = lineWorld(1);
    setCredential(none, m(0), 'none');
    none.dispatch({ type: 'SEND_RANDOM_REQUEST' });
    none.step(1);
    expect(eventsOf(none, 'ORIGINATED')).toEqual([]);
  });

  it('SEND_REQUEST from an unknown or dead node does nothing', () => {
    const e = lineWorld(2);
    e.dispatch({ type: 'SEND_REQUEST', from: 'zz' as NodeId, class: 'INFO', text: 'x' });
    e.dispatch({ type: 'SET_NODE_POWERED', nodeId: m(1), powered: false });
    e.dispatch({ type: 'SEND_REQUEST', from: m(1), class: 'INFO', text: 'x' });
    expect(e.getSnapshot().messages).toEqual([]);
  });

  it('DECLARE_MODE PEACE behaves like an all-clear', () => {
    const e = triangleWorld();
    e.dispatch({ type: 'DECLARE_MODE', level: 'L2' });
    e.step(5);
    expect(modeOf(e, m(0))).toBe('L2');
    e.dispatch({ type: 'DECLARE_MODE', level: 'PEACE' });
    e.step(14);
    expect(modeOf(e, m(0))).toBe('PEACE');
  });
});

describe('event log bounds', () => {
  it('eventLogCap trims the oldest events (amortised); recentEvents stays capped', () => {
    const e = lineWorld(3, 100, { eventLogCap: 100, recentEventsCap: 40 });
    for (let i = 0; i < 40; i++) {
      e.dispatch({ type: 'SEND_REQUEST', from: m(0), class: 'INFO', text: 'x' });
      e.step(1);
    }
    expect(e.getEventLog().length).toBeLessThanOrEqual(125);
    expect(e.getEventLog().length).toBeGreaterThanOrEqual(100);
    expect(e.getSnapshot().recentEvents).toHaveLength(40);
    expect(e.getTimedCommandLog().length).toBeGreaterThan(40); // commands are never trimmed
    const last = e.getEventLog().at(-1)!;
    expect(last.tick).toBe(40);
  });

  it('a very large step() batch (>130k events) does not overflow the call stack', () => {
    // 150 phones all in range of each other: every flood is ~150^2 deliveries + duplicates
    const e = createEngine(
      baseWorld({
        width: 200,
        height: 200,
        mobiles: 150,
        range: { mobile: 300, router: 300, gateway: 300 },
      }),
      { nodeCapacityPerTick: 100_000 },
    );
    for (let i = 0; i < 6; i++) {
      e.dispatch({ type: 'SEND_REQUEST', from: m(i), class: 'INFO', text: 'x' });
    }
    let res: ReturnType<typeof e.step> | undefined;
    expect(() => {
      res = e.step(4);
    }).not.toThrow();
    expect(res!.events.length).toBeGreaterThan(130_000);
  });
});

describe('getNodeDetail', () => {
  it('throws for unknown ids', () => {
    expect(() => lineWorld(1).getNodeDetail('zz' as NodeId)).toThrow(/not found/i);
  });

  it('exposes identity, power state, inbox, store, requestView and a node log', () => {
    const e = layout(baseWorld({ mobiles: 3 }), {
      [m(0)]: [100, 100],
      [m(1)]: [160, 100],
      [m(2)]: [1500, 1500],
    });
    e.dispatch({ type: 'SET_CELLS_UP', up: false });
    e.step(5);
    e.dispatch({ type: 'SEND_REQUEST', from: m(0), class: 'INFO', text: 'x' });
    e.step(1);

    const inbound = e.getNodeDetail(m(1));
    expect(inbound).toMatchObject({
      id: m(1),
      kind: 'mobile',
      credentialKind: 'citizen',
      alive: true,
      wanUp: false,
      hasBackhaul: false,
      mode: 'L1',
      modeSource: 'local',
      backhaul: 'cellular',
    });
    expect(inbound.inbox).toHaveLength(1);
    expect(inbound.inbox[0]).toMatchObject({
      class: 'INFO',
      originId: m(0),
      hop: 1,
      hopLimit: 10,
      unbounded: false,
      ttlRemaining: 199,
    });
    expect(inbound.inbox[0]!.status).toBeUndefined();

    e.step(2);
    const after = e.getNodeDetail(m(1));
    expect(after.inbox).toEqual([]);
    expect(after.store).toEqual([{ msgId: inbound.inbox[0]!.id, hop: 1, class: 'INFO' }]);
    expect(after.requestView).toEqual([{ msgId: inbound.inbox[0]!.id, status: 'open', hop: 1 }]);
    expect(after.nodeLog.some((l) => /MODE PEACE -> L1 \(local\)/.test(l))).toBe(true);
    expect(after.nodeLog.some((l) => /DELIVERED INFO/.test(l))).toBe(true);
    expect(after.nodeLog.some((l) => /STORED INFO/.test(l))).toBe(true);
    expect(e.getNodeDetail(m(0)).nodeLog.some((l) => /ORIGINATED INFO/.test(l))).toBe(true);
    expect(e.getNodeDetail(m(0)).requestView[0]).toMatchObject({ status: 'mine', hop: 0 });
  });

  it('node log lines are tick-stamped and capped at 100', () => {
    const e = lineWorld(2, 100, { nodeCapacityPerTick: 1000 });
    for (let i = 0; i < 150; i++)
      e.dispatch({ type: 'SEND_REQUEST', from: m(0), class: 'INFO', text: 'x' });
    e.step(2);
    const log = e.getNodeDetail(m(1)).nodeLog;
    expect(log).toHaveLength(100);
    expect(log.every((l) => /^t\d+ /.test(l))).toBe(true);
  });

  it('shows router/gateway power and backhaul', () => {
    const e = layout(baseWorld({ routers: 1, gateways: 1, batteryBackedRouterFraction: 1 }), {
      [r(0)]: [100, 100],
    });
    e.dispatch({ type: 'SET_GRID_UP', up: false });
    const router = e.getNodeDetail(r(0));
    expect(router).toMatchObject({
      batteryBacked: true,
      alive: true,
      backhaul: 'fibre',
      credentialKind: 'relay',
    });
    e.dispatch({ type: 'SET_NODE_POWERED', nodeId: r(0), powered: false });
    expect(e.getNodeDetail(r(0))).toMatchObject({ alive: false, poweredOverride: false });
    expect(e.getNodeDetail('g-000' as NodeId)).toMatchObject({
      backhaul: 'satellite',
      hasBackhaul: true,
    });
  });
});

describe('internals worth pinning', () => {
  const nodeOf = (e: ReturnType<typeof lineWorld>, id: NodeId) =>
    (e as unknown as { state: { nodes: Map<NodeId, Node> } }).state.nodes.get(id)!;

  it('seenCap bounds the per-node seen set (FIFO eviction)', () => {
    const e = lineWorld(2, 100, { seenCap: 3, nodeCapacityPerTick: 1000 });
    for (let i = 0; i < 10; i++)
      e.dispatch({ type: 'SEND_REQUEST', from: m(0), class: 'INFO', text: 'x' });
    e.step(3);
    expect(nodeOf(e, m(1)).seen.size).toBe(3);
    expect(nodeOf(e, m(0)).seen.size).toBe(3);
  });

  it('getTransits is a 64-tick ring buffer', () => {
    const e = lineWorld(3, 100);
    for (let t = 1; t <= 70; t++) {
      e.dispatch({ type: 'SEND_REQUEST', from: m(0), class: 'INFO', text: 'x' });
      e.step(1);
    }
    expect(e.getTransits(1)).toEqual([]);
    expect(e.getTransits(6)).toEqual([]);
    expect(e.getTransits(7).length).toBeGreaterThan(0);
    expect(e.getTransits(70).length).toBeGreaterThan(0);
    expect(e.getTransits(71)).toEqual([]);
  });
});
