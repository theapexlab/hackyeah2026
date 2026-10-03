import { describe, expect, it } from 'vitest';
import type { MessageId } from '../../src/domain/ids';
import { createMetrics, histogramMedian, recordDelivery } from '../../src/metrics/metrics';
import { eventsOf, g, lineWorld, m, r, stepCollect, twoIslandsWorld } from '../helpers';

describe('Metrics', () => {
  it('delivery counts per class on a line', () => {
    const e = lineWorld(4, 100);
    e.dispatch({ type: 'SEND_REQUEST', from: m(0), class: 'INFO', text: 'x' });
    e.dispatch({ type: 'SEND_REQUEST', from: m(0), class: 'SAFETY', text: 'x' });
    e.step(8);
    const { byClass, deliveriesByClass } = e.getSnapshot().metrics;
    expect(byClass.INFO).toEqual({ originated: 1, deliveries: 3, uniqueReached: 1, dropped: 1 });
    expect(byClass.SAFETY).toMatchObject({ originated: 1, deliveries: 3, uniqueReached: 1 });
    expect(deliveriesByClass.INFO).toBe(3);
    expect(deliveriesByClass.LIFE_CRITICAL).toBe(0);
    expect(byClass.LIFE_CRITICAL).toEqual({
      originated: 0,
      deliveries: 0,
      uniqueReached: 0,
      dropped: 0,
    });
  });

  it('uniqueReached counts messages, deliveries count (message, node) pairs', () => {
    const e = lineWorld(4, 100);
    for (let i = 0; i < 3; i++)
      e.dispatch({ type: 'SEND_REQUEST', from: m(0), class: 'INFO', text: 'x' });
    e.step(8);
    expect(e.getSnapshot().metrics.byClass.INFO).toMatchObject({
      originated: 3,
      deliveries: 9,
      uniqueReached: 3,
    });
  });

  it('median hops comes from the delivery histogram (even and odd counts)', () => {
    const e = lineWorld(5, 100);
    e.dispatch({ type: 'SET_CELLS_UP', up: false });
    e.step(5); // L1: hop limit 10
    e.dispatch({ type: 'SEND_REQUEST', from: m(0), class: 'INFO', text: 'x' });
    e.step(8);
    // deliveries at hops 1,2,3,4
    expect(e.getSnapshot().metrics.medianHops).toBe(2.5);
    // latency from creation (tick 5) to delivery (ticks 7,8,9,10) = 2,3,4,5
    expect(e.getSnapshot().metrics.medianLatency).toBe(3.5);

    const odd = lineWorld(4, 100);
    odd.dispatch({ type: 'SEND_REQUEST', from: m(0), class: 'INFO', text: 'x' });
    odd.step(8);
    expect(odd.getSnapshot().metrics.medianHops).toBe(2);
    expect(odd.getSnapshot().metrics.medianLatency).toBe(3);
  });

  it('histogramMedian handles empty, single and weighted histograms', () => {
    expect(histogramMedian(new Map())).toBe(0);
    expect(histogramMedian(new Map([[4, 1]]))).toBe(4);
    expect(
      histogramMedian(
        new Map([
          [1, 5],
          [9, 1],
        ]),
      ),
    ).toBe(1);
    expect(
      histogramMedian(
        new Map([
          [1, 1],
          [3, 1],
        ]),
      ),
    ).toBe(2);
    expect(
      histogramMedian(
        new Map([
          [1, 2],
          [2, 2],
          [10, 1],
        ]),
      ),
    ).toBe(2);
  });

  it('recordDelivery feeds both histograms', () => {
    const mc = createMetrics();
    recordDelivery(mc, 'a#1' as MessageId, 'INFO', 2, 5);
    recordDelivery(mc, 'a#1' as MessageId, 'INFO', 3, 6);
    expect(mc.hopHistogram.get(2)).toBe(1);
    expect(mc.latencyHistogram.get(6)).toBe(1);
    expect(mc.byClass.get('INFO')).toMatchObject({ deliveries: 2, uniqueReached: 1 });
  });

  it('dropsByReason sums to the number of DROPPED events, and matches per-class totals', () => {
    const e = twoIslandsWorld();
    e.dispatch({
      type: 'SEND_REQUEST',
      from: m(0),
      class: 'LEND',
      text: 'x',
      forge: { claimKind: 'citizen' },
    });
    e.dispatch({ type: 'SEND_REQUEST', from: m(3), class: 'INFO', text: 'x' });
    e.dispatch({ type: 'SEND_REQUEST', from: r(0), class: 'BORROW', text: 'x' });
    e.step(10);
    const { dropsByReason, byClass } = e.getSnapshot().metrics;
    const dropped = eventsOf(e, 'DROPPED');
    expect(dropped.length).toBeGreaterThan(3);
    expect(Object.values(dropsByReason).reduce((a, b) => a + b, 0)).toBe(dropped.length);
    expect(Object.values(byClass).reduce((a, c) => a + c.dropped, 0)).toBe(dropped.length);
    for (const reason of new Set(dropped.map((d) => d.reason))) {
      expect(dropsByReason[reason]).toBe(dropped.filter((d) => d.reason === reason).length);
    }
    expect(Object.keys(dropsByReason)).toEqual([...Object.keys(dropsByReason)].sort());
    expect(dropsByReason.UNVERIFIABLE).toBeGreaterThan(0);
    expect(dropsByReason.RELAY_CANNOT_ACT).toBeGreaterThan(0);
  });

  it('reachableFraction with two islands = largest component / alive', () => {
    const e = twoIslandsWorld();
    expect(e.getSnapshot().metrics.reachableFraction).toBe(0.5);
    e.dispatch({ type: 'SET_NODE_POWERED', nodeId: m(5), powered: false });
    expect(e.getSnapshot().metrics.reachableFraction).toBe(4 / 7);
  });

  it('authorityReachableFraction shrinks when cells go down', () => {
    const e = twoIslandsWorld();
    expect(e.getSnapshot().metrics.authorityReachableFraction).toBe(1);
    e.dispatch({ type: 'SET_CELLS_UP', up: false });
    expect(e.getSnapshot().metrics.authorityReachableFraction).toBe(0.5);
    e.dispatch({ type: 'SET_NODE_POWERED', nodeId: g(0), powered: false });
    expect(e.getSnapshot().metrics.authorityReachableFraction).toBe(0);
  });

  it('fractions are 0, not NaN, when nothing is alive', () => {
    const e = lineWorld(2);
    e.dispatch({ type: 'SET_NODE_POWERED', nodeId: m(0), powered: false });
    e.dispatch({ type: 'SET_NODE_POWERED', nodeId: m(1), powered: false });
    const mt = e.getSnapshot().metrics;
    expect([mt.reachableFraction, mt.authorityReachableFraction, mt.componentCount]).toEqual([
      0, 0, 0,
    ]);
  });

  it('storedTotal and transitsThisTick track the engine', () => {
    const e = lineWorld(3, 100);
    e.dispatch({ type: 'SET_CELLS_UP', up: false });
    e.step(5);
    e.dispatch({ type: 'SEND_REQUEST', from: m(0), class: 'INFO', text: 'x' });
    const t = stepCollect(e, 1);
    expect(e.getSnapshot().metrics.transitsThisTick).toBe(t.length);
    e.step(3);
    expect(e.getSnapshot().metrics.storedTotal).toBe(1); // dead end m2 holds the copy
  });
});
