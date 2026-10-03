import { describe, expect, it } from 'vitest';
import type { Command } from '../../src/domain/commands';
import { resolveEngineConfig, resolveWorldConfig } from '../../src/domain/config';
import { messageId, nodeId } from '../../src/domain/ids';
import type { MessageClass } from '../../src/domain/message';
import { applyCommand } from '../../src/engine/commands';
import { createState } from '../../src/engine/state';
import { refreshTopology, runTick } from '../../src/engine/tick';
import { acceptEligibility, openTransactionsOldestFirst } from '../../src/engine/transactions';
import { engineFrom, eventsOf, lastMessageId, mobile, router } from '../helpers';

const id = nodeId;
const request = (from: string, cls: MessageClass = 'BORROW'): Command => ({
  type: 'SendRequest',
  from: id(from),
  class: cls,
  payload: { kind: 'REQUEST', text: 'ladder' },
});

const viewOf = (e: ReturnType<typeof engineFrom>, node: string) =>
  e.getNodeDetail(id(node)).requests.map((r) => r.status);

describe('request -> accept -> response -> close', () => {
  it('unicasts the RESPONSE back along the reversed path, accepts, closes, and marks the others taken', () => {
    const e = engineFrom([
      mobile('m-001', 0, 0),
      mobile('m-002', 50, 0),
      mobile('m-003', 100, 0),
      mobile('m-004', 150, 0),
      mobile('m-005', 150, 50), // neighbour of m-004 only
    ]);
    e.dispatch(request('m-001'));
    const requestId = lastMessageId(e);
    e.step(4);
    expect(e.getNodeDetail(id('m-004')).requests).toEqual([
      { requestId, status: 'open', hop: 3, path: ['m-001', 'm-002', 'm-003'] },
    ]);
    expect(viewOf(e, 'm-001')).toEqual(['mine']);
    expect(e.getSnapshot().transactions).toMatchObject([
      { requestId, status: 'open', responses: 0 },
    ]);

    e.dispatch({ type: 'Accept', nodeId: id('m-004'), requestId });
    expect(viewOf(e, 'm-004')).toEqual(['accepted-by-me']);
    const response = e.getSnapshot().messages.at(-1)!;
    expect(response.payload).toEqual({
      kind: 'RESPONSE',
      requestId,
      responderId: 'm-004',
      targetId: 'm-001',
      returnPath: ['m-004', 'm-003', 'm-002', 'm-001'],
    });
    expect(response.class).toBe('BORROW');

    const r5 = e.step();
    expect(r5.transits).toEqual([
      {
        tick: 5,
        msgId: response.id,
        class: 'BORROW',
        from: 'm-004',
        to: 'm-003',
        hop: 1,
        via: 'hop',
      },
    ]);
    expect(e.step().transits).toMatchObject([{ from: 'm-003', to: 'm-002', hop: 2 }]);
    expect(e.step().transits).toMatchObject([{ from: 'm-002', to: 'm-001', hop: 3 }]);
    const r8 = e.step();
    expect(r8.transits).toEqual([]); // arrived: no onward flood, no NO_ROUTE
    expect(eventsOf(e, 'TX_ACCEPTED')).toEqual([
      { type: 'TX_ACCEPTED', tick: 8, requestId, nodeId: 'm-001', accepterId: 'm-004' },
    ]);
    expect(eventsOf(e, 'TX_CLOSED')).toEqual([
      { type: 'TX_CLOSED', tick: 8, requestId, nodeId: 'm-001' },
    ]);
    expect(
      eventsOf(e, 'DELIVERED')
        .filter((d) => d.msgId === response.id)
        .map((d) => d.nodeId),
    ).toEqual(['m-001']);
    expect(e.getSnapshot().transactions).toMatchObject([
      {
        requestId,
        status: 'closed',
        accepterId: 'm-004',
        acceptedTick: 8,
        closedTick: 8,
        responses: 1,
      },
    ]);

    const close = e.getSnapshot().messages.at(-1)!;
    expect(close.payload).toEqual({ kind: 'CLOSE', requestId, accepterId: 'm-004' });
    expect(close.hopLimit).toBe(3);
    e.step(); // tick 9: CLOSE leaves m-001
    expect(e.getTransits(9)).toMatchObject([{ msgId: close.id, from: 'm-001', to: 'm-002' }]);
    e.step(3);
    expect(viewOf(e, 'm-001')).toEqual(['mine']);
    expect(viewOf(e, 'm-002')).toEqual(['taken']);
    expect(viewOf(e, 'm-003')).toEqual(['taken']);
    expect(viewOf(e, 'm-004')).toEqual(['accepted-by-me']);
    expect(viewOf(e, 'm-005')).toEqual([]);
    expect(e.getSnapshot().nodes.find((n) => n.id === 'm-002')!.openRequests).toBe(0);
  });

  it('a second responder in the same tick is TX_RESPONSE_LATE and ends up taken', () => {
    const e = engineFrom([mobile('m-001', 0, 0), mobile('m-002', 50, 0), mobile('m-003', -50, 0)]);
    e.dispatch(request('m-001'));
    const requestId = lastMessageId(e);
    e.step(2);
    e.dispatch({ type: 'Accept', nodeId: id('m-002'), requestId });
    e.dispatch({ type: 'Accept', nodeId: id('m-003'), requestId });
    e.step(2);
    expect(eventsOf(e, 'TX_ACCEPTED')).toMatchObject([{ tick: 4, accepterId: 'm-002' }]);
    expect(eventsOf(e, 'TX_RESPONSE_LATE')).toEqual([
      { type: 'TX_RESPONSE_LATE', tick: 4, requestId, nodeId: 'm-001', responderId: 'm-003' },
    ]);
    expect(e.getSnapshot().transactions[0]!.responses).toBe(2);
    e.step(2);
    expect(viewOf(e, 'm-002')).toEqual(['accepted-by-me']);
    expect(viewOf(e, 'm-003')).toEqual(['taken']);
  });

  it('falls back to flooding when the recorded path is broken and still arrives', () => {
    const e = engineFrom([
      mobile('m-001', 0, 0),
      mobile('m-002', 50, 0),
      mobile('m-003', 100, 0),
      mobile('m-004', 150, 0),
      mobile('m-005', 50, 30), // adjacent to m-001, m-002, m-003
    ]);
    e.dispatch(request('m-001'));
    const requestId = lastMessageId(e);
    e.step(4);
    expect(e.getNodeDetail(id('m-004')).requests[0]).toMatchObject({
      hop: 3,
      path: ['m-001', 'm-002', 'm-003'],
    });
    e.dispatch({ type: 'Accept', nodeId: id('m-004'), requestId });
    e.dispatch({ type: 'SetNodePowered', nodeId: id('m-002'), powered: false });
    const response = e.getSnapshot().messages.at(-1)!;
    const r5 = e.step();
    expect(r5.transits).toMatchObject([{ msgId: response.id, from: 'm-004', to: 'm-003', hop: 1 }]);
    const r6 = e.step();
    expect(r6.transits).toMatchObject([{ msgId: response.id, from: 'm-003', to: 'm-005', hop: 2 }]);
    const r7 = e.step();
    expect(r7.transits).toMatchObject([{ msgId: response.id, from: 'm-005', to: 'm-001', hop: 3 }]);
    e.step();
    expect(eventsOf(e, 'TX_ACCEPTED')).toMatchObject([{ tick: 8, accepterId: 'm-004' }]);
  });

  it('the requester cannot accept its own request', () => {
    const e = engineFrom([mobile('m-001', 0, 0), mobile('m-002', 50, 0)]);
    e.dispatch(request('m-001'));
    const requestId = lastMessageId(e);
    e.step(2);
    const before = e.getSnapshot().messages.length;
    e.dispatch({ type: 'Accept', nodeId: id('m-001'), requestId });
    expect(e.getSnapshot().messages).toHaveLength(before);
    expect(viewOf(e, 'm-001')).toEqual(['mine']);
    e.step(3);
    expect(eventsOf(e, 'TX_ACCEPTED')).toEqual([]);
  });

  it('relay and unregistered nodes never get a request view and cannot accept', () => {
    const e = engineFrom([
      mobile('m-001', 0, 0),
      router('r-001', 50, 0),
      mobile('m-002', 100, 0, 'none'),
      mobile('m-003', 150, 0),
    ]);
    e.dispatch(request('m-001'));
    const requestId = lastMessageId(e);
    e.step(5);
    expect(viewOf(e, 'r-001')).toEqual([]);
    expect(viewOf(e, 'm-002')).toEqual([]);
    expect(viewOf(e, 'm-003')).toEqual(['open']);
    const before = e.getSnapshot().messages.length;
    e.dispatch({ type: 'Accept', nodeId: id('r-001'), requestId });
    e.dispatch({ type: 'Accept', nodeId: id('m-002'), requestId });
    expect(e.getSnapshot().messages).toHaveLength(before);
    e.dispatch({ type: 'AutoRespond' });
    expect(viewOf(e, 'm-003')).toEqual(['accepted-by-me']);
  });
});

describe('AutoRespond', () => {
  it('nearest-hops picks the fewest hops, ties broken by id', () => {
    const e = engineFrom([
      mobile('m-001', 0, 0),
      mobile('m-002', 100, 0), // hop 2 via m-003
      mobile('m-003', 50, 0), // hop 1
      mobile('m-004', -50, 0), // hop 1
    ]);
    e.dispatch(request('m-001'));
    const requestId = lastMessageId(e);
    e.step(3);
    expect(e.getNodeDetail(id('m-002')).requests[0]!.hop).toBe(2);
    e.dispatch({ type: 'AutoRespond', strategy: 'nearest-hops' });
    expect(viewOf(e, 'm-003')).toEqual(['accepted-by-me']);
    expect(viewOf(e, 'm-004')).toEqual(['open']);
    expect(viewOf(e, 'm-002')).toEqual(['open']);
    e.step(2);
    expect(eventsOf(e, 'TX_ACCEPTED')).toMatchObject([{ requestId, accepterId: 'm-003' }]);
    expect(eventsOf(e, 'AUTO_RESPOND_NONE')).toEqual([]);
  });

  it('without a requestId it serves the oldest open request; with none eligible it logs AUTO_RESPOND_NONE', () => {
    const e = engineFrom([mobile('m-001', 0, 0), mobile('m-002', 50, 0)]);
    e.dispatch({ type: 'AutoRespond' });
    expect(eventsOf(e, 'AUTO_RESPOND_NONE')).toEqual([
      { type: 'AUTO_RESPOND_NONE', tick: 0, requestId: null },
    ]);
    e.dispatch(request('m-001'));
    const first = lastMessageId(e);
    e.step();
    e.dispatch(request('m-001', 'INFO'));
    const second = lastMessageId(e);
    e.step(2);
    expect(viewOf(e, 'm-002')).toEqual(['open', 'open']);
    e.dispatch({ type: 'AutoRespond' });
    expect(e.getNodeDetail(id('m-002')).requests).toMatchObject([
      { requestId: first, status: 'accepted-by-me' },
      { requestId: second, status: 'open' },
    ]);
    e.dispatch({ type: 'AutoRespond', requestId: first });
    expect(eventsOf(e, 'AUTO_RESPOND_NONE').at(-1)).toEqual({
      type: 'AUTO_RESPOND_NONE',
      tick: 3,
      requestId: first,
    });
    e.dispatch({ type: 'AutoRespond' });
    expect(viewOf(e, 'm-002')).toEqual(['accepted-by-me', 'accepted-by-me']);
  });

  it('random strategy is deterministic for a seed', () => {
    const build = () => {
      const e = engineFrom(
        [mobile('m-001', 0, 0), mobile('m-002', 50, 0), mobile('m-003', -50, 0)],
        {},
        { seed: 9 },
      );
      e.dispatch(request('m-001'));
      e.step(2);
      e.dispatch({ type: 'AutoRespond', strategy: 'random' });
      return e.getSnapshot().messages.at(-1)!.originId;
    };
    expect(build()).toBe(build());
  });
});

describe('autoConfirm off', () => {
  it('stays accepted until an explicit Close, which then floods and marks others taken', () => {
    const e = engineFrom([mobile('m-001', 0, 0), mobile('m-002', 50, 0), mobile('m-003', -50, 0)], {
      autoConfirm: false,
    });
    e.dispatch(request('m-001'));
    const requestId = lastMessageId(e);
    e.step(2);
    e.dispatch({ type: 'Accept', nodeId: id('m-002'), requestId });
    e.step(2);
    expect(eventsOf(e, 'TX_ACCEPTED')).toHaveLength(1);
    e.step(10);
    expect(e.getSnapshot().transactions[0]).toMatchObject({
      status: 'accepted',
      accepterId: 'm-002',
      closedTick: null,
    });
    expect(eventsOf(e, 'TX_CLOSED')).toEqual([]);
    expect(viewOf(e, 'm-003')).toEqual(['open']);

    e.dispatch({ type: 'Close', requestId });
    expect(eventsOf(e, 'TX_CLOSED')).toMatchObject([{ tick: 14, requestId }]);
    expect(e.getSnapshot().transactions[0]).toMatchObject({ status: 'closed', closedTick: 14 });
    e.step(2);
    expect(viewOf(e, 'm-002')).toEqual(['accepted-by-me']);
    expect(viewOf(e, 'm-003')).toEqual(['taken']);
    e.dispatch({ type: 'Close', requestId }); // idempotent
    expect(eventsOf(e, 'TX_CLOSED')).toHaveLength(1);
  });

  it('Close on an open request uses the requester as accepterId', () => {
    const e = engineFrom([mobile('m-001', 0, 0), mobile('m-002', 50, 0)]);
    e.dispatch(request('m-001'));
    const requestId = lastMessageId(e);
    e.step(2);
    e.dispatch({ type: 'Close', requestId });
    expect(e.getSnapshot().messages.at(-1)!.payload).toEqual({
      kind: 'CLOSE',
      requestId,
      accepterId: 'm-001',
    });
    e.step(2);
    expect(viewOf(e, 'm-002')).toEqual(['taken']);
    expect(viewOf(e, 'm-001')).toEqual(['mine']);
  });
});

describe('request expiry (TTL)', () => {
  it('retires an expired request everywhere: tx closed without a CLOSE, views pruned, AutoRespond serves the fresh one', () => {
    const e = engineFrom([mobile('m-001', 0, 0), mobile('m-002', 50, 0), mobile('m-003', 100, 0)]);
    e.dispatch(request('m-001')); // A: created at tick 0, PEACE ttl 120
    const a = lastMessageId(e);
    e.step(3);
    expect(viewOf(e, 'm-002')).toEqual(['open']);
    expect(viewOf(e, 'm-003')).toEqual(['open']);
    e.step(117); // tick 120: 0 + 120 is not < 120, still open everywhere
    expect(e.getSnapshot().transactions[0]).toMatchObject({ requestId: a, status: 'open' });
    expect(e.getSnapshot().nodes.map((n) => n.openRequests)).toEqual([0, 1, 1]);
    const messagesBefore = e.getSnapshot().messages.length;

    e.step(); // tick 121: expired
    expect(e.getSnapshot().transactions[0]).toMatchObject({
      requestId: a,
      status: 'closed',
      closedTick: 121,
      accepterId: null,
      responses: 0,
    });
    expect(eventsOf(e, 'TX_CLOSED')).toEqual([
      { type: 'TX_CLOSED', tick: 121, requestId: a, nodeId: 'm-001' },
    ]);
    e.step(2);
    expect(e.getSnapshot().messages).toHaveLength(messagesBefore); // no CLOSE originated
    expect(e.getSnapshot().messages.filter((m) => m.payload.kind === 'CLOSE')).toEqual([]);
    expect(e.getSnapshot().nodes.map((n) => n.openRequests)).toEqual([0, 0, 0]);
    expect(viewOf(e, 'm-001')).toEqual([]);
    expect(viewOf(e, 'm-002')).toEqual([]);
    expect(viewOf(e, 'm-003')).toEqual([]);

    e.dispatch(request('m-001', 'INFO')); // B at tick 63
    const b = lastMessageId(e);
    e.step(3); // open at m-002 (65) and m-003 (66)
    expect(viewOf(e, 'm-002')).toEqual(['open']);
    e.dispatch({ type: 'AutoRespond' });
    expect(eventsOf(e, 'AUTO_RESPOND_NONE')).toEqual([]);
    expect(e.getSnapshot().messages.at(-1)!.payload).toMatchObject({
      kind: 'RESPONSE',
      requestId: b,
      responderId: 'm-002',
    });
    expect(e.getNodeDetail(id('m-002')).requests).toEqual([
      { requestId: b, status: 'accepted-by-me', hop: 1, path: ['m-001'] },
    ]);

    // an Accept on the expired request is a no-op
    const before = e.getSnapshot().messages.length;
    e.dispatch({ type: 'Accept', nodeId: id('m-003'), requestId: a });
    expect(e.getSnapshot().messages).toHaveLength(before);
    expect(viewOf(e, 'm-003')).toEqual(['open']); // B only
  });

  it('acceptEligibility reports EXPIRED for a request past its TTL and the open list skips it', () => {
    const state = createState(
      resolveWorldConfig({ width: 1000, height: 700 }),
      resolveEngineConfig(),
      [mobile('m-001', 0, 0), mobile('m-002', 50, 0)],
    );
    refreshTopology(state);
    applyCommand(state, request('m-001'));
    const a = messageId('m-001#1');
    runTick(state);
    runTick(state); // tick 2: open at m-002
    expect(acceptEligibility(state, id('m-002'), a)).toMatchObject({ ok: true });
    expect(openTransactionsOldestFirst(state).map((tx) => tx.requestId)).toEqual([a]);
    while (state.tick < 120) runTick(state);
    expect(acceptEligibility(state, id('m-002'), a)).toMatchObject({ ok: true });
    runTick(state); // tick 121
    expect(acceptEligibility(state, id('m-002'), a)).toEqual({ ok: false, reason: 'EXPIRED' });
    expect(acceptEligibility(state, id('m-001'), a)).toEqual({ ok: false, reason: 'EXPIRED' });
    expect(openTransactionsOldestFirst(state)).toEqual([]);
    expect(acceptEligibility(state, id('m-002'), messageId('m-001#9'))).toEqual({
      ok: false,
      reason: 'UNKNOWN_REQUEST',
    });
  });
});

describe('late accept (stage 3)', () => {
  it('an Accept after the close but before the CLOSE arrives yields TX_RESPONSE_LATE and ends taken', () => {
    const e = engineFrom([mobile('m-001', 0, 0), mobile('m-002', 50, 0), mobile('m-003', 100, 0)]);
    e.dispatch(request('m-001'));
    const requestId = lastMessageId(e);
    e.step(3); // open at m-002 (tick 2) and m-003 (tick 3)
    e.dispatch({ type: 'Accept', nodeId: id('m-002'), requestId });
    e.step(2); // response leaves at 4, delivered at 5: accepted and closed
    expect(eventsOf(e, 'TX_CLOSED')).toMatchObject([{ tick: 5 }]);
    expect(viewOf(e, 'm-003')).toEqual(['open']); // the CLOSE has not arrived yet
    e.dispatch({ type: 'Accept', nodeId: id('m-003'), requestId });
    expect(viewOf(e, 'm-003')).toEqual(['accepted-by-me']);
    e.step(4);
    expect(eventsOf(e, 'TX_RESPONSE_LATE')).toEqual([
      { type: 'TX_RESPONSE_LATE', tick: 8, requestId, nodeId: 'm-001', responderId: 'm-003' },
    ]);
    expect(e.getSnapshot().transactions[0]).toMatchObject({
      status: 'closed',
      accepterId: 'm-002',
      responses: 2,
    });
    expect(viewOf(e, 'm-003')).toEqual(['taken']);
    expect(viewOf(e, 'm-002')).toEqual(['accepted-by-me']);
    expect(viewOf(e, 'm-001')).toEqual(['mine']);
    expect(eventsOf(e, 'TX_CLOSED')).toHaveLength(1);
  });
});

describe('mixed-mode return path', () => {
  it('a PEACE responder at the end of an L2 path gets a RESPONSE budget that covers the whole path back', () => {
    const e = engineFrom(
      Array.from({ length: 10 }, (_, i) =>
        mobile(`m-${String(i + 1).padStart(3, '0')}`, i * 50, 0),
      ),
    );
    e.dispatch({ type: 'DeclareMode', level: 'L2', region: { x: 200, y: 0, r: 240 } });
    e.step(3); // delivered on tick 2, applied by the mode machine on tick 3
    expect(e.getSnapshot().nodes.map((n) => n.mode)).toEqual([...Array(9).fill('L2'), 'PEACE']);
    e.dispatch({
      type: 'SendRequest',
      from: id('m-001'),
      class: 'INFO',
      payload: { kind: 'REQUEST', text: 'ladder' },
      hopLimit: 10,
    });
    const requestId = lastMessageId(e);
    e.step(12);
    expect(e.getNodeDetail(id('m-010')).requests[0]).toMatchObject({
      requestId,
      status: 'open',
      hop: 9,
    });
    e.dispatch({ type: 'Accept', nodeId: id('m-010'), requestId });
    const response = e.getSnapshot().messages.at(-1)!;
    expect(response.hopLimit).toBe(10);
    e.step(15);
    expect(eventsOf(e, 'TX_ACCEPTED')).toMatchObject([{ nodeId: 'm-001', accepterId: 'm-010' }]);
    expect(eventsOf(e, 'DELIVERED').filter((d) => d.msgId === response.id)).toMatchObject([
      { nodeId: 'm-001', hop: 9 },
    ]);
    expect(eventsOf(e, 'DROPPED').filter((d) => d.msgId === response.id)).toEqual([]);
    expect(e.getSnapshot().transactions).toMatchObject([
      { requestId, status: 'closed', accepterId: 'm-010' },
    ]);
  });
});
