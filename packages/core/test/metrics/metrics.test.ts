import { describe, expect, it } from 'vitest';
import type { Command } from '../../src/domain/commands';
import { DROP_REASONS } from '../../src/domain/events';
import { messageId, nodeId } from '../../src/domain/ids';
import type { MessageClass } from '../../src/domain/message';
import { MESSAGE_CLASSES } from '../../src/domain/message';
import type { CredentialKind } from '../../src/domain/node';
import { emptyMetrics } from '../../src/domain/snapshot';
import {
  deliveryAudience,
  deliveryCoverage,
  MetricsState,
  medianOfHistogram,
} from '../../src/metrics/metrics';
import { engineFrom, eventsOf, gateway, mobile, router } from '../helpers';

const m1 = messageId('m-001#1');
const m2 = messageId('m-001#2');
const n = (i: number) => nodeId(`m-${String(i).padStart(3, '0')}`);

describe('medianOfHistogram', () => {
  it('is null when empty, the middle value for odd counts, the mean of the two middles for even', () => {
    expect(medianOfHistogram(new Map())).toBeNull();
    expect(medianOfHistogram(new Map([[3, 1]]))).toBe(3);
    expect(
      medianOfHistogram(
        new Map([
          [1, 1],
          [2, 2],
          [3, 1],
        ]),
      ),
    ).toBe(2);
    expect(
      medianOfHistogram(
        new Map([
          [1, 1],
          [2, 1],
        ]),
      ),
    ).toBe(1.5);
    expect(
      medianOfHistogram(
        new Map([
          [5, 1],
          [1, 3],
        ]),
      ),
    ).toBe(1); // insertion order must not matter
    expect(
      medianOfHistogram(
        new Map([
          [1, 2],
          [4, 2],
        ]),
      ),
    ).toBe(2.5);
  });
});

describe('MetricsState', () => {
  it('starts equal to emptyMetrics()', () => {
    expect(new MetricsState().view()).toEqual(emptyMetrics());
  });

  it('counts originations, every delivery, unique reach and drops per class and in totals', () => {
    const m = new MetricsState();
    m.onOriginated('INFO');
    m.onOriginated('INFO');
    m.onOriginated('LIFE_CRITICAL');
    m.onDelivered('INFO', m1, n(2), 1, 1);
    m.onDelivered('INFO', m1, n(3), 2, 2);
    m.onDelivered('INFO', m1, n(2), 1, 1); // duplicate delivery at the same node
    m.onDelivered('INFO', m2, n(2), 1, 3);
    m.onDropped('INFO', 'DUPLICATE');
    m.onDropped('INFO', 'DUPLICATE');
    m.onDropped('LIFE_CRITICAL', 'HOP_LIMIT');
    const v = m.view();
    expect(v.byClass.INFO).toEqual({ originated: 2, delivered: 4, uniqueReached: 3, dropped: 2 });
    expect(v.byClass.LIFE_CRITICAL).toEqual({
      originated: 1,
      delivered: 0,
      uniqueReached: 0,
      dropped: 1,
    });
    expect(v.byClass.LEND).toEqual({ originated: 0, delivered: 0, uniqueReached: 0, dropped: 0 });
    expect(v.dropsByReason.DUPLICATE).toBe(2);
    expect(v.dropsByReason.HOP_LIMIT).toBe(1);
    expect(v.dropsByReason.UNVERIFIABLE).toBe(0);
    expect(v.totals).toEqual({ originated: 3, delivered: 4, dropped: 3 });
    expect(Object.values(v.dropsByReason).reduce((a, b) => a + b, 0)).toBe(v.totals.dropped);
  });

  it('computes medians from first deliveries only', () => {
    const m = new MetricsState();
    expect(m.view().medianHops).toBeNull();
    expect(m.view().medianLatency).toBeNull();
    m.onDelivered('INFO', m1, n(2), 1, 1);
    m.onDelivered('INFO', m1, n(3), 2, 2);
    m.onDelivered('INFO', m1, n(4), 2, 2);
    m.onDelivered('INFO', m1, n(5), 3, 9);
    expect(m.view().medianHops).toBe(2);
    expect(m.view().medianLatency).toBe(2);
    // repeats of an already-reached (msg, node) pair do not move the histograms
    for (let i = 0; i < 10; i++) m.onDelivered('INFO', m1, n(5), 3, 9);
    expect(m.view().medianHops).toBe(2);
    expect(m.view().byClass.INFO.delivered).toBe(14);
    expect(m.view().byClass.INFO.uniqueReached).toBe(4);
    // a new pair does
    m.onDelivered('INFO', m2, n(5), 3, 9);
    m.onDelivered('INFO', m2, n(6), 3, 9);
    expect(m.view().medianHops).toBe(2.5);
  });

  it('reflects topology and per-tick gauges', () => {
    const m = new MetricsState();
    m.setTopology({ reachableFraction: 0.75, authorityReachableFraction: 0.5, componentCount: 2 });
    m.setTick({ storedTotal: 4, transitsThisTick: 17 });
    const v = m.view();
    expect(v.reachableFraction).toBe(0.75);
    expect(v.authorityReachableFraction).toBe(0.5);
    expect(v.componentCount).toBe(2);
    expect(v.storedTotal).toBe(4);
    expect(v.transitsThisTick).toBe(17);
  });

  it('keeps the view reference until something changes', () => {
    const m = new MetricsState();
    const v0 = m.view();
    expect(m.view()).toBe(v0);
    m.setTick({ storedTotal: 0, transitsThisTick: 0 }); // same values: no change
    m.setTopology({ reachableFraction: 0, authorityReachableFraction: 0, componentCount: 0 });
    expect(m.view()).toBe(v0);
    m.setTick({ storedTotal: 1, transitsThisTick: 0 });
    const v1 = m.view();
    expect(v1).not.toBe(v0);
    expect(m.view()).toBe(v1);
    m.onOriginated('SAFETY');
    expect(m.view()).not.toBe(v1);
    // earlier views are frozen in time
    expect(v0.storedTotal).toBe(0);
    expect(v0.byClass.SAFETY.originated).toBe(0);
  });

  it('reset() returns to the empty shape and a new reference', () => {
    const m = new MetricsState();
    m.onOriginated('INFO');
    m.onDelivered('INFO', m1, n(2), 1, 1);
    m.onDropped('INFO', 'TTL_EXPIRED');
    m.setTopology({ reachableFraction: 1, authorityReachableFraction: 1, componentCount: 1 });
    const before = m.view();
    m.reset();
    expect(m.view()).not.toBe(before);
    expect(m.view()).toEqual(emptyMetrics());
    // the (msg, node) memory is cleared too
    m.onDelivered('INFO', m1, n(2), 1, 1);
    expect(m.view().byClass.INFO.uniqueReached).toBe(1);
  });
});

describe('engine-level metrics (plan A7)', () => {
  const req = (
    from: string,
    cls: MessageClass,
    extra: { readonly forge?: { readonly claimKind: CredentialKind } } = {},
  ): Command => ({
    type: 'SendRequest',
    from: nodeId(from),
    class: cls,
    payload: { kind: 'REQUEST', text: 'x' },
    ...extra,
  });
  const line = (n: number) =>
    Array.from({ length: n }, (_, i) => mobile(`m-${String(i + 1).padStart(3, '0')}`, i * 50, 0));

  it('counts deliveries per class on a line', () => {
    const e = engineFrom(line(3));
    e.dispatch(req('m-001', 'INFO'));
    e.dispatch(req('m-003', 'SAFETY'));
    e.step(4);
    const m = e.getSnapshot().metrics;
    expect(m.byClass.INFO).toEqual({ originated: 1, delivered: 2, uniqueReached: 2, dropped: 1 });
    expect(m.byClass.SAFETY).toEqual({ originated: 1, delivered: 2, uniqueReached: 2, dropped: 1 });
    expect(m.byClass.BORROW).toEqual({ originated: 0, delivered: 0, uniqueReached: 0, dropped: 0 });
    expect(m.totals).toEqual({ originated: 2, delivered: 4, dropped: 2 });
    expect(m.dropsByReason.NO_ROUTE).toBe(2);
  });

  it('median hops and latency come from the first delivery per (message, node)', () => {
    const e = engineFrom(line(4));
    e.dispatch(req('m-001', 'INFO'));
    e.step(5);
    const m = e.getSnapshot().metrics;
    expect(m.byClass.INFO.uniqueReached).toBe(3);
    expect(m.medianHops).toBe(2); // hops 1, 2, 3
    expect(m.medianLatency).toBe(3); // delivered at ticks 2, 3, 4; created at tick 0
  });

  it('dropsByReason sums to totals.dropped and to the per-class drops', () => {
    const e = engineFrom([
      mobile('m-001', 0, 0),
      mobile('m-002', 50, 0),
      mobile('m-003', 25, 40),
      mobile('m-004', -50, 0, 'none'),
    ]);
    e.dispatch(req('m-004', 'INFO', { forge: { claimKind: 'citizen' } }));
    e.dispatch(req('m-001', 'BORROW'));
    e.step(6);
    const m = e.getSnapshot().metrics;
    const byReason = DROP_REASONS.reduce((acc, r) => acc + m.dropsByReason[r], 0);
    const byClass = MESSAGE_CLASSES.reduce((acc, c) => acc + m.byClass[c].dropped, 0);
    expect(m.totals.dropped).toBeGreaterThan(2);
    expect(byReason).toBe(m.totals.dropped);
    expect(byClass).toBe(m.totals.dropped);
    expect(m.dropsByReason.UNVERIFIABLE).toBe(1);
    expect(m.dropsByReason.DUPLICATE).toBeGreaterThan(0);
    expect(m.byClass.INFO.dropped).toBe(1);
  });

  it('reachableFraction is the largest component over alive nodes with two islands', () => {
    const e = engineFrom([...line(3), mobile('m-004', 600, 0)]);
    const m = e.getSnapshot().metrics;
    expect(m.componentCount).toBe(2);
    expect(m.reachableFraction).toBe(0.75);
    e.dispatch({ type: 'SetNodePowered', nodeId: nodeId('m-003'), powered: false });
    expect(e.getSnapshot().metrics.reachableFraction).toBeCloseTo(2 / 3);
    expect(e.getSnapshot().metrics.componentCount).toBe(2);
  });

  it('authorityReachableFraction shrinks when cells go down: only the satellite island keeps it', () => {
    const e = engineFrom([
      gateway('g-01', 0, 0),
      mobile('m-001', 50, 0),
      mobile('m-002', 600, 0),
      mobile('m-003', 650, 0),
    ]);
    expect(e.getSnapshot().metrics.authorityReachableFraction).toBe(1);
    e.dispatch({ type: 'SetCellsUp', up: false });
    expect(e.getSnapshot().metrics.authorityReachableFraction).toBe(0.5);
    e.dispatch({ type: 'SetNodePowered', nodeId: nodeId('g-01'), powered: false });
    expect(e.getSnapshot().metrics.authorityReachableFraction).toBe(0);
    e.dispatch({ type: 'SetCellsUp', up: true });
    expect(e.getSnapshot().metrics.authorityReachableFraction).toBe(1);
  });
});

describe('delivery counts people: phones only', () => {
  it('routers and gateways relay an alert without counting; coverage is per audience', () => {
    // g-01 -- r-001 -- m-001 -- m-002 (unregistered) -- m-003, 40 m apart
    const e = engineFrom([
      gateway('g-01', 0, 0),
      router('r-001', 40, 0),
      mobile('m-001', 80, 0),
      mobile('m-002', 120, 0, 'none'),
      mobile('m-003', 160, 0),
    ]);
    const m0 = e.getSnapshot().metrics;
    expect([m0.phones, m0.citizenPhones]).toEqual([3, 2]);

    e.dispatch({ type: 'BroadcastAlert', text: 'boil water' });
    e.step(6);
    const delivered = eventsOf(e, 'DELIVERED').map((d) => d.nodeId);
    expect(delivered).toEqual(expect.arrayContaining(['g-01', 'r-001'])); // they still act on it
    const alert = e.getSnapshot().metrics.byClass.OFFICIAL_ALERT;
    expect(alert.uniqueReached).toBe(3); // ...but only the three phones count
    expect(deliveryAudience(e.getSnapshot().metrics, 'OFFICIAL_ALERT')).toBe(3);
    expect(deliveryCoverage(e.getSnapshot().metrics, 'OFFICIAL_ALERT')).toBe(1);

    e.dispatch({
      type: 'SendRequest',
      from: nodeId('m-001'),
      class: 'INFO',
      payload: { kind: 'REQUEST', text: 'open pharmacy?' },
    });
    e.step(6);
    const info = e.getSnapshot().metrics;
    expect(info.byClass.INFO.uniqueReached).toBe(1); // m-003; m-002 is unregistered
    expect(deliveryAudience(info, 'INFO')).toBe(2); // registered phones
    expect(deliveryCoverage(info, 'INFO')).toBe(0.5);
  });

  it('coverage is 0 without an audience or without messages', () => {
    const empty = emptyMetrics();
    expect(deliveryCoverage(empty, 'INFO')).toBe(0);
    expect(deliveryCoverage({ ...empty, phones: 10, citizenPhones: 8 }, 'CHECK_IN')).toBe(0);
  });
});
