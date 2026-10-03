/**
 * Stage-demo behaviours at engine level, on seeded generated worlds (no hand-placed nodes).
 *
 * DEMO_WORLD mirrors the apps/sim default preset (100 phones, 30 routers, ranges 100/160/200):
 * core's DEFAULT_WORLD_CONFIG (40 phones, ranges 60/120/150) generates ~40 islands at seed 42,
 * which is asserted separately so the difference stays visible.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_WORLD_CONFIG, type WorldConfig } from '../../src/domain/config';
import type { NodeId } from '../../src/domain/ids';
import type { Mode } from '../../src/domain/mode';
import { createEngine, SimEngine } from '../../src/engine/engine';
import { delivered, eventsOf } from '../helpers';

const DEMO_WORLD: WorldConfig = {
  ...DEFAULT_WORLD_CONFIG,
  seed: 42,
  mobiles: 100,
  routers: 30,
  range: { mobile: 100, router: 160, gateway: 200 },
};

const modes = (e: SimEngine) => e.getSnapshot().nodes.map((n) => n.mode);

describe('default world (seed 42)', () => {
  it('has the documented shape: 40 phones, 25 routers, 2 gateways', () => {
    const snap = createEngine(DEFAULT_WORLD_CONFIG).getSnapshot();
    expect(snap.nodes).toHaveLength(67);
    expect(snap.nodes.filter((n) => n.kind === 'mobile')).toHaveLength(40);
    expect(snap.nodes.filter((n) => n.kind === 'router')).toHaveLength(25);
    expect(snap.nodes.filter((n) => n.kind === 'gateway')).toHaveLength(2);
    // sparse by design of the stock ranges: documented limitation, the UI uses a denser preset
    expect(snap.metrics.reachableFraction).toBeLessThan(0.3);
  });

  it('grid off: non-battery routers go dark, battery-backed ones and gateways stay up', () => {
    const e = createEngine(DEFAULT_WORLD_CONFIG);
    e.dispatch({ type: 'SET_GRID_UP', up: false });
    const snap = e.getSnapshot();
    const routers = snap.nodes.filter((n) => n.kind === 'router');
    const backed = routers.filter((n) => e.getNodeDetail(n.id).batteryBacked);
    expect(backed.length).toBeGreaterThan(0);
    expect(backed.length).toBeLessThan(routers.length);
    for (const router of routers) {
      expect(router.alive).toBe(e.getNodeDetail(router.id).batteryBacked);
      if (!router.alive) expect(router.neighbourCount).toBe(0);
    }
    expect(snap.nodes.filter((n) => n.kind !== 'router').every((n) => n.alive)).toBe(true);
  });

  it('cells down: every node is L1 after exactly 5 ticks (not before)', () => {
    const e = createEngine(DEFAULT_WORLD_CONFIG);
    e.dispatch({ type: 'SET_CELLS_UP', up: false });
    e.step(4);
    expect(new Set(modes(e))).toEqual(new Set(['PEACE']));
    e.step(1);
    expect(new Set(modes(e))).toEqual(new Set(['L1']));
    expect(e.getSnapshot().nodes.every((n) => n.modeSource === 'local')).toBe(true);
  });
});

describe('demo world (seed 42)', () => {
  it('peace: one connected mesh; grid off: routers dark and the component count rises', () => {
    const e = createEngine(DEMO_WORLD);
    const before = e.getSnapshot();
    expect(before.metrics.reachableFraction).toBeGreaterThan(0.95);
    expect(before.metrics.componentCount).toBe(1);

    e.dispatch({ type: 'SET_GRID_UP', up: false });
    const after = e.getSnapshot();
    expect(after.metrics.componentCount).toBeGreaterThan(before.metrics.componentCount);
    expect(after.metrics.reachableFraction).toBeLessThan(before.metrics.reachableFraction);
    const dark = after.nodes.filter((n) => n.kind === 'router' && !n.alive);
    expect(dark.length).toBeGreaterThan(0);
    expect(dark.every((n) => !e.getNodeDetail(n.id).batteryBacked)).toBe(true);
    expect(after.edges.length).toBeLessThan(before.edges.length);

    e.dispatch({ type: 'SET_GRID_UP', up: true });
    expect(e.getSnapshot().metrics.componentCount).toBe(1);
  });

  it('cells down: all nodes L1 after N=5 ticks; grid down on top does not stop live nodes', () => {
    const e = createEngine(DEMO_WORLD);
    e.dispatch({ type: 'SET_CELLS_UP', up: false });
    e.step(5);
    expect(new Set(modes(e))).toEqual(new Set(['L1']));
    e.dispatch({ type: 'SET_GRID_UP', up: false });
    e.step(5);
    const snap = e.getSnapshot();
    expect(new Set(snap.nodes.filter((n) => n.alive).map((n) => n.mode))).toEqual(new Set(['L1']));
  });

  it('BroadcastAlert with cells down is injected at satellite gateways and reaches only their components', () => {
    const e = createEngine(DEMO_WORLD);
    e.dispatch({ type: 'SET_CELLS_UP', up: false });
    e.dispatch({ type: 'SET_GRID_UP', up: false });
    e.step(5);
    const snap = e.getSnapshot();
    const gateways = snap.nodes.filter((n) => n.kind === 'gateway');
    const gatewayComponents = new Set(gateways.map((n) => n.componentId));
    const covered = snap.nodes.filter((n) => n.alive && gatewayComponents.has(n.componentId));
    const uncovered = snap.nodes.filter((n) => n.alive && !gatewayComponents.has(n.componentId));
    expect(snap.nodes.filter((n) => n.hasBackhaul).map((n) => n.id)).toEqual(
      gateways.map((n) => n.id),
    );
    expect(uncovered.length).toBeGreaterThan(0); // the test would be vacuous otherwise

    e.dispatch({ type: 'BROADCAST_ALERT', text: 'storm' });
    e.step(60);
    const alertId = eventsOf(e, 'ORIGINATED').find((o) => o.class === 'OFFICIAL_ALERT')!.msgId;
    expect(eventsOf(e, 'AUTHORITY_INJECTED').map((x) => x.to)).toEqual(gateways.map((n) => n.id));
    const reached = new Set(delivered(e, alertId).map((d) => d.to));
    expect([...reached].sort()).toEqual(covered.map((n) => n.id).sort());
    expect(uncovered.every((n) => !reached.has(n.id))).toBe(true);
  });

  it('with cells up the same alert reaches every node in one tick (everyone has backhaul)', () => {
    const e = createEngine(DEMO_WORLD);
    e.dispatch({ type: 'BROADCAST_ALERT', text: 'storm' });
    e.step(3);
    const alertId = eventsOf(e, 'ORIGINATED').find((o) => o.class === 'OFFICIAL_ALERT')!.msgId;
    expect(new Set(delivered(e, alertId).map((d) => d.to)).size).toBe(132);
  });

  it('DeclareMode with two regions gives two modes at once; outside stays PEACE', () => {
    const e = createEngine(DEMO_WORLD);
    const west = { centerX: 250, centerY: 350, radiusMtres: 240 };
    const east = { centerX: 750, centerY: 350, radiusMtres: 240 };
    e.dispatch({ type: 'DECLARE_MODE', level: 'L2', region: west });
    e.dispatch({ type: 'DECLARE_MODE', level: 'L3', region: east });
    e.step(4);
    const snap = e.getSnapshot();
    const inCircle = (c: typeof west, n: { x: number; y: number }) =>
      Math.hypot(n.x - c.centerX, n.y - c.centerY) <= c.radiusMtres;
    const expected = (n: { x: number; y: number }): Mode =>
      inCircle(west, n) ? 'L2' : inCircle(east, n) ? 'L3' : 'PEACE';
    for (const n of snap.nodes) expect(n.mode, n.id).toBe(expected(n));
    expect(new Set(snap.nodes.map((n) => n.mode))).toEqual(new Set(['PEACE', 'L2', 'L3']));
    expect(snap.declarations.map((d) => d.level).sort()).toEqual(['L2', 'L3']);
    expect(snap.declarations.every((d) => d.region !== undefined)).toBe(true);
  });

  it('AllClear from L3: every node goes L3 -> L1 (hold) -> PEACE, never L3 -> PEACE', () => {
    const e = createEngine(DEMO_WORLD);
    e.dispatch({ type: 'DECLARE_MODE', level: 'L3' });
    e.step(4);
    expect(new Set(modes(e))).toEqual(new Set(['L3']));
    e.dispatch({ type: 'ALL_CLEAR' });
    e.step(3); // injected T+1, applied T+2, mode change T+3
    expect(new Set(modes(e))).toEqual(new Set(['L1']));
    e.step(5);
    expect(new Set(modes(e))).toEqual(new Set(['PEACE']));

    const byNode = new Map<NodeId, Array<{ tick: number; from: Mode; to: Mode }>>();
    for (const c of eventsOf(e, 'MODE_CHANGED')) {
      byNode.set(c.nodeId, [
        ...(byNode.get(c.nodeId) ?? []),
        { tick: c.tick, from: c.from, to: c.to },
      ]);
    }
    expect(byNode.size).toBe(132);
    for (const [id, seq] of byNode) {
      expect(
        seq.map((s) => `${s.from}>${s.to}`),
        id,
      ).toEqual(['PEACE>L3', 'L3>L1', 'L1>PEACE']);
      expect(seq[2]!.tick - seq[1]!.tick, id).toBe(5); // l3StepDownHoldTicks
    }
  });

  it('declared L2 survives WAN loss and return; expiry steps down through L1', () => {
    const e = createEngine(DEMO_WORLD, { l3StepDownHoldTicks: 3 });
    e.dispatch({ type: 'SET_CELLS_UP', up: false });
    e.step(5);
    e.dispatch({ type: 'DECLARE_MODE', level: 'L2', durationTicks: 60 });
    e.step(25); // the declaration floods hop by hop from the gateways
    expect(new Set(modes(e))).toEqual(new Set(['L2']));
    e.dispatch({ type: 'SET_CELLS_UP', up: true });
    e.step(20);
    expect(new Set(modes(e))).toEqual(new Set(['L2']));
    e.step(30); // past expiry (tick 65)
    expect(new Set(modes(e))).toEqual(new Set(['PEACE']));
    expect(
      eventsOf(e, 'MODE_CHANGED').some(
        (c) => c.from === 'L2' && c.to === 'L1' && c.source === 'stepdown',
      ),
    ).toBe(true);
  });

  it('replay equals live (scripted demo, mobility on)', () => {
    const script: Array<[number, Parameters<SimEngine['dispatch']>[0]]> = [
      [2, { type: 'SEND_RANDOM_REQUEST' }],
      [5, { type: 'AUTO_RESPOND', strategy: 'nearest-hops' }],
      [10, { type: 'SET_GRID_UP', up: false }],
      [15, { type: 'SET_CELLS_UP', up: false }],
      [30, { type: 'BROADCAST_ALERT', text: 'x' }],
      [32, { type: 'SEND_RANDOM_REQUEST' }],
      [
        40,
        {
          type: 'DECLARE_MODE',
          level: 'L3',
          region: { centerX: 500, centerY: 350, radiusMtres: 300 },
        },
      ],
      [60, { type: 'ALL_CLEAR' }],
    ];
    const live = createEngine(DEMO_WORLD, { mobility: { enabled: true, stepMetres: 4 } });
    for (let t = 0; t < 100; t++) {
      for (const [at, cmd] of script) if (at === t) live.dispatch(cmd);
      live.step(1);
    }
    const replayed = SimEngine.replay(DEMO_WORLD, live.getTimedCommandLog(), 100, {
      mobility: { enabled: true, stepMetres: 4 },
    });
    expect(JSON.stringify(replayed.getEventLog())).toBe(JSON.stringify(live.getEventLog()));
    expect(JSON.stringify(replayed.getSnapshot())).toBe(JSON.stringify(live.getSnapshot()));
  });

  it('getNodeDetail is useful on a live mesh: inbox, store, requestView and log are populated', () => {
    const e = createEngine(DEMO_WORLD);
    e.dispatch({ type: 'SET_CELLS_UP', up: false });
    e.step(5);
    e.dispatch({ type: 'SEND_RANDOM_REQUEST' });
    e.step(2);
    const snap = e.getSnapshot();
    const withInbox = snap.nodes.find((n) => n.inboxSize > 0)!;
    expect(withInbox).toBeDefined();
    const detail = e.getNodeDetail(withInbox.id);
    expect(detail.inbox).toHaveLength(withInbox.inboxSize);
    expect(detail.inbox[0]).toMatchObject({ hop: expect.any(Number), hopLimit: 10 });
    expect(detail.nodeLog.length).toBeGreaterThan(0);

    e.step(20);
    const after = e.getSnapshot();
    const withView = after.nodes.find((n) => n.openRequests > 0)!;
    expect(e.getNodeDetail(withView.id).requestView.some((v) => v.status === 'open')).toBe(true);
    const stored = after.nodes.find((n) => n.storeSize > 0);
    expect(stored).toBeDefined();
    expect(e.getNodeDetail(stored!.id).store).toHaveLength(stored!.storeSize);
  });
});
