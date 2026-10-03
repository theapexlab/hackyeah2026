import { describe, expect, it } from 'vitest';
import type { NodeId } from '../../src/domain/ids';
import type { SimEngine } from '../../src/engine/engine';
import {
  baseWorld,
  eventsOf,
  layout,
  lineWorld,
  m,
  originatedId,
  r,
  setCredential,
  stepCollect,
  triangleWorld,
} from '../helpers';

/**
 * m0 - m1 - m2 - m3 on a line, m4 hanging off m2 (in range of m2 only).
 * A PEACE request from m0 reaches m3 and m4 at hop 3 (the PEACE limit).
 */
function request3Hops(cfg?: Parameters<typeof layout>[2]): SimEngine {
  const e = layout(
    baseWorld({ mobiles: 5, range: { mobile: 150, router: 150, gateway: 150 } }),
    {
      [m(0)]: [50, 100],
      [m(1)]: [150, 100],
      [m(2)]: [250, 100],
      [m(3)]: [350, 100],
      [m(4)]: [250, 230],
    },
    cfg,
  );
  e.dispatch({ type: 'SEND_REQUEST', from: m(0), class: 'LEND', text: 'drill' });
  e.step(4);
  return e;
}

const view = (e: SimEngine, id: NodeId) => e.getNodeDetail(id).requestView.map((v) => v.status);
const originatedBy = (e: SimEngine, id: NodeId) =>
  eventsOf(e, 'ORIGINATED').filter((o) => o.originId === id);

describe('transactions: happy path', () => {
  it('request floods to the hop limit and every citizen sees it as open', () => {
    const e = request3Hops();
    expect([m(1), m(2), m(3), m(4)].map((id) => view(e, id))).toEqual([
      ['open'],
      ['open'],
      ['open'],
      ['open'],
    ]);
    expect(view(e, m(0))).toEqual(['mine']);
    expect(e.getSnapshot().transactions).toEqual([
      { requestId: originatedId(e), status: 'open', originId: m(0) },
    ]);
    expect(e.getSnapshot().nodes.find((n) => n.id === m(3))!.openRequests).toBe(1);
    expect(e.getNodeDetail(m(3)).requestView[0]!.hop).toBe(3);
  });

  it('Accept -> RESPONSE unicast along the reversed path -> TX_ACCEPTED -> CLOSE floods -> others see taken', () => {
    const e = request3Hops();
    const requestId = originatedId(e);
    e.dispatch({ type: 'ACCEPT', nodeId: m(3), requestId });
    expect(view(e, m(3))).toEqual(['accepted-by-me']);

    const transits = stepCollect(e, 4); // ticks 5..8
    const responseId = originatedBy(e, m(3))[0]!.msgId;
    const responseHops = transits.filter((t) => t.msgId === responseId);
    // strictly unicast: one copy per hop, back along m3 -> m2 -> m1 -> m0, never to m4
    expect(responseHops.map((t) => [t.tick, t.from, t.to, t.hop, t.via])).toEqual([
      [5, m(3), m(2), 1, 'hop'],
      [6, m(2), m(1), 2, 'hop'],
      [7, m(1), m(0), 3, 'hop'],
    ]);

    const accepted = eventsOf(e, 'TX_ACCEPTED');
    expect(accepted).toEqual([{ type: 'TX_ACCEPTED', tick: 8, requestId, acceptedBy: m(3) }]);
    expect(e.getSnapshot().transactions[0]).toMatchObject({ status: 'accepted', acceptedBy: m(3) });
    expect(eventsOf(e, 'TX_CLOSED')).toEqual([]);

    // auto-CLOSE is an origination: leaves at T+1 (tick 9), TX_CLOSED at the same moment
    const closes = originatedBy(e, m(0)).filter((o) => o.msgId !== requestId);
    expect(closes).toEqual([]);
    const closeTransits = stepCollect(e, 1);
    expect(eventsOf(e, 'TX_CLOSED')).toEqual([{ type: 'TX_CLOSED', tick: 9, requestId }]);
    expect(originatedBy(e, m(0)).filter((o) => o.msgId !== requestId)).toHaveLength(1);
    expect(closeTransits.map((t) => [t.from, t.to])).toEqual([[m(0), m(1)]]);

    e.step(4);
    expect(e.getSnapshot().transactions[0]).toMatchObject({ status: 'closed' });
    expect([m(1), m(2), m(4)].map((id) => view(e, id))).toEqual([['taken'], ['taken'], ['taken']]);
    expect(view(e, m(3))).toEqual(['accepted-by-me']);
    expect(view(e, m(0))).toEqual(['mine']);
    expect(e.getSnapshot().nodes.every((n) => n.openRequests === 0)).toBe(true);
  });

  it('RESPONSE and CLOSE inherit the request class', () => {
    const e = layout(baseWorld({ mobiles: 3, range: { mobile: 150, router: 150, gateway: 150 } }), {
      [m(0)]: [50, 100],
      [m(1)]: [150, 100],
      [m(2)]: [250, 100],
    });
    e.dispatch({ type: 'SEND_REQUEST', from: m(0), class: 'LIFE_CRITICAL', text: 'AED' });
    e.step(3);
    e.dispatch({ type: 'AUTO_RESPOND', strategy: 'nearest-hops' });
    e.step(8);
    expect(eventsOf(e, 'ORIGINATED').map((o) => o.class)).toEqual([
      'LIFE_CRITICAL',
      'LIFE_CRITICAL',
      'LIFE_CRITICAL',
    ]);
  });

  it('first accept wins: a late Accept yields TX_RESPONSE_LATE and no second CLOSE', () => {
    const e = request3Hops();
    const requestId = originatedId(e);
    e.dispatch({ type: 'ACCEPT', nodeId: m(3), requestId });
    e.dispatch({ type: 'ACCEPT', nodeId: m(4), requestId });
    e.step(12);
    expect(eventsOf(e, 'TX_ACCEPTED')).toHaveLength(1);
    expect(eventsOf(e, 'TX_ACCEPTED')[0]!.acceptedBy).toBe(m(3));
    expect(eventsOf(e, 'TX_RESPONSE_LATE')).toEqual([
      { type: 'TX_RESPONSE_LATE', tick: 8, requestId, responderId: m(4) },
    ]);
    expect(eventsOf(e, 'TX_CLOSED')).toHaveLength(1);
    expect(originatedBy(e, m(0))).toHaveLength(2); // request + exactly one CLOSE
  });

  it('an Accept after the CLOSE flooded is a no-op (request is taken)', () => {
    const e = request3Hops();
    const requestId = originatedId(e);
    e.dispatch({ type: 'ACCEPT', nodeId: m(3), requestId });
    e.step(14);
    const before = eventsOf(e, 'ORIGINATED').length;
    e.dispatch({ type: 'ACCEPT', nodeId: m(4), requestId });
    e.step(10);
    expect(eventsOf(e, 'ORIGINATED')).toHaveLength(before);
    expect(view(e, m(4))).toEqual(['taken']);
  });

  it('the requester cannot accept its own request', () => {
    const e = request3Hops();
    const before = eventsOf(e, 'ORIGINATED').length;
    e.dispatch({ type: 'ACCEPT', nodeId: m(0), requestId: originatedId(e) });
    e.step(6);
    expect(eventsOf(e, 'ORIGINATED')).toHaveLength(before);
    expect(eventsOf(e, 'TX_ACCEPTED')).toEqual([]);
  });

  it('a node that never saw the request cannot accept it', () => {
    const e = lineWorld(6, 100);
    e.dispatch({ type: 'SEND_REQUEST', from: m(0), class: 'LEND', text: 'x' });
    e.step(8);
    e.dispatch({ type: 'ACCEPT', nodeId: m(5), requestId: originatedId(e) });
    e.step(8);
    expect(eventsOf(e, 'TX_ACCEPTED')).toEqual([]);
  });
});

describe('transactions: path handling', () => {
  it('broken return path falls back to flooding and still arrives (FR-NET-07)', () => {
    // m1 is the recorded relay; m3 is an alternative neighbour of both m0 and m2.
    const e = layout(baseWorld({ mobiles: 4, range: { mobile: 150, router: 150, gateway: 150 } }), {
      [m(0)]: [50, 100],
      [m(1)]: [150, 100],
      [m(2)]: [250, 100],
      [m(3)]: [150, 180],
    });
    e.dispatch({ type: 'SEND_REQUEST', from: m(0), class: 'LEND', text: 'x' });
    e.step(3);
    const requestId = originatedId(e);
    expect(e.getNodeDetail(m(2)).requestView[0]).toMatchObject({ status: 'open', hop: 2 });

    e.dispatch({ type: 'SET_NODE_POWERED', nodeId: m(1), powered: false });
    e.dispatch({ type: 'ACCEPT', nodeId: m(2), requestId });
    const transits = stepCollect(e, 3);
    const responseId = originatedBy(e, m(2))[0]!.msgId;
    expect(
      transits.filter((t) => t.msgId === responseId).map((t) => [t.from, t.to, t.tick]),
    ).toEqual([
      [m(2), m(3), 4],
      [m(3), m(0), 5],
    ]);
    expect(eventsOf(e, 'TX_ACCEPTED')).toEqual([
      { type: 'TX_ACCEPTED', tick: 6, requestId, acceptedBy: m(2) },
    ]);
  });

  it('intact path: the same topology uses the recorded path, not the alternative', () => {
    const e = layout(baseWorld({ mobiles: 4, range: { mobile: 150, router: 150, gateway: 150 } }), {
      [m(0)]: [50, 100],
      [m(1)]: [150, 100],
      [m(2)]: [250, 100],
      [m(3)]: [150, 180],
    });
    e.dispatch({ type: 'SEND_REQUEST', from: m(0), class: 'LEND', text: 'x' });
    e.step(3);
    e.dispatch({ type: 'ACCEPT', nodeId: m(2), requestId: originatedId(e) });
    const transits = stepCollect(e, 2);
    const responseId = originatedBy(e, m(2))[0]!.msgId;
    expect(transits.filter((t) => t.msgId === responseId).map((t) => [t.from, t.to])).toEqual([
      [m(2), m(1)],
      [m(1), m(0)],
    ]);
  });
});

describe('transactions: AutoRespond', () => {
  it('nearest-hops picks the lowest hop; ties break on node id', () => {
    const star = layout(
      baseWorld({ mobiles: 4, range: { mobile: 200, router: 150, gateway: 150 } }),
      {
        [m(0)]: [100, 100],
        [m(1)]: [150, 100],
        [m(2)]: [100, 150],
        [m(3)]: [50, 100],
      },
    );
    star.dispatch({ type: 'SEND_REQUEST', from: m(0), class: 'LEND', text: 'x' });
    star.step(3);
    star.dispatch({ type: 'AUTO_RESPOND', strategy: 'nearest-hops' });
    star.step(1);
    expect(originatedBy(star, m(1))).toHaveLength(1);
    expect(originatedBy(star, m(2))).toHaveLength(0);
    expect(originatedBy(star, m(3))).toHaveLength(0);

    const line = lineWorld(4, 100);
    line.dispatch({ type: 'SEND_REQUEST', from: m(0), class: 'LEND', text: 'x' });
    line.step(4);
    line.dispatch({ type: 'AUTO_RESPOND', strategy: 'nearest-hops' });
    line.step(1);
    expect(originatedBy(line, m(1))).toHaveLength(1);
    expect(originatedBy(line, m(2))).toHaveLength(0);
  });

  it('a RESPONSE stops at the requester instead of flooding on to its other neighbours', () => {
    const star = layout(
      baseWorld({ mobiles: 4, range: { mobile: 200, router: 150, gateway: 150 } }),
      {
        [m(0)]: [100, 100],
        [m(1)]: [150, 100],
        [m(2)]: [100, 150],
        [m(3)]: [50, 100],
      },
    );
    star.dispatch({ type: 'SEND_REQUEST', from: m(0), class: 'LEND', text: 'x' });
    star.step(3);
    star.dispatch({ type: 'AUTO_RESPOND', strategy: 'nearest-hops' });
    const transits = stepCollect(star, 3);
    const responseId = originatedBy(star, m(1))[0]!.msgId;
    expect(transits.filter((t) => t.msgId === responseId).map((t) => [t.from, t.to])).toEqual([
      [m(1), m(0)],
    ]);
  });

  it('only citizens are eligible (unregistered nodes have no view)', () => {
    const e = triangleWorld();
    setCredential(e, m(1), 'none');
    e.dispatch({ type: 'SEND_REQUEST', from: m(0), class: 'LEND', text: 'x' });
    e.step(3);
    e.dispatch({ type: 'AUTO_RESPOND', strategy: 'nearest-hops' });
    e.step(1);
    expect(originatedBy(e, m(1))).toHaveLength(0);
    expect(originatedBy(e, m(2))).toHaveLength(1);
  });

  it('dead nodes are not eligible', () => {
    const e = triangleWorld();
    e.dispatch({ type: 'SEND_REQUEST', from: m(0), class: 'LEND', text: 'x' });
    e.step(3);
    e.dispatch({ type: 'SET_NODE_POWERED', nodeId: m(1), powered: false });
    e.dispatch({ type: 'AUTO_RESPOND', strategy: 'nearest-hops' });
    e.step(1);
    expect(originatedBy(e, m(2))).toHaveLength(1);
  });

  it('without requestId it serves the oldest open request that someone can answer', () => {
    const e = triangleWorld();
    e.dispatch({ type: 'SEND_REQUEST', from: m(0), class: 'LEND', text: 'first' });
    e.dispatch({ type: 'SEND_REQUEST', from: m(1), class: 'LEND', text: 'second' });
    e.step(3);
    const [first, second] = e.getSnapshot().transactions.map((t) => t.requestId);
    expect(first).not.toBe(second);
    e.dispatch({ type: 'AUTO_RESPOND', strategy: 'nearest-hops' });
    e.step(1);
    const response = eventsOf(e, 'ORIGINATED').find(
      (o) => o.originId === m(1) && o.msgId !== second,
    );
    expect(response).toBeDefined();
    e.step(5);
    expect(eventsOf(e, 'TX_ACCEPTED')[0]!.requestId).toBe(first);
  });

  it('nobody eligible -> AUTO_RESPOND_NONE and no response', () => {
    const e = lineWorld(1, 100);
    e.dispatch({ type: 'SEND_REQUEST', from: m(0), class: 'LEND', text: 'x' });
    e.step(2);
    const requestId = originatedId(e);
    e.dispatch({ type: 'AUTO_RESPOND', strategy: 'nearest-hops' });
    e.step(3);
    expect(eventsOf(e, 'AUTO_RESPOND_NONE')).toEqual([
      { type: 'AUTO_RESPOND_NONE', tick: 2, requestId },
    ]);
    expect(eventsOf(e, 'ORIGINATED')).toHaveLength(1);
  });

  it('no open request at all: quiet no-op', () => {
    const e = lineWorld(2, 100);
    e.dispatch({ type: 'AUTO_RESPOND', strategy: 'nearest-hops' });
    e.step(2);
    expect(eventsOf(e, 'AUTO_RESPOND_NONE')).toEqual([]);
    expect(eventsOf(e, 'ORIGINATED')).toEqual([]);
  });

  it('random strategy only picks eligible nodes and is deterministic per seed', () => {
    const run = (seed: number) => {
      const e = layout(
        baseWorld({ seed, mobiles: 4, range: { mobile: 200, router: 150, gateway: 150 } }),
        { [m(0)]: [100, 100], [m(1)]: [150, 100], [m(2)]: [100, 150], [m(3)]: [50, 100] },
      );
      e.dispatch({ type: 'SEND_REQUEST', from: m(0), class: 'LEND', text: 'x' });
      e.step(3);
      e.dispatch({ type: 'AUTO_RESPOND', strategy: 'random' });
      e.step(1);
      return eventsOf(e, 'ORIGINATED')
        .slice(1)
        .map((o) => o.originId);
    };
    for (let seed = 1; seed <= 12; seed++) {
      const picked = run(seed);
      expect(picked).toHaveLength(1);
      expect([m(1), m(2), m(3)]).toContain(picked[0]);
      expect(run(seed)).toEqual(picked);
    }
    expect(new Set([...Array(12).keys()].map((s) => run(s + 1)[0])).size).toBeGreaterThan(1);
  });
});

describe('transactions: confirmation and credentials', () => {
  it('autoConfirm=false: stays accepted until an explicit Close', () => {
    const e = request3Hops({ autoConfirm: false });
    const requestId = originatedId(e);
    e.dispatch({ type: 'ACCEPT', nodeId: m(3), requestId });
    e.step(12);
    expect(e.getSnapshot().transactions[0]).toMatchObject({ status: 'accepted' });
    expect(originatedBy(e, m(0))).toHaveLength(1);
    expect(view(e, m(1))).toEqual(['open']);

    e.dispatch({ type: 'CLOSE', requestId });
    e.step(8);
    expect(e.getSnapshot().transactions[0]).toMatchObject({ status: 'closed' });
    expect(eventsOf(e, 'TX_CLOSED')).toHaveLength(1);
    expect([m(1), m(2), m(4)].map((id) => view(e, id))).toEqual([['taken'], ['taken'], ['taken']]);
  });

  it('Close on a request that is not accepted does nothing', () => {
    const e = request3Hops({ autoConfirm: false });
    e.dispatch({ type: 'CLOSE', requestId: originatedId(e) });
    e.step(6);
    expect(eventsOf(e, 'TX_CLOSED')).toEqual([]);
    expect(originatedBy(e, m(0))).toHaveLength(1);
  });

  it('relay and unregistered nodes forward requests but never get a requestView', () => {
    const e = layout(
      baseWorld({
        mobiles: 3,
        routers: 1,
        range: { mobile: 100, router: 150, gateway: 150 },
      }),
      { [m(0)]: [50, 100], [r(0)]: [130, 100], [m(1)]: [210, 100], [m(2)]: [290, 100] },
    );
    setCredential(e, m(1), 'none');
    e.dispatch({ type: 'SEND_REQUEST', from: m(0), class: 'LEND', text: 'x' });
    e.step(6);
    expect(view(e, r(0))).toEqual([]);
    expect(view(e, m(1))).toEqual([]);
    // the request still crossed router and unregistered phone (hop 3 = m2)
    expect(view(e, m(2))).toEqual(['open']);
    const snap = e.getSnapshot();
    expect(snap.nodes.find((n) => n.id === r(0))!.openRequests).toBe(0);
    expect(snap.nodes.find((n) => n.id === m(1))!.openRequests).toBe(0);
  });

  it('forged requests never open a transaction, so nobody can accept them', () => {
    const e = triangleWorld();
    e.dispatch({
      type: 'SEND_REQUEST',
      from: m(0),
      class: 'LEND',
      text: 'x',
      forge: { claimKind: 'citizen' },
    });
    e.step(3);
    e.dispatch({ type: 'AUTO_RESPOND', strategy: 'nearest-hops' });
    e.step(2);
    expect(e.getSnapshot().transactions).toEqual([]);
    expect(eventsOf(e, 'AUTO_RESPOND_NONE')).toEqual([]);
  });

  it('SEND_REQUEST accepts the legacy payload shape used by the UI', () => {
    const e = lineWorld(2, 100);
    e.dispatch({
      type: 'SEND_REQUEST',
      from: m(0),
      class: 'LEND',
      payload: { text: 'via payload', category: 'tools', price: 5 },
    } as never);
    e.step(3);
    expect(eventsOf(e, 'DELIVERED').map((d) => d.to)).toEqual([m(1)]);
  });
});
