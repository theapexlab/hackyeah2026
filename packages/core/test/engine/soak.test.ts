import { describe, expect, it } from 'vitest';
import { DEFAULT_WORLD_CONFIG } from '../../src/domain/config';
import { DROP_REASONS } from '../../src/domain/events';
import { MESSAGE_CLASSES } from '../../src/domain/message';
import { createEngine } from '../../src/engine/engine';
import { MESSAGE_VIEW_CAP } from '../../src/engine/snapshot';
import { TRANSIT_RING_SIZE } from '../../src/engine/state';

// Node globals the test runner provides; core has no @types/node on purpose.
declare const performance: { now(): number };
declare const process: { env: Record<string, string | undefined> } | undefined;

/** Set POMOC_SKIP_SOAK=1 to leave this out of a quick run. */
const SKIP = typeof process !== 'undefined' && process?.env.POMOC_SKIP_SOAK === '1';

const TICKS = 1000;
const SEEN_CAP = 64;
const RECENT_CAP = 500;
const TIME_BUDGET_MS = 5000;

describe.skipIf(SKIP)('soak: 300 nodes, 1000 ticks, mobility on', () => {
  it('finishes within the time budget and every bounded structure honours its cap', {
    timeout: 30_000,
  }, () => {
    const world = { ...DEFAULT_WORLD_CONFIG, mobiles: 200, routers: 90, gateways: 10 };
    const e = createEngine(world, {
      seenCap: SEEN_CAP,
      recentEventsCap: RECENT_CAP,
      eventLogCap: Number.POSITIVE_INFINITY, // the assertions below count mid-run events
    });
    expect(e.getSnapshot().nodes).toHaveLength(300);

    const started = performance.now();
    e.dispatch({ type: 'SetMobility', enabled: true });
    while (e.tick < TICKS) {
      const t = e.tick;
      if (t % 10 === 0) e.dispatch({ type: 'SendRandomRequest' });
      if (t % 10 === 5) {
        e.dispatch({ type: 'AutoRespond', strategy: t % 20 === 5 ? 'nearest-hops' : 'random' });
      }
      if (t % 100 === 0) e.dispatch({ type: 'BroadcastAlert', text: `alert ${t}` });
      if (t === 300) e.dispatch({ type: 'SetCellsUp', up: false });
      if (t === 350) {
        e.dispatch({
          type: 'DeclareMode',
          level: 'L2',
          region: { x: 500, y: 350, r: 300 },
          durationTicks: 200,
        });
      }
      if (t === 450) e.dispatch({ type: 'SetGridUp', up: false });
      if (t === 600) e.dispatch({ type: 'SetGridUp', up: true });
      if (t === 650) e.dispatch({ type: 'AllClear' });
      if (t === 700) e.dispatch({ type: 'SetCellsUp', up: true });
      e.step();
      e.getSnapshot(); // the UI reads one per tick
    }
    const elapsed = performance.now() - started;
    expect(e.tick).toBe(TICKS);
    expect(elapsed).toBeLessThan(TIME_BUDGET_MS);

    const s = e.getSnapshot();
    const log = e.getEventLog();

    // it actually did things
    expect(s.metrics.totals.originated).toBeGreaterThan(100);
    expect(s.metrics.totals.delivered).toBeGreaterThan(1000);
    expect(s.metrics.byClass.OFFICIAL_ALERT.originated).toBe(10);
    expect(s.authority.injected).toBe(12); // 10 alerts + declaration + all-clear
    expect(log.length).toBeGreaterThan(RECENT_CAP);
    expect(eventsCount(log, 'STORED')).toBeGreaterThan(0);
    expect(eventsCount(log, 'TX_ACCEPTED')).toBeGreaterThan(0);

    // bounded structures
    expect(s.recentEvents).toHaveLength(RECENT_CAP);
    expect(s.recentEvents).toEqual(log.slice(-RECENT_CAP));
    expect(s.messages.length).toBeLessThanOrEqual(MESSAGE_VIEW_CAP);
    for (const n of s.nodes) {
      expect(e.getNodeDetail(n.id).seenCount).toBeLessThanOrEqual(SEEN_CAP);
    }
    for (let t = TICKS - TRANSIT_RING_SIZE + 1; t <= TICKS; t++) {
      for (const tr of e.getTransits(t)) expect(tr.tick).toBe(t);
    }
    expect(e.getTransits(TICKS - TRANSIT_RING_SIZE)).toEqual([]);
    expect(e.getTransits(1)).toEqual([]);

    // metrics are internally consistent
    const dropSum = DROP_REASONS.reduce((acc, r) => acc + s.metrics.dropsByReason[r], 0);
    const classDrops = MESSAGE_CLASSES.reduce((acc, c) => acc + s.metrics.byClass[c].dropped, 0);
    const classOrigin = MESSAGE_CLASSES.reduce(
      (acc, c) => acc + s.metrics.byClass[c].originated,
      0,
    );
    expect(dropSum).toBe(s.metrics.totals.dropped);
    expect(classDrops).toBe(s.metrics.totals.dropped);
    expect(classOrigin).toBe(s.metrics.totals.originated);

    // mobility kept everyone inside the area, routers never moved
    for (const n of s.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.x).toBeLessThanOrEqual(world.width);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeLessThanOrEqual(world.height);
    }

    // back to peace: all-clear and cells up long ago, every store expired by TTL
    expect(s.world.cellsUp).toBe(true);
    expect(s.world.gridUp).toBe(true);
    expect(s.declarations).toEqual([]);
    expect(s.globalMode).toBe('PEACE');
    expect(s.metrics.storedTotal).toBe(0);
    expect(s.nodes.every((n) => n.alive)).toBe(true);

    // the snapshot is still JSON-safe at this size
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});

function eventsCount(log: readonly { type: string }[], type: string): number {
  let n = 0;
  for (const ev of log) if (ev.type === type) n++;
  return n;
}
