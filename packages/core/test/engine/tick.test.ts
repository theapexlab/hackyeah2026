import { describe, expect, it } from 'vitest';
import type { Command } from '../../src/domain/commands';
import { AUTHORITY_ID, nodeId } from '../../src/domain/ids';
import type { MessageClass } from '../../src/domain/message';
import type { CredentialKind } from '../../src/domain/node';
import {
  engineFrom,
  eventsOf,
  gateway,
  lastMessageId,
  mobile,
  router,
  stepUntil,
} from '../helpers';

const id = nodeId;
type SendRequestExtra = {
  readonly hopLimit?: number;
  readonly forge?: { readonly claimKind: CredentialKind };
};
const req = (
  from: string,
  cls: MessageClass = 'BORROW',
  extra: SendRequestExtra = {},
): Command => ({
  type: 'SendRequest',
  from: id(from),
  class: cls,
  payload: { kind: 'REQUEST', text: 'need a drill' },
  ...extra,
});

function line(n: number, spacing = 50) {
  return Array.from({ length: n }, (_, i) =>
    mobile(`m-${String(i + 1).padStart(3, '0')}`, i * spacing, 0),
  );
}

describe('flooding basics', () => {
  it('moves one hop per tick on a 3-line, never back to lastHop, NO_ROUTE at the leaf in PEACE', () => {
    const e = engineFrom(line(3));
    e.dispatch(req('m-001'));
    const msgId = lastMessageId(e);

    const r1 = e.step();
    expect(r1.tick).toBe(1);
    expect(r1.transits).toEqual([
      { tick: 1, msgId, class: 'BORROW', from: 'm-001', to: 'm-002', hop: 1, via: 'hop' },
    ]);
    expect(eventsOf(e, 'ORIGINATED')).toMatchObject([{ tick: 1, nodeId: 'm-001', msgId }]);
    expect(eventsOf(e, 'TX_OPENED')).toMatchObject([{ tick: 1, requestId: msgId }]);

    const r2 = e.step();
    expect(r2.transits).toEqual([
      { tick: 2, msgId, class: 'BORROW', from: 'm-002', to: 'm-003', hop: 2, via: 'hop' },
    ]);
    const r3 = e.step();
    expect(r3.transits).toEqual([]);

    expect(eventsOf(e, 'DELIVERED')).toMatchObject([
      { tick: 2, nodeId: 'm-002', hop: 1 },
      { tick: 3, nodeId: 'm-003', hop: 2 },
    ]);
    expect(eventsOf(e, 'DROPPED')).toMatchObject([
      { tick: 3, nodeId: 'm-003', reason: 'NO_ROUTE' },
    ]);
    for (let t = 1; t <= 3; t++) {
      for (const tr of e.getTransits(t)) expect(tr.to).not.toBe('m-001');
    }
    const m = e.getSnapshot().metrics;
    expect(m.byClass.BORROW).toEqual({ originated: 1, delivered: 2, uniqueReached: 2, dropped: 1 });
    expect(m.medianHops).toBe(1.5);
    expect(m.medianLatency).toBe(2.5);
    expect(e.getTransits(2)).toBe(r2.transits);
    expect(e.getTransits(99)).toEqual([]);
  });

  it('delivers once per node on a triangle and counts the crossing copies as DUPLICATE', () => {
    const e = engineFrom([mobile('m-001', 0, 0), mobile('m-002', 50, 0), mobile('m-003', 25, 40)]);
    e.dispatch(req('m-001'));
    const r1 = e.step();
    expect(r1.transits.map((t) => t.to)).toEqual(['m-002', 'm-003']);
    const r2 = e.step();
    expect(r2.transits.map((t) => `${t.from}>${t.to}`)).toEqual(['m-002>m-003', 'm-003>m-002']);
    e.step();
    expect(eventsOf(e, 'DELIVERED').map((d) => d.nodeId)).toEqual(['m-002', 'm-003']);
    const dup = eventsOf(e, 'DROPPED').filter((d) => d.reason === 'DUPLICATE');
    expect(dup.map((d) => d.nodeId)).toEqual(['m-002', 'm-003']);
    expect(e.getSnapshot().metrics.dropsByReason.DUPLICATE).toBe(2);
  });

  it('stops at node 4 with hop limit 3 on a 10-line', () => {
    const e = engineFrom(line(10));
    e.dispatch(req('m-001', 'BORROW', { hopLimit: 3 }));
    e.step(12);
    expect(eventsOf(e, 'DELIVERED').map((d) => `${d.nodeId}@${d.hop}`)).toEqual([
      'm-002@1',
      'm-003@2',
      'm-004@3',
    ]);
    expect(eventsOf(e, 'DROPPED')).toMatchObject([
      { tick: 4, nodeId: 'm-004', reason: 'HOP_LIMIT' },
    ]);
    expect(
      e.getEventLog().filter((ev) => ev.type === 'DELIVERED' && ev.nodeId === 'm-005'),
    ).toEqual([]);
    expect(e.getSnapshot().nodes.find((n) => n.id === 'm-005')!.openRequests).toBe(0);
  });

  it('a requested hop limit is clamped to the policy max (6 in PEACE); each relay still applies its own mode limit', () => {
    const e = engineFrom(line(10));
    e.dispatch(req('m-001', 'BORROW', { hopLimit: 20 }));
    expect(e.getSnapshot().messages[0]!.hopLimit).toBe(6);
    e.step(12);
    // PEACE relays honour the clamped 6 (maxHopLimit), not the 3-hop origination default
    expect(eventsOf(e, 'DELIVERED').map((d) => d.nodeId)).toEqual([
      'm-002',
      'm-003',
      'm-004',
      'm-005',
      'm-006',
      'm-007',
    ]);
    expect(eventsOf(e, 'DROPPED').at(-1)).toMatchObject({ nodeId: 'm-007', reason: 'HOP_LIMIT' });

    // the same request through L1 relays (declared L1 on m-002..m-010, m-001 stays PEACE) goes 6 hops
    const e2 = engineFrom(line(10));
    e2.dispatch({ type: 'DeclareMode', level: 'L1', region: { x: 300, y: 0, r: 260 } });
    e2.step(3);
    expect(e2.getSnapshot().nodes.map((n) => n.mode)).toEqual(['PEACE', ...Array(9).fill('L1')]);
    e2.dispatch(req('m-001', 'INFO', { hopLimit: 6 }));
    e2.step(12);
    expect(
      eventsOf(e2, 'DELIVERED')
        .filter((d) => d.class === 'INFO')
        .map((d) => d.nodeId),
    ).toEqual(['m-002', 'm-003', 'm-004', 'm-005', 'm-006', 'm-007']);
    expect(eventsOf(e2, 'DROPPED').at(-1)).toMatchObject({ nodeId: 'm-007', reason: 'HOP_LIMIT' });
  });
});

describe('priority and congestion', () => {
  const star = () => [
    mobile('m-001', -50, 0),
    mobile('m-002', 0, 0),
    mobile('m-003', 50, 0),
    mobile('m-004', 0, 50),
  ];

  it('forwards LIFE_CRITICAL before INFO arriving in the same tick', () => {
    const e = engineFrom(star());
    e.dispatch(req('m-001', 'INFO'));
    e.dispatch(req('m-003', 'LIFE_CRITICAL'));
    const r1 = e.step();
    // m-003 has cellular backhaul, so its LIFE_CRITICAL is also handed up at origination
    expect(r1.transits.map((t) => `${t.class}:${t.from}>${t.to}`)).toEqual([
      'INFO:m-001>m-002',
      `LIFE_CRITICAL:m-003>${AUTHORITY_ID}`,
      'LIFE_CRITICAL:m-003>m-002',
    ]);
    expect(e.getSnapshot().authority.received).toMatchObject([
      { via: 'm-003', class: 'LIFE_CRITICAL' },
    ]);
    const r2 = e.step();
    expect(r2.transits.map((t) => `${t.class}:${t.from}>${t.to}`)).toEqual([
      'LIFE_CRITICAL:m-002>m-001',
      'LIFE_CRITICAL:m-002>m-004',
      'INFO:m-002>m-003',
      'INFO:m-002>m-004',
    ]);
    expect(eventsOf(e, 'DELIVERED').map((d) => `${d.class}@${d.nodeId}`)).toEqual([
      'LIFE_CRITICAL@m-002',
      'INFO@m-002',
    ]);
  });

  it('with capacity 1 the INFO is delivered but dropped CONGESTION, LIFE_CRITICAL forwarded', () => {
    const e = engineFrom(star(), { nodeCapacityPerTick: 1 });
    e.dispatch(req('m-001', 'INFO'));
    const info = lastMessageId(e);
    e.dispatch(req('m-003', 'LIFE_CRITICAL'));
    e.step();
    const r2 = e.step();
    expect(r2.transits.every((t) => t.class === 'LIFE_CRITICAL')).toBe(true);
    expect(r2.transits).toHaveLength(2);
    expect(eventsOf(e, 'DROPPED')).toMatchObject([
      { tick: 2, nodeId: 'm-002', msgId: info, reason: 'CONGESTION' },
    ]);
    expect(eventsOf(e, 'DELIVERED').map((d) => d.class)).toEqual(['LIFE_CRITICAL', 'INFO']);
    e.step(3);
    expect(
      eventsOf(e, 'DELIVERED')
        .filter((d) => d.class === 'INFO')
        .map((d) => d.nodeId),
    ).toEqual(['m-002']);
  });
});

describe('trust', () => {
  it('a forged request is sent by its origin but dropped UNVERIFIABLE at every first hop; no second-hop transits', () => {
    const e = engineFrom([
      mobile('m-001', 0, 0, 'none'),
      mobile('m-002', 50, 0),
      mobile('m-003', 100, 0),
    ]);
    e.dispatch(req('m-001', 'INFO', { forge: { claimKind: 'citizen' } }));
    const r1 = e.step();
    expect(r1.transits).toHaveLength(1);
    expect(eventsOf(e, 'ORIGINATED')).toHaveLength(1);
    expect(eventsOf(e, 'TX_OPENED')).toEqual([]); // forged requests open no transaction
    const r2 = e.step();
    expect(r2.transits).toEqual([]);
    expect(eventsOf(e, 'DROPPED')).toMatchObject([
      { tick: 2, nodeId: 'm-002', reason: 'UNVERIFIABLE' },
    ]);
    expect(eventsOf(e, 'DELIVERED')).toEqual([]);
    expect(e.getSnapshot().messages[0]!.signer).toEqual({
      nodeId: 'm-001',
      credentialKind: 'citizen',
      valid: false,
    });
  });

  it('an unregistered mobile without forgery is refused at the origin as UNVERIFIABLE', () => {
    const e = engineFrom([mobile('m-001', 0, 0, 'none'), mobile('m-002', 50, 0)]);
    e.dispatch(req('m-001', 'INFO'));
    expect(eventsOf(e, 'DROPPED')).toMatchObject([
      { tick: 0, nodeId: 'm-001', reason: 'UNVERIFIABLE' },
    ]);
    e.step(2);
    expect(eventsOf(e, 'ORIGINATED')).toEqual([]);
    expect(e.getTransits(1)).toEqual([]);
  });

  it('a router cannot originate a request: RELAY_CANNOT_ACT at the origin', () => {
    const e = engineFrom([router('r-001', 0, 0), mobile('m-001', 50, 0)]);
    e.dispatch(req('r-001', 'BORROW'));
    expect(eventsOf(e, 'DROPPED')).toMatchObject([
      { tick: 0, nodeId: 'r-001', reason: 'RELAY_CANNOT_ACT' },
    ]);
    e.step(2);
    expect(eventsOf(e, 'ORIGINATED')).toEqual([]);
    expect(e.getSnapshot().metrics.dropsByReason.RELAY_CANNOT_ACT).toBe(1);
  });

  it('an unregistered mobile relays a valid request in L1 without delivering it', () => {
    const e = engineFrom([
      mobile('m-001', 0, 0),
      mobile('m-002', 50, 0, 'none'),
      mobile('m-003', 100, 0),
    ]);
    e.dispatch({ type: 'SetCellsUp', up: false });
    e.step(5);
    expect(e.getSnapshot().nodes.every((n) => n.mode === 'L1')).toBe(true);
    e.dispatch(req('m-001', 'INFO'));
    e.step(3);
    expect(e.getTransits(7)).toMatchObject([{ from: 'm-002', to: 'm-003', hop: 2 }]);
    expect(eventsOf(e, 'DELIVERED').map((d) => d.nodeId)).toEqual(['m-003']);
    expect(e.getNodeDetail(id('m-002')).requests).toEqual([]);
  });
});

describe('degradation ladder', () => {
  const backbone = () => [
    mobile('m-001', 0, 0),
    router('r-001', 50, 0),
    router('r-002', 150, 0),
    mobile('m-002', 200, 0),
  ];

  it('cells down: every node turns L1 exactly after localModeAfterTicks and a request crosses via routers', () => {
    const e = engineFrom(backbone());
    e.dispatch({ type: 'SetCellsUp', up: false });
    e.step(4);
    expect(e.getSnapshot().nodes.every((n) => n.mode === 'PEACE')).toBe(true);
    expect(e.getSnapshot().globalMode).toBe('PEACE');
    e.step();
    expect(e.getSnapshot().nodes.every((n) => n.mode === 'L1' && n.modeSource === 'local')).toBe(
      true,
    );
    expect(e.getSnapshot().globalMode).toBe('L1');
    expect(eventsOf(e, 'MODE_CHANGED').map((m) => `${m.nodeId}:${m.from}>${m.to}`)).toEqual([
      'm-001:PEACE>L1',
      'm-002:PEACE>L1',
      'r-001:PEACE>L1',
      'r-002:PEACE>L1',
    ]);
    expect(e.getSnapshot().metrics.authorityReachableFraction).toBe(0);

    e.dispatch(req('m-001', 'INFO'));
    e.step(4);
    expect(e.getTransits(6).map((t) => t.to)).toEqual(['r-001']);
    expect(e.getTransits(7).map((t) => t.to)).toEqual(['r-002']);
    expect(e.getTransits(8).map((t) => t.to)).toEqual(['m-002']);
    expect(eventsOf(e, 'DELIVERED')).toMatchObject([{ tick: 9, nodeId: 'm-002', hop: 3 }]);
  });

  it('grid down: routers go dark, the world splits, a battery-backed router stays up', () => {
    const e = engineFrom(backbone());
    expect(e.getSnapshot().metrics.componentCount).toBe(1);
    expect(e.getSnapshot().edges).toHaveLength(3);
    e.dispatch({ type: 'SetGridUp', up: false });
    const s = e.getSnapshot();
    expect(s.world.gridUp).toBe(false);
    expect(s.nodes.filter((n) => n.kind === 'router').every((n) => !n.alive)).toBe(true);
    expect(s.edges).toEqual([]);
    expect(s.metrics.componentCount).toBe(2);
    expect(s.metrics.reachableFraction).toBe(0.5);
    expect(s.nodes.find((n) => n.id === 'r-001')!.componentId).toBe(-1);

    const nodes = backbone();
    nodes[1]!.batteryBacked = true;
    const e2 = engineFrom(nodes);
    e2.dispatch({ type: 'SetGridUp', up: false });
    expect(e2.getSnapshot().edges).toEqual([{ a: 'm-001', b: 'r-001', quality: 'far' }]);
    expect(e2.getSnapshot().metrics.componentCount).toBe(2);
  });

  it('SetNodePowered overrides the derived liveness both ways', () => {
    const e = engineFrom(backbone());
    e.dispatch({ type: 'SetNodePowered', nodeId: id('r-001'), powered: false });
    expect(e.getSnapshot().nodes.find((n) => n.id === 'r-001')!.alive).toBe(false);
    e.dispatch({ type: 'SetGridUp', up: false });
    e.dispatch({ type: 'SetNodePowered', nodeId: id('r-002'), powered: true });
    expect(e.getSnapshot().nodes.find((n) => n.id === 'r-002')!.alive).toBe(true);
    e.dispatch({ type: 'SetNodePowered', nodeId: id('r-002'), powered: null });
    expect(e.getSnapshot().nodes.find((n) => n.id === 'r-002')!.alive).toBe(false);
  });
});

describe('store-and-forward', () => {
  it('an L1 island stores; MoveNode brings a phone in range; the next tick flushes and the one after delivers', () => {
    const e = engineFrom([mobile('m-001', 0, 0), mobile('m-002', 500, 0)]);
    e.dispatch({ type: 'SetCellsUp', up: false });
    e.step(5);
    e.dispatch(req('m-001', 'INFO'));
    const msgId = lastMessageId(e);
    e.step();
    expect(eventsOf(e, 'STORED')).toMatchObject([{ tick: 6, nodeId: 'm-001', msgId }]);
    expect(e.getNodeDetail(id('m-001')).store).toMatchObject([
      { hop: 0, storedTick: 6, sentTo: [] },
    ]);
    expect(e.getSnapshot().metrics.storedTotal).toBe(1);

    e.dispatch({ type: 'MoveNode', nodeId: id('m-002'), x: 50, y: 0 });
    expect(e.getSnapshot().edges).toHaveLength(1);
    const r7 = e.step();
    expect(r7.transits).toEqual([
      { tick: 7, msgId, class: 'INFO', from: 'm-001', to: 'm-002', hop: 1, via: 'store-flush' },
    ]);
    expect(eventsOf(e, 'STORE_FLUSHED')).toMatchObject([{ tick: 7, nodeId: 'm-001', to: 'm-002' }]);
    e.step();
    expect(eventsOf(e, 'DELIVERED')).toMatchObject([{ tick: 8, nodeId: 'm-002', hop: 1 }]);
    // the entry stays (data mule) and is not flushed twice
    expect(e.getNodeDetail(id('m-001')).store).toMatchObject([{ sentTo: ['m-002'] }]);
    e.step(3);
    expect(eventsOf(e, 'STORE_FLUSHED')).toHaveLength(1);
  });

  it('the same in PEACE is a NO_ROUTE drop', () => {
    const e = engineFrom([mobile('m-001', 0, 0), mobile('m-002', 500, 0)]);
    e.dispatch(req('m-001', 'INFO'));
    e.step();
    expect(eventsOf(e, 'DROPPED')).toMatchObject([
      { tick: 1, nodeId: 'm-001', reason: 'NO_ROUTE' },
    ]);
    expect(e.getNodeDetail(id('m-001')).store).toEqual([]);
  });

  it('a stored message is dropped TTL_EXPIRED once its TTL runs out', () => {
    const e = engineFrom([mobile('m-001', 0, 0)]);
    e.dispatch({ type: 'SetCellsUp', up: false });
    e.step(5);
    e.dispatch(req('m-001', 'INFO')); // created at tick 5, L1 ttl 200
    e.step();
    expect(e.getNodeDetail(id('m-001')).store).toHaveLength(1);
    e.step(199); // tick 205: still valid (5 + 200 is not < 205)
    expect(e.getNodeDetail(id('m-001')).store).toHaveLength(1);
    e.step();
    expect(e.getNodeDetail(id('m-001')).store).toEqual([]);
    expect(eventsOf(e, 'DROPPED')).toMatchObject([
      { tick: 206, nodeId: 'm-001', reason: 'TTL_EXPIRED' },
    ]);
  });
});

describe('authority', () => {
  it('an alert with cells down is injected only at the satellite gateway and reaches its component', () => {
    const e = engineFrom([gateway('g-01', 0, 0), mobile('m-001', 50, 0), mobile('m-002', 600, 0)]);
    e.dispatch({ type: 'SetCellsUp', up: false });
    e.step();
    e.dispatch({ type: 'BroadcastAlert', text: 'boil water' });
    const msgId = lastMessageId(e);
    expect(eventsOf(e, 'AUTHORITY_INJECTED')).toMatchObject([{ tick: 1, msgId, count: 1 }]);
    expect(e.getSnapshot().authority.injected).toBe(1);
    const r2 = e.step();
    expect(r2.transits).toEqual([
      {
        tick: 2,
        msgId,
        class: 'OFFICIAL_ALERT',
        from: AUTHORITY_ID,
        to: 'g-01',
        hop: 0,
        via: 'authority-inject',
      },
    ]);
    const r3 = e.step();
    expect(r3.transits).toMatchObject([{ from: 'g-01', to: 'm-001', hop: 1, via: 'hop' }]);
    e.step();
    expect(eventsOf(e, 'DELIVERED').map((d) => `${d.nodeId}@${d.hop}`)).toEqual([
      'g-01@0',
      'm-001@1',
    ]);
    e.step(5);
    expect(eventsOf(e, 'DELIVERED').some((d) => d.nodeId === 'm-002')).toBe(false);
    expect(e.getSnapshot().messages[0]).toMatchObject({
      hopLimit: null,
      unbounded: true,
      originId: AUTHORITY_ID,
    });
  });

  it('a forged alert is injected but dropped UNVERIFIABLE everywhere', () => {
    const e = engineFrom([mobile('m-001', 0, 0), mobile('m-002', 50, 0), mobile('m-003', 100, 0)]);
    e.dispatch({ type: 'BroadcastAlert', text: 'fake', forged: true });
    expect(eventsOf(e, 'AUTHORITY_INJECTED')).toMatchObject([{ count: 3 }]);
    e.step(3);
    expect(eventsOf(e, 'DROPPED').map((d) => `${d.nodeId}:${d.reason}`)).toEqual([
      'm-001:UNVERIFIABLE',
      'm-002:UNVERIFIABLE',
      'm-003:UNVERIFIABLE',
    ]);
    expect(eventsOf(e, 'DELIVERED')).toEqual([]);
    expect(e.getEventLog().some((ev) => ev.type === 'MODE_CHANGED')).toBe(false);
    for (let t = 1; t <= 3; t++)
      expect(e.getTransits(t).every((tr) => tr.via === 'authority-inject')).toBe(true);
  });

  it('a CHECK_IN reaches authority.received exactly once through the first gateway', () => {
    const e = engineFrom([
      mobile('m-001', 0, 0),
      router('r-001', 50, 0),
      gateway('g-01', 100, 0),
      gateway('g-02', 150, 0),
    ]);
    e.dispatch({ type: 'SetCellsUp', up: false });
    e.step(5);
    e.dispatch({ type: 'SendCheckIn', from: id('m-001'), status: 'TRAPPED', text: 'basement' });
    const msgId = lastMessageId(e);
    e.step(5);
    expect(eventsOf(e, 'AUTHORITY_RECEIVED')).toEqual([
      { type: 'AUTHORITY_RECEIVED', tick: 8, msgId, via: 'g-01', class: 'CHECK_IN' },
    ]);
    expect(e.getSnapshot().authority.received).toEqual([
      { msgId, tick: 8, via: 'g-01', class: 'CHECK_IN', originId: 'm-001' },
    ]);
    const uplinks = [6, 7, 8, 9, 10]
      .flatMap((t) => e.getTransits(t))
      .filter((t) => t.via === 'uplink');
    expect(uplinks).toEqual([
      { tick: 8, msgId, class: 'CHECK_IN', from: 'g-01', to: AUTHORITY_ID, hop: 2, via: 'uplink' },
    ]);
    // g-02 also received and delivered it, but the Authority deduplicated
    expect(eventsOf(e, 'DELIVERED').map((d) => d.nodeId)).toEqual(['r-001', 'g-01', 'g-02']);
  });

  it('a CHECK_IN in PEACE is refused at the origin (CLASS_NOT_ALLOWED), but a mobile with cells uplinks it in declared L1', () => {
    const e = engineFrom([mobile('m-001', 0, 0), mobile('m-002', 50, 0)]);
    e.dispatch({ type: 'SendCheckIn', from: id('m-001'), status: 'OK' });
    expect(eventsOf(e, 'DROPPED')).toMatchObject([
      { nodeId: 'm-001', reason: 'CLASS_NOT_ALLOWED' },
    ]);
    e.dispatch({ type: 'DeclareMode', level: 'L1' });
    e.step(3);
    expect(e.getSnapshot().nodes.every((n) => n.mode === 'L1' && n.modeSource === 'declared')).toBe(
      true,
    );
    e.dispatch({ type: 'SendCheckIn', from: id('m-001'), status: 'OK' });
    const r4 = e.step();
    expect(r4.transits.map((t) => `${t.via}:${t.from}>${t.to}`)).toEqual([
      `uplink:m-001>${AUTHORITY_ID}`,
      'hop:m-001>m-002',
    ]);
    e.step();
    expect(e.getSnapshot().authority.received).toHaveLength(1);
    expect(e.getSnapshot().authority.received[0]!.via).toBe('m-001');
  });
});

describe('declared modes', () => {
  function tenLine() {
    return line(10);
  }

  it('L3: INFO is refused at the origin, relayed INFO is dropped at an L3 node, LIFE_CRITICAL is capped at 6 hops', () => {
    const e = engineFrom(tenLine());
    e.dispatch({ type: 'DeclareMode', level: 'L3' });
    expect(e.getSnapshot().declarations).toMatchObject([
      { level: 'L3', region: null, fromTick: 0, untilTick: 300 },
    ]);
    e.step(3);
    expect(e.getSnapshot().nodes.every((n) => n.mode === 'L3' && n.declaredLevel === 'L3')).toBe(
      true,
    );
    expect(e.getSnapshot().globalMode).toBe('L3');
    e.dispatch(req('m-001', 'INFO'));
    expect(eventsOf(e, 'DROPPED').at(-1)).toMatchObject({
      nodeId: 'm-001',
      reason: 'CLASS_NOT_ALLOWED',
    });

    e.dispatch(req('m-001', 'LIFE_CRITICAL', { hopLimit: 10 }));
    expect(e.getSnapshot().messages.at(-1)!.hopLimit).toBe(6);
    e.step(12);
    const delivered = eventsOf(e, 'DELIVERED')
      .filter((d) => d.class === 'LIFE_CRITICAL')
      .map((d) => d.nodeId);
    expect(delivered).toEqual(['m-002', 'm-003', 'm-004', 'm-005', 'm-006', 'm-007']);
    expect(eventsOf(e, 'DROPPED').at(-1)).toMatchObject({ nodeId: 'm-007', reason: 'HOP_LIMIT' });

    // regional L3 on m-003 only: a PEACE neighbour's INFO is dropped there
    const e2 = engineFrom(line(3));
    e2.dispatch({ type: 'DeclareMode', level: 'L3', region: { x: 100, y: 0, r: 10 } });
    e2.step(3);
    expect(e2.getSnapshot().nodes.map((n) => n.mode)).toEqual(['PEACE', 'PEACE', 'L3']);
    e2.dispatch(req('m-001', 'INFO'));
    e2.step(3);
    // the declaration is applied at m-003 only; the INFO is delivered at m-002 and refused at m-003
    expect(eventsOf(e2, 'DELIVERED').map((d) => `${d.class}@${d.nodeId}`)).toEqual([
      'MODE_DECLARATION@m-003',
      'INFO@m-002',
    ]);
    expect(eventsOf(e2, 'DROPPED').at(-1)).toMatchObject({
      tick: 6,
      nodeId: 'm-003',
      reason: 'CLASS_NOT_ALLOWED',
    });
  });

  it('a regional declaration is forwarded by outsiders without changing their mode', () => {
    const e = engineFrom([
      gateway('g-01', 0, 0),
      mobile('m-001', 50, 0),
      mobile('m-002', 100, 0),
      mobile('m-003', 150, 0),
      mobile('m-004', 200, 0),
    ]);
    e.dispatch({ type: 'SetCellsUp', up: false });
    e.step(5);
    e.dispatch({
      type: 'DeclareMode',
      level: 'L2',
      region: { x: 200, y: 0, r: 10 },
      durationTicks: 50,
    });
    expect(eventsOf(e, 'AUTHORITY_INJECTED')).toMatchObject([{ count: 1 }]);
    e.step(7);
    const s = e.getSnapshot();
    expect(s.nodes.map((n) => `${n.id}:${n.mode}/${n.modeSource}`)).toEqual([
      'g-01:L1/local',
      'm-001:L1/local',
      'm-002:L1/local',
      'm-003:L1/local',
      'm-004:L2/declared',
    ]);
    const decl = eventsOf(e, 'DELIVERED').filter((d) => d.class === 'MODE_DECLARATION');
    expect(decl).toMatchObject([{ tick: 11, nodeId: 'm-004', hop: 4 }]);
    expect(e.getTransits(10)).toMatchObject([{ from: 'm-003', to: 'm-004', hop: 4 }]);
    expect(s.declarations).toMatchObject([
      { level: 'L2', region: { x: 200, y: 0, r: 10 }, untilTick: 55 },
    ]);
    e.step(44); // tick 56: expired
    expect(e.getSnapshot().declarations).toEqual([]);
    expect(e.getSnapshot().nodes.find((n) => n.id === 'm-004')!.mode).toBe('L1');
  });

  it('AllClear steps an L3 node down through L1 before PEACE', () => {
    const e = engineFrom(line(2), { l3StepDownHoldTicks: 4 });
    e.dispatch({ type: 'DeclareMode', level: 'L3' });
    e.step(3);
    expect(e.getSnapshot().globalMode).toBe('L3');
    e.dispatch({ type: 'AllClear' });
    expect(e.getSnapshot().declarations).toEqual([]);
    e.step(3); // delivered at tick 5, evaluated at tick 6
    expect(e.getSnapshot().nodes.map((n) => `${n.mode}/${n.modeSource}`)).toEqual([
      'L1/stepdown',
      'L1/stepdown',
    ]);
    // the hold lasts exactly l3StepDownHoldTicks ticks (6..9), like an expiry-driven step-down
    const modes = [e.getSnapshot().nodes[0]!.mode];
    for (let t = 7; t <= 10; t++) {
      e.step();
      modes.push(e.getSnapshot().nodes[0]!.mode);
    }
    expect(modes).toEqual(['L1', 'L1', 'L1', 'L1', 'PEACE']);
    expect(modes.filter((m) => m === 'L1')).toHaveLength(4);
    expect(e.getSnapshot().nodes.every((n) => n.mode === 'PEACE')).toBe(true);
    const trace = eventsOf(e, 'MODE_CHANGED')
      .filter((m) => m.nodeId === 'm-001')
      .map((m) => `${m.from}>${m.to}`);
    expect(trace).toEqual(['PEACE>L3', 'L3>L1', 'L1>PEACE']);
  });
});

describe('liveness and inbox', () => {
  it('a node switched off drops its inbox NODE_DOWN', () => {
    const e = engineFrom(line(3));
    e.dispatch(req('m-001'));
    e.step();
    expect(e.getNodeDetail(id('m-002')).inbox).toHaveLength(1);
    e.dispatch({ type: 'SetNodePowered', nodeId: id('m-002'), powered: false });
    e.step();
    expect(eventsOf(e, 'DROPPED')).toMatchObject([
      { tick: 2, nodeId: 'm-002', reason: 'NODE_DOWN' },
    ]);
    expect(e.getNodeDetail(id('m-002')).inbox).toEqual([]);
    e.step(3);
    expect(eventsOf(e, 'DELIVERED')).toEqual([]);
  });

  it('a request queued at a node that dies before originating is dropped NODE_DOWN', () => {
    const e = engineFrom(line(2));
    e.dispatch(req('m-001'));
    e.dispatch({ type: 'SetNodePowered', nodeId: id('m-001'), powered: false });
    e.step();
    expect(eventsOf(e, 'DROPPED')).toMatchObject([
      { tick: 1, nodeId: 'm-001', reason: 'NODE_DOWN' },
    ]);
    expect(eventsOf(e, 'ORIGINATED')).toEqual([]);
  });

  it('seen ids are evicted FIFO past seenCap', () => {
    const e = engineFrom(line(2), { seenCap: 2 });
    for (let i = 0; i < 3; i++) e.dispatch(req('m-001', 'INFO'));
    e.step(2);
    expect(e.getNodeDetail(id('m-001')).seenCount).toBe(2);
    expect(e.getNodeDetail(id('m-002')).seenCount).toBe(2);
  });

  it('SendRandomRequest picks an alive citizen and a class the mode allows', () => {
    const e = engineFrom([
      mobile('m-001', 0, 0),
      mobile('m-002', 50, 0, 'none'),
      router('r-001', 100, 0),
    ]);
    e.dispatch({ type: 'SendRandomRequest' });
    const msg = e.getSnapshot().messages[0]!;
    expect(msg.originId).toBe('m-001');
    expect(msg.payload.kind).toBe('REQUEST');
    expect(['LEND', 'BORROW', 'GIVE', 'SELL', 'INFO', 'LIFE_CRITICAL', 'SAFETY']).toContain(
      msg.class,
    );
    e.step();
    expect(eventsOf(e, 'ORIGINATED')).toHaveLength(1);
    e.dispatch({ type: 'SendRandomRequest', from: id('r-001') });
    expect(eventsOf(e, 'DROPPED').at(-1)).toMatchObject({
      nodeId: 'r-001',
      reason: 'RELAY_CANNOT_ACT',
    });
  });

  it('a priced request is refused outside PEACE', () => {
    const e = engineFrom(line(2));
    e.dispatch({ type: 'DeclareMode', level: 'L1' });
    e.step(3);
    e.dispatch({
      type: 'SendRequest',
      from: id('m-001'),
      class: 'GIVE',
      payload: { kind: 'REQUEST', text: 'water', price: 5 },
    });
    expect(eventsOf(e, 'DROPPED').at(-1)).toMatchObject({
      nodeId: 'm-001',
      reason: 'PRICED_IN_EMERGENCY',
    });
  });
});

describe('stage 3 hardening', () => {
  it('a forged request is dropped UNVERIFIABLE at every first-hop neighbour of a star, with zero second-hop transits', () => {
    const e = engineFrom([
      mobile('m-001', 0, 0, 'none'),
      mobile('m-002', 50, 0),
      mobile('m-003', -50, 0),
      mobile('m-004', 0, 50),
    ]);
    e.dispatch(req('m-001', 'INFO', { forge: { claimKind: 'citizen' } }));
    const r1 = e.step();
    expect(r1.transits.map((t) => t.to)).toEqual(['m-002', 'm-003', 'm-004']);
    const r2 = e.step();
    expect(r2.transits).toEqual([]);
    expect(eventsOf(e, 'DROPPED').map((d) => `${d.nodeId}:${d.reason}`)).toEqual([
      'm-002:UNVERIFIABLE',
      'm-003:UNVERIFIABLE',
      'm-004:UNVERIFIABLE',
    ]);
    expect(e.getSnapshot().metrics.dropsByReason.UNVERIFIABLE).toBe(3);
    expect(e.getSnapshot().transactions).toEqual([]);
    expect(e.getSnapshot().nodes.every((n) => n.openRequests === 0)).toBe(true);
  });

  it('a flushed copy that arrives after its TTL is dropped TTL_EXPIRED in flight', () => {
    const e = engineFrom([mobile('m-001', 0, 0), mobile('m-002', 500, 0)]);
    e.dispatch({ type: 'SetCellsUp', up: false });
    e.step(5);
    e.dispatch(req('m-001', 'INFO')); // created at tick 5, L1 ttl 200
    const msgId = lastMessageId(e);
    e.step(); // tick 6: stored
    expect(eventsOf(e, 'STORED')).toHaveLength(1);
    e.step(198); // tick 204
    e.dispatch({ type: 'MoveNode', nodeId: id('m-002'), x: 50, y: 0 });
    const r205 = e.step();
    expect(r205.transits).toMatchObject([{ tick: 205, msgId, via: 'store-flush', to: 'm-002' }]);
    e.step(); // tick 206: 5 + 200 < 206 both in the inbox and in the store
    expect(eventsOf(e, 'DROPPED').map((d) => `${d.tick}:${d.nodeId}:${d.reason}`)).toEqual([
      '206:m-002:TTL_EXPIRED',
      '206:m-001:TTL_EXPIRED',
    ]);
    expect(eventsOf(e, 'DELIVERED')).toEqual([]);
    expect(e.getSnapshot().metrics.storedTotal).toBe(0);
  });

  it('a satellite gateway keeps backhaul but goes L1 locally when cells drop; a fibre one loses both', () => {
    const e = engineFrom([gateway('g-01', 0, 0, 'satellite'), gateway('g-02', 500, 0, 'fibre')]);
    e.dispatch({ type: 'SetCellsUp', up: false });
    e.step(5);
    expect(
      e.getSnapshot().nodes.map((n) => `${n.id}:${n.mode}/${n.wanUp}/${n.hasBackhaul}`),
    ).toEqual(['g-01:L1/false/true', 'g-02:L1/false/false']);
    e.dispatch({ type: 'BroadcastAlert', text: 'x' });
    expect(eventsOf(e, 'AUTHORITY_INJECTED')).toMatchObject([{ count: 1 }]);
    expect(e.getTransits(6)).toEqual([]);
    e.step();
    expect(e.getTransits(6)).toMatchObject([{ to: 'g-01', via: 'authority-inject' }]);
  });

  it('a dead node keeps its mode and WAN counters frozen until it is powered again', () => {
    const e = engineFrom([mobile('m-001', 0, 0), mobile('m-002', 50, 0)]);
    e.dispatch({ type: 'SetNodePowered', nodeId: id('m-002'), powered: false });
    e.dispatch({ type: 'SetCellsUp', up: false });
    e.step(10);
    expect(e.getSnapshot().nodes.map((n) => `${n.id}:${n.mode}`)).toEqual([
      'm-001:L1',
      'm-002:PEACE',
    ]);
    e.dispatch({ type: 'SetNodePowered', nodeId: id('m-002'), powered: null });
    e.step(4);
    expect(e.getSnapshot().nodes.find((n) => n.id === 'm-002')!.mode).toBe('PEACE');
    e.step();
    expect(e.getSnapshot().nodes.find((n) => n.id === 'm-002')!.mode).toBe('L1');
  });
});

describe('event log cap', () => {
  it('keeps the log FIFO-capped at eventLogCap while TickResult.events and recentEvents stay exact', () => {
    const e = engineFrom([mobile('m-001', 0, 0), mobile('m-002', 50, 0), mobile('m-003', 25, 40)], {
      eventLogCap: 50,
      recentEventsCap: 20,
    });
    let last = e.step();
    for (let i = 0; i < 30; i++) {
      e.dispatch(req('m-001', 'INFO')); // one flood per tick on the triangle
      last = e.step();
    }
    const log = e.getEventLog();
    expect(log.length).toBeLessThanOrEqual(50);
    expect(last.events.length).toBeGreaterThan(0);
    expect(last.events.every((ev) => ev.tick === last.tick)).toBe(true);
    expect(last.events).toEqual(log.filter((ev) => ev.tick === last.tick));
    expect(last.events).toEqual(log.slice(-last.events.length));
    expect(e.getSnapshot().recentEvents).toEqual(log.slice(-20));
    // the cap follows SetConfig
    e.dispatch({ type: 'SetConfig', patch: { eventLogCap: 10 } });
    e.step();
    expect(e.getEventLog().length).toBeLessThanOrEqual(10);
    // and Infinity disables it
    e.dispatch({ type: 'SetConfig', patch: { eventLogCap: Number.POSITIVE_INFINITY } });
    for (let i = 0; i < 10; i++) {
      e.dispatch(req('m-001', 'INFO'));
      e.step();
    }
    expect(e.getEventLog().length).toBeGreaterThan(50);
  });

  it('the default cap keeps a flooding world from growing the log without bound', () => {
    const e = engineFrom([mobile('m-001', 0, 0), mobile('m-002', 50, 0)]);
    expect(e.config.eventLogCap).toBe(100_000);
    e.dispatch({ type: 'SetConfig', patch: { eventLogCap: 3 } });
    e.dispatch(req('m-001', 'INFO'));
    e.step(3);
    expect(e.getEventLog()).toHaveLength(3);
    expect(e.getSnapshot().recentEvents).toEqual(e.getEventLog());
    expect(e.getNodeDetail(id('m-002')).log.length).toBeLessThanOrEqual(3);
  });
});

describe('store expiry and flushing by current policy', () => {
  it('a powered-off node still expires its stored entries by TTL', () => {
    const e = engineFrom([mobile('m-001', 0, 0), mobile('m-002', 50, 0)]);
    e.dispatch({ type: 'SetCellsUp', up: false });
    e.step(5);
    e.dispatch(req('m-001', 'INFO')); // created at tick 5, L1 ttl 200
    const msgId = lastMessageId(e);
    e.step(2); // tick 6: m-001 -> m-002; tick 7: m-002 is a leaf and stores it
    expect(eventsOf(e, 'STORED')).toMatchObject([{ tick: 7, nodeId: 'm-002', msgId }]);
    expect(e.getSnapshot().metrics.storedTotal).toBe(1);
    e.dispatch({ type: 'SetNodePowered', nodeId: id('m-002'), powered: false });
    e.step(198); // tick 205: 5 + 200 is not < 205, the dead node still buffers it
    expect(e.getNodeDetail(id('m-002')).store).toHaveLength(1);
    expect(e.getSnapshot().nodes.find((n) => n.id === 'm-002')).toMatchObject({
      alive: false,
      storeSize: 1,
    });
    expect(e.getSnapshot().metrics.storedTotal).toBe(1);
    e.step(); // tick 206: expired while powered off
    expect(eventsOf(e, 'DROPPED')).toMatchObject([
      { tick: 206, nodeId: 'm-002', msgId, reason: 'TTL_EXPIRED' },
    ]);
    expect(e.getNodeDetail(id('m-002')).store).toEqual([]);
    expect(e.getSnapshot().metrics.storedTotal).toBe(0);
  });

  it('no flush after returning to PEACE: the emergency-era store is held until its TTL, then expires', () => {
    const e = engineFrom([mobile('m-001', 0, 0), mobile('m-002', 50, 0), mobile('m-003', 500, 0)]);
    e.dispatch({ type: 'SetCellsUp', up: false });
    e.step(5); // L1 everywhere
    e.dispatch(req('m-001', 'INFO')); // created at tick 5, L1 ttl 200
    const msgId = lastMessageId(e);
    e.step(2); // tick 7: stored at the leaf m-002
    expect(eventsOf(e, 'STORED')).toMatchObject([{ tick: 7, nodeId: 'm-002', msgId }]);
    e.dispatch({ type: 'SetCellsUp', up: true });
    const back = stepUntil(e, (x) => x.getSnapshot().nodes.every((n) => n.mode === 'PEACE'), 20);
    expect(back).toBe(15); // wanStableTicks (8) after tick 7
    expect(e.getNodeDetail(id('m-002')).store).toHaveLength(1);

    e.dispatch({ type: 'MoveNode', nodeId: id('m-003'), x: 100, y: 0 }); // now m-002's neighbour
    expect(e.getSnapshot().edges).toMatchObject([
      { a: 'm-001', b: 'm-002' },
      { a: 'm-002', b: 'm-003' },
    ]);
    const flushes: string[] = [];
    while (e.tick < 205) {
      const r = e.step();
      for (const t of r.transits) if (t.via === 'store-flush') flushes.push(`${t.tick}:${t.to}`);
    }
    expect(flushes).toEqual([]);
    expect(eventsOf(e, 'STORE_FLUSHED')).toEqual([]);
    expect(eventsOf(e, 'DELIVERED').filter((d) => d.nodeId === 'm-003')).toEqual([]);
    expect(e.getSnapshot().nodes.find((n) => n.id === 'm-002')!.storeSize).toBe(1);
    e.step(); // tick 206: 5 + 200 < 206
    expect(eventsOf(e, 'DROPPED').at(-1)).toMatchObject({
      tick: 206,
      nodeId: 'm-002',
      msgId,
      reason: 'TTL_EXPIRED',
    });
    expect(e.getSnapshot().nodes.find((n) => n.id === 'm-002')!.storeSize).toBe(0);
    expect(e.getSnapshot().metrics.storedTotal).toBe(0);
  });
});

describe('inbox order', () => {
  it('processes one priority rank in packet seq order, not message creation or lexical id order', () => {
    const e = engineFrom([
      mobile('m-001', -50, 0), // adjacent to m-002 and m-003
      mobile('m-002', 0, 0), // adjacent to m-001, m-004, m-005
      mobile('m-003', -100, 0), // adjacent to m-001 only
      mobile('m-004', 0, 50),
      mobile('m-005', 50, 0),
    ]);
    e.dispatch(req('m-003', 'INFO'));
    expect(lastMessageId(e)).toBe('m-003#1');
    e.step(); // tick 1: m-003 -> m-001
    e.dispatch(req('m-005', 'INFO'));
    expect(lastMessageId(e)).toBe('m-005#2');
    // tick 2: m-005's origination (phase 4) is enqueued at m-002 with a lower packet seq
    // than m-001's forward of m-003#1 (phase 5)
    e.step();
    const r3 = e.step();
    expect(r3.transits.filter((t) => t.from === 'm-002').map((t) => t.msgId)).toEqual([
      'm-005#2',
      'm-005#2',
      'm-003#1',
      'm-003#1',
    ]);
    expect(
      eventsOf(e, 'DELIVERED')
        .filter((d) => d.nodeId === 'm-002')
        .map((d) => d.msgId),
    ).toEqual(['m-005#2', 'm-003#1']);
  });
});
