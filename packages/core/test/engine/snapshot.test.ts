import { describe, expect, it } from 'vitest';
import { AUTHORITY_ID, nodeId } from '../../src/domain/ids';
import { createEngine } from '../../src/engine/engine';
import { MESSAGE_VIEW_CAP } from '../../src/engine/snapshot';
import { engineFrom, gateway, mobile, router } from '../helpers';

const id = nodeId;

describe('snapshot identity (plan A4)', () => {
  it('keeps the same reference without step/dispatch and renews after either', () => {
    const e = createEngine({ seed: 42 });
    const s0 = e.getSnapshot();
    expect(e.getSnapshot()).toBe(s0);
    expect(e.getSnapshot()).toBe(s0);
    e.step();
    const s1 = e.getSnapshot();
    expect(s1).not.toBe(s0);
    expect(s1.tick).toBe(1);
    expect(e.getSnapshot()).toBe(s1);
    e.dispatch({ type: 'SetCellsUp', up: false });
    const s2 = e.getSnapshot();
    expect(s2).not.toBe(s1);
    expect(s2.tick).toBe(1);
    expect(s2.world.cellsUp).toBe(false);
    // earlier snapshots are frozen in time
    expect(s1.world.cellsUp).toBe(true);
    expect(s0.tick).toBe(0);
  });

  it('notifies subscribers once per step(n) and once per dispatch, until unsubscribed', () => {
    const e = createEngine({ seed: 42 });
    let notified = 0;
    const off = e.subscribe(() => notified++);
    e.step(3);
    expect(notified).toBe(1);
    e.dispatch({ type: 'SetGridUp', up: false });
    expect(notified).toBe(2);
    e.getSnapshot();
    e.getNodeDetail(id('m-001'));
    expect(notified).toBe(2);
    off();
    e.step();
    expect(notified).toBe(2);
  });

  it('edges keep their reference across ticks while adjacency is unchanged and change after SetGridUp', () => {
    const e = createEngine({ seed: 42 });
    const edges0 = e.getSnapshot().edges;
    expect(edges0.length).toBeGreaterThan(0);
    e.step(5);
    expect(e.getSnapshot().edges).toBe(edges0);
    e.dispatch({ type: 'SendRandomRequest' });
    e.step(3);
    expect(e.getSnapshot().edges).toBe(edges0);
    e.dispatch({ type: 'SetGridUp', up: false });
    const edges1 = e.getSnapshot().edges;
    expect(edges1).not.toBe(edges0);
    expect(edges1.length).toBeLessThan(edges0.length);
    e.step(3);
    expect(e.getSnapshot().edges).toBe(edges1);
    e.dispatch({ type: 'SetGridUp', up: true });
    const edges2 = e.getSnapshot().edges;
    expect(edges2).not.toBe(edges1);
    expect(edges2).toEqual(edges0);
  });

  it('edges are renewed by a ResetWorld, even into a world without any edge', () => {
    const e = createEngine({ seed: 42 });
    const edges0 = e.getSnapshot().edges;
    expect(edges0.length).toBeGreaterThan(0);
    e.dispatch({
      type: 'ResetWorld',
      world: { ...e.world, mobiles: 2, routers: 0, gateways: 0, width: 100_000, height: 100_000 },
    });
    const edges1 = e.getSnapshot().edges;
    expect(e.getSnapshot().nodes).toHaveLength(2);
    expect(edges1).toHaveLength(0);
    expect(edges1).not.toBe(edges0);
    e.step();
    expect(e.getSnapshot().edges).toHaveLength(0);
    expect(e.getSnapshot().edges).not.toBe(edges0);
    expect(e.getSnapshot().edges).toBe(edges1);
  });

  it('messages keep their reference until a message is created (node or authority)', () => {
    const e = createEngine({ seed: 42 });
    const m0 = e.getSnapshot().messages;
    expect(m0).toEqual([]);
    e.step(3);
    e.dispatch({ type: 'SetCellsUp', up: false });
    e.step(2);
    expect(e.getSnapshot().messages).toBe(m0);
    e.dispatch({ type: 'SendRandomRequest' });
    const m1 = e.getSnapshot().messages;
    expect(m1).not.toBe(m0);
    expect(m1).toHaveLength(1);
    e.step(4); // a flood creates no messages
    expect(e.getSnapshot().messages).toBe(m1);
    e.dispatch({ type: 'BroadcastAlert', text: 'x' });
    const m2 = e.getSnapshot().messages;
    expect(m2).not.toBe(m1);
    expect(m2).toHaveLength(2);
  });

  it('caps messages at MESSAGE_VIEW_CAP newest, in creation order', () => {
    const e = engineFrom([mobile('m-001', 0, 0), mobile('m-002', 50, 0)]);
    const total = MESSAGE_VIEW_CAP + 5;
    for (let i = 0; i < total; i++) {
      e.dispatch({
        type: 'SendRequest',
        from: id('m-001'),
        class: 'INFO',
        payload: { kind: 'REQUEST', text: `q${i}` },
      });
    }
    const msgs = e.getSnapshot().messages;
    expect(msgs).toHaveLength(MESSAGE_VIEW_CAP);
    expect(msgs[0]!.seq).toBe(6);
    expect(msgs.at(-1)!.seq).toBe(total);
    expect(msgs.map((m) => m.seq)).toEqual([...msgs.map((m) => m.seq)].sort((a, b) => a - b));
  });

  it('transits are those of the last step(); empty before the first step', () => {
    const e = engineFrom([mobile('m-001', 0, 0), mobile('m-002', 50, 0)]);
    expect(e.getSnapshot().transits).toEqual([]);
    e.dispatch({
      type: 'SendRequest',
      from: id('m-001'),
      class: 'INFO',
      payload: { kind: 'REQUEST', text: 'hi' },
    });
    const r1 = e.step();
    expect(r1.transits).toHaveLength(1);
    expect(e.getSnapshot().transits).toBe(r1.transits);
    const r2 = e.step();
    expect(e.getSnapshot().transits).toBe(r2.transits);
    expect(e.getSnapshot().metrics.transitsThisTick).toBe(r2.transits.length);
    // a dispatch between steps does not replace them
    e.dispatch({ type: 'SetCellsUp', up: false });
    expect(e.getSnapshot().transits).toBe(r2.transits);
  });

  it('recentEvents is the capped tail of the event log and follows SetConfig', () => {
    const e = engineFrom(
      Array.from({ length: 6 }, (_, i) => mobile(`m-${String(i + 1).padStart(3, '0')}`, i * 50, 0)),
      { recentEventsCap: 10 },
    );
    e.dispatch({ type: 'SendRandomRequest' });
    e.step(6);
    const log = e.getEventLog();
    expect(log.length).toBeGreaterThan(10);
    const recent = e.getSnapshot().recentEvents;
    expect(recent).toHaveLength(10);
    expect(recent).toEqual(log.slice(-10));
    e.dispatch({ type: 'SetConfig', patch: { recentEventsCap: 3 } });
    expect(e.getSnapshot().recentEvents).toEqual(e.getEventLog().slice(-3));
  });

  it('the metrics view keeps its reference across quiet ticks', () => {
    const e = createEngine({ seed: 42 });
    const m0 = e.getSnapshot().metrics;
    e.step(3);
    expect(e.getSnapshot().metrics).toBe(m0);
    e.dispatch({ type: 'SendRandomRequest' });
    e.step();
    expect(e.getSnapshot().metrics).not.toBe(m0);
  });

  it('node views carry component, neighbour and queue counts; inboxSize includes packets queued by an injection', () => {
    const e = engineFrom([
      gateway('g-01', 0, 0),
      mobile('m-001', 50, 0),
      mobile('m-002', 600, 0),
      router('r-001', 650, 0),
    ]);
    const s = e.getSnapshot();
    expect(s.world).toEqual({
      seed: 42,
      width: 1000,
      height: 700,
      cellsUp: true,
      gridUp: true,
      mobility: false,
      nodeCount: 4,
    });
    expect(s.nodes.map((n) => n.id)).toEqual(['g-01', 'm-001', 'm-002', 'r-001']);
    expect(s.nodes[0]).toMatchObject({
      kind: 'gateway',
      credentialKind: 'relay',
      backhaul: 'satellite',
      componentId: 0,
      neighbourCount: 1,
      inboxSize: 0,
      storeSize: 0,
      openRequests: 0,
      alive: true,
      hasBackhaul: true,
      mode: 'PEACE',
      modeSource: 'local',
      declaredLevel: null,
      poweredOverride: null,
    });
    expect(s.nodes.map((n) => n.componentId)).toEqual([0, 0, 1, 1]);
    expect(s.edges).toEqual([
      { a: 'g-01', b: 'm-001', quality: 'far' },
      { a: 'm-002', b: 'r-001', quality: 'far' },
    ]);
    e.dispatch({ type: 'BroadcastAlert', text: 'x' });
    // every alive backhaul node has the hop-0 packet queued for the next tick
    expect(e.getSnapshot().nodes.map((n) => `${n.id}:${n.inboxSize}`)).toEqual([
      'g-01:1',
      'm-001:1',
      'm-002:1',
      'r-001:0',
    ]);
    expect(e.getNodeDetail(id('m-002')).inbox).toMatchObject([{ hop: 0, lastHop: null, path: [] }]);
    e.step();
    expect(e.getSnapshot().nodes.find((n) => n.id === 'm-002')!.inboxSize).toBe(1);
    e.step();
    expect(e.getSnapshot().nodes.find((n) => n.id === 'm-002')!.inboxSize).toBe(0);
  });

  it('globalMode is the highest mode among alive nodes', () => {
    const e = engineFrom([mobile('m-001', 0, 0), mobile('m-002', 500, 0)]);
    e.dispatch({ type: 'DeclareMode', level: 'L3', region: { x: 500, y: 0, r: 10 } });
    e.step(3);
    expect(e.getSnapshot().nodes.map((n) => n.mode)).toEqual(['PEACE', 'L3']);
    expect(e.getSnapshot().globalMode).toBe('L3');
    e.dispatch({ type: 'SetNodePowered', nodeId: id('m-002'), powered: false });
    expect(e.getSnapshot().globalMode).toBe('PEACE');
  });

  it('getNodeDetail of an unknown id is empty but still answers', () => {
    const e = createEngine({ seed: 42 });
    expect(e.getNodeDetail(id('m-999'))).toEqual({
      id: 'm-999',
      inbox: [],
      store: [],
      requests: [],
      seenCount: 0,
      log: [],
    });
  });

  it('survives a JSON round trip unchanged (no Set, Map or Infinity anywhere), details included', () => {
    const e = createEngine({ seed: 42 });
    e.dispatch({ type: 'SetCellsUp', up: false });
    e.step(6);
    e.dispatch({ type: 'DeclareMode', level: 'L2', region: { x: 500, y: 350, r: 300 } });
    e.dispatch({ type: 'SendRandomRequest' });
    e.step(3);
    e.dispatch({ type: 'AutoRespond' });
    e.step(6);
    const s = e.getSnapshot();
    expect(s.declarations).toHaveLength(1);
    expect(s.messages.length).toBeGreaterThan(1);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    expect(s.messages.every((m) => m.hopLimit === null || Number.isFinite(m.hopLimit))).toBe(true);
    expect(s.messages.find((m) => m.class === 'MODE_DECLARATION')).toMatchObject({
      hopLimit: null,
      unbounded: true,
      originId: AUTHORITY_ID,
    });
    for (const n of s.nodes) {
      const d = e.getNodeDetail(n.id);
      expect(JSON.parse(JSON.stringify(d))).toEqual(d);
    }
    const authority = e.getNodeDetail(AUTHORITY_ID);
    expect(authority.inbox).toEqual([]);
    expect(authority.requests).toEqual([]);
    expect(authority.log.some((ev) => ev.type === 'AUTHORITY_INJECTED')).toBe(true);
    expect(authority.log.every((ev) => ev.type !== 'DELIVERED')).toBe(true);
    expect(JSON.parse(JSON.stringify(authority))).toEqual(authority);
  });
});
