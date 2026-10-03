import { describe, expect, it } from 'vitest';
import type { SimEngine } from '../../src/engine/engine';
import {
  baseWorld,
  delivered,
  drops,
  eventsOf,
  g,
  layout,
  lineWorld,
  m,
  modeOf,
  originatedId,
  r,
  setCredential,
  stepCollect,
  triangleWorld,
  twoIslandsWorld,
} from '../helpers';

const sendInfo = (e: SimEngine, from = m(0), cls: 'INFO' | 'SAFETY' | 'LIFE_CRITICAL' = 'INFO') =>
  e.dispatch({ type: 'SEND_REQUEST', from, class: cls, text: 'x' });

/** Cells down for N ticks: every alive node enters local L1 at tick N. */
const goL1 = (e: SimEngine, ticks = 5) => {
  e.dispatch({ type: 'SET_CELLS_UP', up: false });
  e.step(ticks);
};

describe('tick: hop-by-hop propagation', () => {
  it('one hop per tick on a 3-line (transits match)', () => {
    const e = lineWorld(3, 100);
    sendInfo(e);
    const t1 = e.step(1).transits;
    expect(t1.map((t) => [t.from, t.to, t.hop, t.via])).toEqual([[m(0), m(1), 1, 'hop']]);
    expect(delivered(e, originatedId(e))).toEqual([]); // sent at T, processed at T+1

    const t2 = e.step(1).transits;
    expect(t2.map((t) => [t.from, t.to, t.hop])).toEqual([[m(1), m(2), 2]]);
    const t3 = e.step(1).transits;
    expect(t3).toEqual([]); // m2 is the end of the line: nothing goes back to lastHop

    const id = originatedId(e);
    expect(delivered(e, id).map((d) => [d.to, d.tick, d.hop])).toEqual([
      [m(1), 2, 1],
      [m(2), 3, 2],
    ]);
  });

  it('double buffering: arrivals sit in nextInbox->inbox and are processed next tick only', () => {
    const e = lineWorld(3, 100);
    sendInfo(e);
    e.step(1);
    const snap = e.getSnapshot();
    expect(snap.nodes.find((n) => n.id === m(1))!.inboxSize).toBe(1);
    expect(snap.nodes.find((n) => n.id === m(2))!.inboxSize).toBe(0);
    expect(e.getNodeDetail(m(1)).inbox).toHaveLength(1);
    e.step(1);
    expect(e.getSnapshot().nodes.find((n) => n.id === m(1))!.inboxSize).toBe(0);
  });

  it('triangle dedup: delivered once each, DUPLICATE counted, origin never re-delivered', () => {
    const e = triangleWorld();
    sendInfo(e);
    e.step(5);
    const id = originatedId(e);
    expect(
      delivered(e, id)
        .map((d) => d.to)
        .sort(),
    ).toEqual([m(1), m(2)]);
    const dups = drops(e, 'DUPLICATE', id);
    expect(dups.map((d) => d.at).sort()).toEqual([m(1), m(2)]);
    expect(e.getSnapshot().metrics.dropsByReason.DUPLICATE).toBe(2);
  });

  it('never sends back to lastHop (every transit continues away from its sender)', () => {
    for (const e of [lineWorld(6, 100), triangleWorld()]) {
      sendInfo(e);
      const transits = stepCollect(e, 8);
      expect(transits.length).toBeGreaterThan(0);
      for (const t of transits) {
        const feeders = transits.filter((p) => p.to === t.from && p.hop === t.hop - 1);
        if (t.hop > 1) {
          expect(feeders.length).toBeGreaterThan(0);
          expect(feeders.every((p) => p.from !== t.to)).toBe(true);
        }
      }
    }
  });

  it('hopLimit 3 on a 10-line stops at node 4 (m-003 delivers, m-004 never sees it)', () => {
    const e = lineWorld(10, 100);
    e.dispatch({ type: 'SEND_REQUEST', from: m(0), class: 'INFO', text: 'x', hopLimit: 3 });
    const transits = stepCollect(e, 15);
    const id = originatedId(e);
    expect(
      delivered(e, id)
        .map((d) => d.to)
        .sort(),
    ).toEqual([m(1), m(2), m(3)]);
    expect(drops(e, 'HOP_LIMIT', id).map((d) => [d.at, d.hop])).toEqual([[m(3), 3]]);
    expect(transits.some((t) => t.to === m(4))).toBe(false);
    expect(transits.map((t) => t.hop).sort()).toEqual([1, 2, 3]);
  });

  it('msg.hopLimit is honoured below the mode limit (L1 allows 10, request asks 2)', () => {
    const e = lineWorld(10, 100);
    goL1(e);
    e.dispatch({ type: 'SEND_REQUEST', from: m(0), class: 'INFO', text: 'x', hopLimit: 2 });
    e.step(15);
    const id = originatedId(e);
    expect(
      delivered(e, id)
        .map((d) => d.to)
        .sort(),
    ).toEqual([m(1), m(2)]);
  });

  it('the mode limit caps a larger msg.hopLimit (PEACE 3, request asks 6)', () => {
    const e = lineWorld(10, 100);
    e.dispatch({ type: 'SEND_REQUEST', from: m(0), class: 'INFO', text: 'x', hopLimit: 6 });
    e.step(15);
    expect(delivered(e, originatedId(e))).toHaveLength(3);
  });

  it('priority order of forwards: LIFE_CRITICAL, SAFETY, then INFO', () => {
    const e = lineWorld(3, 100);
    sendInfo(e, m(0), 'INFO');
    sendInfo(e, m(0), 'SAFETY');
    sendInfo(e, m(0), 'LIFE_CRITICAL');
    e.step(1);
    const t2 = e.step(1).transits;
    expect(t2.map((t) => t.class)).toEqual(['LIFE_CRITICAL', 'SAFETY', 'INFO']);
  });

  it('capacity 1: INFO is dropped as CONGESTION (after local delivery), LIFE_CRITICAL forwarded', () => {
    const e = lineWorld(3, 100, { nodeCapacityPerTick: 1 });
    sendInfo(e, m(0), 'INFO');
    sendInfo(e, m(0), 'LIFE_CRITICAL');
    e.step(1);
    const t2 = e.step(1).transits;
    expect(t2.map((t) => [t.class, t.from, t.to])).toEqual([['LIFE_CRITICAL', m(1), m(2)]]);
    const congested = drops(e, 'CONGESTION');
    expect(congested.map((d) => [d.class, d.at])).toEqual([['INFO', m(1)]]);
    const infoId = eventsOf(e, 'ORIGINATED').find((o) => o.class === 'INFO')!.msgId;
    expect(delivered(e, infoId).map((d) => d.to)).toEqual([m(1)]);
  });
});

describe('tick: trust and credentials', () => {
  it('forged request: every first-hop receiver drops UNVERIFIABLE, zero second-hop transits', () => {
    const e = triangleWorld();
    e.dispatch({
      type: 'SEND_REQUEST',
      from: m(0),
      class: 'LEND',
      text: 'x',
      forge: { claimKind: 'citizen' },
    });
    const t1 = e.step(1).transits;
    expect(t1).toHaveLength(2);
    const t2 = e.step(1).transits;
    expect(t2).toEqual([]);
    e.step(3);
    expect(
      drops(e, 'UNVERIFIABLE')
        .map((d) => d.at)
        .sort(),
    ).toEqual([m(1), m(2)]);
    expect(eventsOf(e, 'DELIVERED')).toEqual([]);
    expect(eventsOf(e, 'TX_OPENED')).toEqual([]);
    expect(e.getNodeDetail(m(0)).requestView).toEqual([]);
  });

  it('router SendRequest -> RELAY_CANNOT_ACT at the receiver', () => {
    const e = layout(
      baseWorld({ mobiles: 2, routers: 1, range: { mobile: 100, router: 150, gateway: 150 } }),
      { [m(0)]: [100, 100], [m(1)]: [300, 100], [r(0)]: [150, 100] },
    );
    e.dispatch({ type: 'SEND_REQUEST', from: r(0), class: 'BORROW', text: 'x' });
    const t1 = e.step(1).transits;
    expect(t1.map((t) => t.to)).toEqual([m(0)]);
    e.step(3);
    expect(drops(e, 'RELAY_CANNOT_ACT').map((d) => d.at)).toEqual([m(0)]);
    expect(eventsOf(e, 'DELIVERED')).toEqual([]);
  });

  it('unregistered mobile cannot originate (UNVERIFIABLE) ...', () => {
    const e = lineWorld(3, 100);
    setCredential(e, m(0), 'none');
    sendInfo(e);
    e.step(4);
    expect(drops(e, 'UNVERIFIABLE').map((d) => d.at)).toEqual([m(1)]);
    expect(eventsOf(e, 'DELIVERED')).toEqual([]);
  });

  it('... but relays a valid request in L1, without ever delivering it to itself', () => {
    const e = lineWorld(3, 100);
    setCredential(e, m(1), 'none');
    goL1(e);
    expect([m(0), m(1), m(2)].map((id) => modeOf(e, id))).toEqual(['L1', 'L1', 'L1']);
    sendInfo(e, m(0));
    e.step(4);
    const id = originatedId(e);
    expect(delivered(e, id).map((d) => d.to)).toEqual([m(2)]);
    expect(e.getNodeDetail(m(1)).requestView).toEqual([]);
    expect(e.getSnapshot().nodes.find((n) => n.id === m(1))!.openRequests).toBe(0);
  });

  it('citizen OFFICIAL_ALERT request is UNVERIFIABLE', () => {
    const e = lineWorld(2, 100);
    e.dispatch({ type: 'SEND_REQUEST', from: m(0), class: 'OFFICIAL_ALERT', text: 'x' });
    e.step(3);
    expect(drops(e, 'UNVERIFIABLE').map((d) => d.at)).toEqual([m(1)]);
  });

  it('origin-side: a citizen cannot create a class its own mode forbids (SELL in L1)', () => {
    const e = lineWorld(2, 100);
    goL1(e);
    e.dispatch({ type: 'SEND_REQUEST', from: m(0), class: 'SELL', text: 'x' });
    const t = stepCollect(e, 3);
    expect(t).toEqual([]);
    expect(drops(e, 'CLASS_NOT_ALLOWED').map((d) => d.at)).toEqual([m(0)]);
    expect(eventsOf(e, 'TX_OPENED')).toEqual([]);
  });

  it('origin-side: CHECK_IN is not originable in PEACE', () => {
    const e = lineWorld(2, 100);
    e.dispatch({ type: 'SEND_CHECK_IN', from: m(0), status: 'OK' });
    e.step(3);
    expect(drops(e, 'CLASS_NOT_ALLOWED').map((d) => d.at)).toEqual([m(0)]);
  });
});

describe('tick: mode interplay between neighbours', () => {
  const regionAround = (x: number, radiusMtres: number) => ({
    centerX: x,
    centerY: 100,
    radiusMtres,
  });

  it('receiver in L3 rejects INFO from a PEACE neighbour (CLASS_NOT_ALLOWED)', () => {
    const e = lineWorld(5, 100);
    e.dispatch({ type: 'DECLARE_MODE', level: 'L3', region: regionAround(250, 120) });
    e.step(5);
    expect([m(0), m(1), m(2), m(3), m(4)].map((id) => modeOf(e, id))).toEqual([
      'PEACE',
      'L3',
      'L3',
      'L3',
      'PEACE',
    ]);
    sendInfo(e, m(0));
    e.step(3);
    expect(drops(e, 'CLASS_NOT_ALLOWED').map((d) => d.at)).toEqual([m(1)]);
    expect(eventsOf(e, 'DELIVERED').filter((d) => d.class === 'INFO')).toEqual([]);
  });

  it('receiver in L2 rejects a priced GIVE from a PEACE neighbour (PRICED_IN_EMERGENCY)', () => {
    const e = lineWorld(5, 100);
    e.dispatch({ type: 'DECLARE_MODE', level: 'L2', region: regionAround(250, 120) });
    e.step(5);
    e.dispatch({ type: 'SEND_REQUEST', from: m(0), class: 'GIVE', text: 'x', price: 12 });
    e.step(3);
    expect(drops(e, 'PRICED_IN_EMERGENCY').map((d) => d.at)).toEqual([m(1)]);
  });

  it('origin-side: priced GIVE is refused by an L1 citizen itself', () => {
    const e = lineWorld(2, 100);
    goL1(e);
    e.dispatch({ type: 'SEND_REQUEST', from: m(0), class: 'GIVE', text: 'x', price: 3 });
    e.step(2);
    expect(drops(e, 'PRICED_IN_EMERGENCY').map((d) => d.at)).toEqual([m(0)]);
  });

  it('PEACE: SELL with a price flows (payments allowed)', () => {
    const e = lineWorld(3, 100);
    e.dispatch({ type: 'SEND_REQUEST', from: m(0), class: 'SELL', text: 'x', price: 3 });
    e.step(4);
    expect(delivered(e, originatedId(e)).map((d) => d.to)).toEqual([m(1), m(2)]);
  });

  it('request with a region: receivers outside drop OUT_OF_REGION (and do not forward)', () => {
    const e = lineWorld(6, 100);
    e.dispatch({
      type: 'SEND_REQUEST',
      from: m(0),
      class: 'INFO',
      text: 'x',
      region: { centerX: 50, centerY: 100, radiusMtres: 120 },
    });
    e.step(8);
    expect(delivered(e, originatedId(e)).map((d) => d.to)).toEqual([m(1)]);
    expect(drops(e, 'OUT_OF_REGION').map((d) => d.at)).toEqual([m(2)]);
  });
});

describe('tick: degradation ladder', () => {
  const routerChain = () =>
    layout(
      baseWorld({
        mobiles: 2,
        routers: 2,
        range: { mobile: 100, router: 150, gateway: 150 },
        batteryBackedRouterFraction: 0,
      }),
      { [m(0)]: [50, 100], [r(0)]: [150, 100], [r(1)]: [270, 100], [m(1)]: [370, 100] },
    );

  it('cells down -> L1 after exactly N ticks; request still crosses via routers', () => {
    const e = routerChain();
    e.dispatch({ type: 'SET_CELLS_UP', up: false });
    e.step(4);
    expect(e.getSnapshot().nodes.every((n) => n.mode === 'PEACE')).toBe(true);
    e.step(1);
    expect(e.getSnapshot().nodes.every((n) => n.mode === 'L1' && n.modeSource === 'local')).toBe(
      true,
    );
    const changes = eventsOf(e, 'MODE_CHANGED');
    expect(changes).toHaveLength(4);
    expect(changes.every((c) => c.tick === 5 && c.from === 'PEACE' && c.to === 'L1')).toBe(true);

    sendInfo(e);
    e.step(5);
    const id = originatedId(e);
    expect(
      delivered(e, id)
        .filter((d) => d.to === m(1))
        .map((d) => d.hop),
    ).toEqual([3]);
  });

  it('grid down: non-battery routers go dark and the mesh splits', () => {
    const e = routerChain();
    expect(e.getSnapshot().metrics.componentCount).toBe(1);
    e.dispatch({ type: 'SET_GRID_UP', up: false });
    const snap = e.getSnapshot();
    expect(snap.nodes.filter((n) => n.kind === 'router').map((n) => n.alive)).toEqual([
      false,
      false,
    ]);
    expect(snap.nodes.filter((n) => n.kind === 'router').every((n) => n.neighbourCount === 0)).toBe(
      true,
    );
    expect(snap.metrics.componentCount).toBe(2);
    expect(snap.metrics.reachableFraction).toBe(0.5);
  });

  it('grid down: battery-backed routers keep forwarding', () => {
    const e = layout(
      baseWorld({
        mobiles: 2,
        routers: 1,
        range: { mobile: 100, router: 150, gateway: 150 },
        batteryBackedRouterFraction: 1,
      }),
      { [m(0)]: [50, 100], [r(0)]: [150, 100], [m(1)]: [250, 100] },
    );
    e.dispatch({ type: 'SET_GRID_UP', up: false });
    expect(e.getSnapshot().metrics.componentCount).toBe(1);
    sendInfo(e);
    e.step(4);
    expect(delivered(e, originatedId(e)).map((d) => d.to)).toContain(m(1));
  });

  it('a request does not cross a dark router (PEACE: no route, nothing stored)', () => {
    const e = routerChain();
    e.dispatch({ type: 'SET_GRID_UP', up: false });
    sendInfo(e);
    e.step(5);
    expect(delivered(e, originatedId(e))).toEqual([]);
    expect(e.getSnapshot().metrics.storedTotal).toBe(0);
  });
});

describe('tick: store-and-forward (FR-NET-08)', () => {
  const twoApart = () =>
    layout(baseWorld({ mobiles: 2 }), { [m(0)]: [100, 100], [m(1)]: [1500, 1500] });

  it('L1 island stores; a phone walking into range triggers a store-flush that delivers next tick', () => {
    const e = twoApart();
    goL1(e);
    sendInfo(e);
    e.step(2);
    expect(eventsOf(e, 'STORED').map((s) => s.at)).toEqual([m(0)]);
    expect(e.getSnapshot().metrics.storedTotal).toBe(1);
    expect(e.getNodeDetail(m(0)).store).toHaveLength(1);

    e.dispatch({ type: 'MOVE_NODE', nodeId: m(1), x: 150, y: 100 });
    const flush = e.step(1);
    expect(flush.transits.map((t) => [t.from, t.to, t.via, t.hop])).toEqual([
      [m(0), m(1), 'store-flush', 1],
    ]);
    expect(eventsOf(e, 'STORE_FLUSHED')).toHaveLength(1);
    const id = originatedId(e);
    expect(delivered(e, id)).toEqual([]);
    e.step(1);
    expect(delivered(e, id).map((d) => d.to)).toEqual([m(1)]);

    // sentTo prevents a second flush to the same neighbour
    expect(stepCollect(e, 5).filter((t) => t.via === 'store-flush')).toEqual([]);
  });

  it('the same situation in PEACE is NO_ROUTE and nothing is stored', () => {
    const e = twoApart();
    sendInfo(e);
    e.step(2);
    expect(drops(e, 'NO_ROUTE').map((d) => d.at)).toEqual([m(0)]);
    expect(e.getSnapshot().metrics.storedTotal).toBe(0);
    e.dispatch({ type: 'MOVE_NODE', nodeId: m(1), x: 150, y: 100 });
    e.step(5);
    expect(eventsOf(e, 'DELIVERED')).toEqual([]);
  });

  it('a receiver at a dead end stores too, and never flushes back to its sender', () => {
    const e = layout(baseWorld({ mobiles: 3 }), {
      [m(0)]: [100, 100],
      [m(1)]: [160, 100],
      [m(2)]: [1500, 1500],
    });
    goL1(e);
    sendInfo(e);
    e.step(3);
    expect(eventsOf(e, 'STORED').map((s) => s.at)).toEqual([m(1)]);
    e.dispatch({ type: 'MOVE_NODE', nodeId: m(2), x: 220, y: 100 });
    e.step(3);
    expect(eventsOf(e, 'STORE_FLUSHED').map((f) => [f.from, f.to])).toEqual([[m(1), m(2)]]);
  });

  it('TTL expiry drops the stored message', () => {
    const e = twoApart();
    goL1(e);
    sendInfo(e); // created at tick 5, L1 ttl is 200
    e.step(1 + 199); // tick 205: age 200, still alive
    expect(e.getSnapshot().metrics.storedTotal).toBe(1);
    expect(drops(e, 'TTL_EXPIRED')).toEqual([]);
    e.step(1); // tick 206: age 201 > 200
    expect(drops(e, 'TTL_EXPIRED').map((d) => d.at)).toEqual([m(0)]);
    expect(e.getSnapshot().metrics.storedTotal).toBe(0);
  });

  it('a stored copy bridges two islands carried by a moving phone (data mule)', () => {
    const e = layout(baseWorld({ mobiles: 3 }), {
      [m(0)]: [100, 100],
      [m(1)]: [160, 100],
      [m(2)]: [1500, 1500],
    });
    goL1(e);
    sendInfo(e);
    e.step(3); // m1 delivered and stores (dead end); sentTo = {m0}
    e.dispatch({ type: 'MOVE_NODE', nodeId: m(1), x: 1450, y: 1500 }); // m1 walks to m2
    e.step(3);
    const id = originatedId(e);
    expect(delivered(e, id).map((d) => d.to)).toEqual([m(1), m(2)]);
  });
});

describe('tick: authority (virtual) injection and uplink', () => {
  /** g-000 -- m0 -- ... -- m5 chain, gateway at the left end. */
  const chain = () => {
    const positions: Record<string, [number, number]> = { [g(0)]: [50, 100] };
    for (let i = 0; i < 6; i++) positions[m(i)] = [150 + i * 100, 100];
    return layout(
      baseWorld({ mobiles: 6, gateways: 1, range: { mobile: 150, router: 150, gateway: 150 } }),
      positions,
    );
  };

  it('BroadcastAlert with cells down is injected only at the satellite gateway and reaches its island', () => {
    const e = twoIslandsWorld();
    goL1(e);
    e.dispatch({ type: 'BROADCAST_ALERT', text: 'flood' });
    const first = e.step(1);
    expect(eventsOf(e, 'AUTHORITY_INJECTED').map((x) => x.to)).toEqual([g(0)]);
    expect(first.transits.map((t) => [t.from, t.to, t.via, t.hop])).toEqual([
      ['a-00', g(0), 'authority-inject', 0],
    ]);
    e.step(10);
    const id = eventsOf(e, 'ORIGINATED').find((o) => o.class === 'OFFICIAL_ALERT')!.msgId;
    expect(
      delivered(e, id)
        .map((d) => d.to)
        .sort(),
    ).toEqual([g(0), m(3), m(4), m(5)]);
  });

  it('with cells up the alert is injected at every alive backhaul node, but never at dead ones', () => {
    const e = triangleWorld();
    e.dispatch({ type: 'SET_NODE_POWERED', nodeId: m(2), powered: false });
    e.dispatch({ type: 'BROADCAST_ALERT', text: 'x' });
    e.step(1);
    expect(
      eventsOf(e, 'AUTHORITY_INJECTED')
        .map((x) => x.to)
        .sort(),
    ).toEqual([m(0), m(1)]);
  });

  it('no alive node with backhaul: the alert goes nowhere', () => {
    const e = twoIslandsWorld();
    goL1(e);
    e.dispatch({ type: 'SET_NODE_POWERED', nodeId: g(0), powered: false });
    e.dispatch({ type: 'BROADCAST_ALERT', text: 'x' });
    e.step(10);
    expect(eventsOf(e, 'AUTHORITY_INJECTED')).toEqual([]);
    expect(eventsOf(e, 'DELIVERED')).toEqual([]);
  });

  it('forged alert and forged declaration are dropped UNVERIFIABLE at every injection point', () => {
    const e = triangleWorld();
    e.dispatch({ type: 'BROADCAST_ALERT', text: 'x', forged: true });
    e.dispatch({ type: 'DECLARE_MODE', level: 'L3', forged: true });
    e.step(10);
    expect(drops(e, 'UNVERIFIABLE')).toHaveLength(6);
    expect(eventsOf(e, 'DELIVERED')).toEqual([]);
    expect(e.getSnapshot().nodes.every((n) => n.mode === 'PEACE')).toBe(true);
    expect(e.getSnapshot().declarations).toEqual([]);
    expect(stepCollect(e, 3)).toEqual([]);
  });

  it('declaration timing: injected T+1, delivered T+2, mode changes T+3 (mode evaluated before inbox)', () => {
    const e = triangleWorld();
    e.dispatch({ type: 'DECLARE_MODE', level: 'L2' });
    e.step(4);
    const decl = eventsOf(e, 'ORIGINATED').find((o) => o.class === 'MODE_DECLARATION')!.msgId;
    expect(eventsOf(e, 'AUTHORITY_INJECTED').every((x) => x.tick === 1)).toBe(true);
    expect(delivered(e, decl).every((d) => d.tick === 2)).toBe(true);
    const changes = eventsOf(e, 'MODE_CHANGED');
    expect(changes).toHaveLength(3);
    expect(changes.every((c) => c.tick === 3 && c.to === 'L2' && c.source === 'declared')).toBe(
      true,
    );
  });

  it('a message arriving in the same tick as a declaration is still judged by the old mode', () => {
    const e = lineWorld(3, 100);
    e.dispatch({ type: 'DECLARE_MODE', level: 'L3' });
    sendInfo(e); // INFO originated T+1, arrives m1 at T+2, same tick the L3 declaration lands
    e.step(3);
    const info = eventsOf(e, 'ORIGINATED').find((o) => o.class === 'INFO')!.msgId;
    expect(delivered(e, info).find((d) => d.to === m(1))!.tick).toBe(2);
    expect(drops(e, 'CLASS_NOT_ALLOWED', info).filter((d) => d.at === m(1))).toEqual([]);
    expect(modeOf(e, m(1))).toBe('L3');
  });

  it('regional declaration is forwarded by outsiders without changing their mode', () => {
    const e = chain();
    goL1(e);
    e.dispatch({
      type: 'DECLARE_MODE',
      level: 'L3',
      region: { centerX: 650, centerY: 100, radiusMtres: 120 },
    });
    const transits = stepCollect(e, 30);
    const decl = eventsOf(e, 'ORIGINATED').find((o) => o.class === 'MODE_DECLARATION')!.msgId;
    const hops = transits.filter((t) => t.msgId === decl && t.via === 'hop');
    expect(hops.map((t) => [t.from, t.to])).toEqual([
      [g(0), m(0)],
      [m(0), m(1)],
      [m(1), m(2)],
      [m(2), m(3)],
      [m(3), m(4)],
      [m(4), m(5)],
    ]);
    expect(
      delivered(e, decl)
        .map((d) => d.to)
        .sort(),
    ).toEqual([m(4), m(5)]);
    expect([g(0), m(0), m(1), m(2), m(3)].map((id) => modeOf(e, id))).toEqual([
      'L1',
      'L1',
      'L1',
      'L1',
      'L1',
    ]);
    expect([m(4), m(5)].map((id) => modeOf(e, id))).toEqual(['L3', 'L3']);
    expect(e.getSnapshot().declarations).toMatchObject([
      { level: 'L3', region: { centerX: 650, radiusMtres: 120 } },
    ]);
  });

  it('regional alert: forwarded through outsiders, delivered only inside the circle', () => {
    const e = chain();
    goL1(e);
    e.dispatch({
      type: 'BROADCAST_ALERT',
      text: 'evacuate east',
      region: { centerX: 650, centerY: 100, radiusMtres: 120 },
    });
    const transits = stepCollect(e, 30);
    const id = eventsOf(e, 'ORIGINATED').find((o) => o.class === 'OFFICIAL_ALERT')!.msgId;
    expect(
      delivered(e, id)
        .map((d) => d.to)
        .sort(),
    ).toEqual([m(4), m(5)]);
    expect(transits.filter((t) => t.msgId === id && t.via === 'hop')).toHaveLength(6);
    // an alert never changes anybody's mode
    expect([g(0), m(0), m(1), m(2), m(3), m(4), m(5)].map((n) => modeOf(e, n))).toEqual(
      Array(7).fill('L1'),
    );
  });

  it('CHECK_IN from the gateway island reaches authority.received exactly once', () => {
    const e = twoIslandsWorld();
    goL1(e);
    e.dispatch({ type: 'SEND_CHECK_IN', from: m(3), status: 'NEED_EVACUATION' });
    e.step(6);
    const id = originatedId(e);
    const received = e.getSnapshot().authority.received;
    expect(received).toEqual([{ msgId: id, tick: expect.any(Number), via: 'uplink' }]);
    const uplinks = e.getEventLog().filter((x) => x.type === 'AUTHORITY_RECEIVED');
    expect(uplinks).toHaveLength(1);
  });

  it('CHECK_IN uplink transit goes from the backhaul node to the Authority, once', () => {
    const e = twoIslandsWorld();
    goL1(e);
    e.dispatch({ type: 'SEND_CHECK_IN', from: m(3), status: 'OK' });
    const transits = stepCollect(e, 6);
    const up = transits.filter((t) => t.via === 'uplink');
    expect(up.map((t) => [t.from, t.to])).toEqual([[g(0), 'a-00']]);
  });

  it('CHECK_IN from the island without backhaul never reaches the Authority', () => {
    const e = twoIslandsWorld();
    goL1(e);
    e.dispatch({ type: 'SEND_CHECK_IN', from: m(0), status: 'TRAPPED' });
    e.step(10);
    expect(e.getSnapshot().authority.received).toEqual([]);
  });

  it('CHECK_IN dedup across many backhaul nodes (cells up, L1 declared): still exactly once', () => {
    const e = triangleWorld();
    e.dispatch({ type: 'DECLARE_MODE', level: 'L1' });
    e.step(5);
    e.dispatch({ type: 'SEND_CHECK_IN', from: m(0), status: 'OK' });
    const transits = stepCollect(e, 6);
    expect(e.getSnapshot().authority.received).toHaveLength(1);
    expect(transits.filter((t) => t.via === 'uplink')).toHaveLength(1);
  });

  it('LIFE_CRITICAL requests are uplinked too (once); INFO requests are not', () => {
    const e = triangleWorld();
    sendInfo(e, m(0), 'LIFE_CRITICAL');
    sendInfo(e, m(0), 'INFO');
    e.step(6);
    const lc = eventsOf(e, 'ORIGINATED').find((o) => o.class === 'LIFE_CRITICAL')!.msgId;
    expect(e.getSnapshot().authority.received.map((x) => x.msgId)).toEqual([lc]);
  });

  it('L3: INFO is CLASS_NOT_ALLOWED at the origin; SAFETY floods exactly 6 hops', () => {
    const e = lineWorld(10, 100);
    e.dispatch({ type: 'DECLARE_MODE', level: 'L3' });
    e.step(4);
    expect(e.getSnapshot().nodes.every((n) => n.mode === 'L3')).toBe(true);
    sendInfo(e, m(0), 'INFO');
    sendInfo(e, m(0), 'SAFETY');
    e.step(12);
    expect(drops(e, 'CLASS_NOT_ALLOWED').map((d) => d.at)).toEqual([m(0)]);
    const safety = eventsOf(e, 'ORIGINATED').find((o) => o.class === 'SAFETY')!.msgId;
    expect(
      delivered(e, safety)
        .map((d) => d.to)
        .sort(),
    ).toEqual([m(1), m(2), m(3), m(4), m(5), m(6)]);
    expect(drops(e, 'HOP_LIMIT', safety).map((d) => [d.at, d.hop])).toEqual([[m(6), 6]]);
  });

  it('L2 declaration widens reach to 15 hops', () => {
    const e = lineWorld(20, 100);
    e.dispatch({ type: 'DECLARE_MODE', level: 'L2' });
    e.step(4);
    sendInfo(e, m(0), 'SAFETY');
    e.step(25);
    expect(delivered(e, originatedId(e, 1)).map((d) => d.to)).toHaveLength(15);
  });
});

describe('tick: liveness', () => {
  it('a node that dies with packets in its inbox drops them as NODE_DOWN (with the right class)', () => {
    const e = lineWorld(3, 100);
    sendInfo(e, m(0), 'SAFETY');
    e.step(1);
    e.dispatch({ type: 'SET_NODE_POWERED', nodeId: m(1), powered: false });
    e.step(3);
    const down = drops(e, 'NODE_DOWN');
    expect(down.map((d) => [d.at, d.class])).toEqual([[m(1), 'SAFETY']]);
    expect(eventsOf(e, 'DELIVERED')).toEqual([]);
    expect(stepCollect(e, 3)).toEqual([]);
  });

  it('a dead node cannot send: pending originations are dropped NODE_DOWN', () => {
    const e = lineWorld(2, 100);
    sendInfo(e);
    e.dispatch({ type: 'SET_NODE_POWERED', nodeId: m(0), powered: false });
    e.step(2);
    expect(drops(e, 'NODE_DOWN').map((d) => d.at)).toEqual([m(0)]);
    expect(eventsOf(e, 'DELIVERED')).toEqual([]);
  });

  it('powering a node back on restores edges', () => {
    const e = lineWorld(3, 100);
    e.dispatch({ type: 'SET_NODE_POWERED', nodeId: m(1), powered: false });
    expect(e.getSnapshot().edges).toEqual([]);
    e.dispatch({ type: 'SET_NODE_POWERED', nodeId: m(1), powered: null });
    expect(e.getSnapshot().edges).toHaveLength(2);
  });
});
