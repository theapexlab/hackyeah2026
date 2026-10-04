import { describe, expect, it } from 'vitest';
import type { Command } from '../../src/domain/commands';
import { DEFAULT_ENGINE_CONFIG } from '../../src/domain/config';
import { messageId, nodeId } from '../../src/domain/ids';
import { createEngine, SimEngine } from '../../src/engine/engine';
import { engineFrom, eventsOf, lastMessageId, mobile, router } from '../helpers';

const id = nodeId;
const req = (from: string): Command => ({
  type: 'SendRequest',
  from: id(from),
  class: 'BORROW',
  payload: { kind: 'REQUEST', text: 'ladder' },
});
const aliveIds = (e: SimEngine) =>
  e
    .getSnapshot()
    .nodes.filter((n) => n.alive)
    .map((n) => n.id);

describe('world commands', () => {
  it('ResetWorld rebuilds from the new seed, keeps tick, config, seq and command log, clears the rest', () => {
    const e = createEngine({ seed: 42 }, { localModeAfterTicks: 3 });
    e.dispatch({ type: 'SendRandomRequest' });
    e.step(20);
    const nodesBefore = e.getSnapshot().nodes.map((n) => [n.x, n.y]);
    e.dispatch({ type: 'SetCellsUp', up: false });
    e.dispatch({ type: 'ResetWorld', world: { ...e.world, seed: 7 } });
    const s = e.getSnapshot();
    expect(s.tick).toBe(20);
    expect(s.world.seed).toBe(7);
    expect(s.world.cellsUp).toBe(true);
    expect(e.world.seed).toBe(7);
    expect(e.initialWorld.seed).toBe(42);
    expect(e.config.localModeAfterTicks).toBe(3);
    expect(s.nodes.map((n) => [n.x, n.y])).not.toEqual(nodesBefore);
    expect(s.nodes.every((n) => n.mode === 'PEACE' && n.alive)).toBe(true);
    expect(s.messages).toEqual([]);
    expect(s.transactions).toEqual([]);
    expect(s.declarations).toEqual([]);
    expect(s.authority).toEqual({ received: [], injected: 0 });
    expect(s.metrics.totals).toEqual({ originated: 0, delivered: 0, dropped: 0 });
    expect(s.metrics.componentCount).toBeGreaterThan(0);
    expect(s.transits).toEqual([]);
    expect(e.getEventLog().map((ev) => ev.type)).toEqual(['ADJACENCY', 'COMMAND']);
    expect(e.getCommandLog().map((c) => c.command.type)).toEqual([
      'SendRandomRequest',
      'SetCellsUp',
      'ResetWorld',
    ]);
    expect(e.getTransits(20)).toEqual([]);
    // message seq continues across the reset
    e.dispatch({ type: 'SendRandomRequest' });
    expect(e.getSnapshot().messages[0]!.seq).toBe(2);
  });

  it('SetParticipation powers off a deterministic subset of mobiles and never clobbers poweredOverride', () => {
    const build = () =>
      engineFrom(
        [
          mobile('m-001', 0, 0),
          mobile('m-002', 50, 0),
          mobile('m-003', 100, 0),
          mobile('m-004', 150, 0),
          router('r-001', 200, 0),
        ],
        {},
        { seed: 5 },
      );
    const e = build();
    e.dispatch({ type: 'SetParticipation', fraction: 0.5 });
    const alive = aliveIds(e);
    expect(alive).toHaveLength(3);
    expect(alive).toContain('r-001');
    const other = build();
    other.dispatch({ type: 'SetParticipation', fraction: 0.5 });
    expect(aliveIds(other)).toEqual(alive);
    expect(eventsOf(e, 'ADJACENCY').length).toBeGreaterThanOrEqual(2);

    const off = e.getSnapshot().nodes.find((n) => !n.alive)!.id;
    e.dispatch({ type: 'SetNodePowered', nodeId: off, powered: true });
    expect(aliveIds(e)).toContain(off);
    e.dispatch({ type: 'SetParticipation', fraction: 0 });
    expect(aliveIds(e)).toEqual([off, 'r-001']); // the override wins
    e.dispatch({ type: 'SetNodePowered', nodeId: off, powered: null });
    expect(aliveIds(e)).toEqual(['r-001']);
    e.dispatch({ type: 'SetParticipation', fraction: 1 });
    expect(aliveIds(e)).toHaveLength(5);
    e.dispatch({ type: 'SetParticipation', fraction: 7 }); // clamped
    expect(aliveIds(e)).toHaveLength(5);
  });

  it('SetRange changes ranges per kind, per node or everywhere and rebuilds adjacency eagerly', () => {
    const e = engineFrom([mobile('m-001', 0, 0), mobile('m-002', 100, 0), router('r-001', 200, 0)]);
    expect(e.getSnapshot().edges).toEqual([]);
    e.dispatch({ type: 'SetRange', kind: 'mobile', range: 100 });
    const s1 = e.getSnapshot();
    expect(s1.nodes.map((n) => n.range)).toEqual([100, 100, 120]);
    expect(s1.edges).toEqual([
      { a: 'm-001', b: 'm-002', quality: 'far' },
      { a: 'm-002', b: 'r-001', quality: 'far' },
    ]);
    expect(s1.metrics.componentCount).toBe(1);
    e.dispatch({ type: 'SetRange', nodeId: id('m-001'), range: 10 });
    expect(e.getSnapshot().edges).toEqual([{ a: 'm-002', b: 'r-001', quality: 'far' }]);
    e.dispatch({ type: 'SetRange', range: 300 });
    expect(e.getSnapshot().edges).toHaveLength(3);
    e.dispatch({ type: 'SetRange', range: -5 }); // clamped to 0
    expect(e.getSnapshot().nodes.every((n) => n.range === 0)).toBe(true);
    expect(e.getSnapshot().edges).toEqual([]);
  });

  it('SetConfig patches knobs at runtime and SetMobility merges over the current step', () => {
    const e = engineFrom([mobile('m-001', 0, 0)]);
    e.dispatch({ type: 'SetConfig', patch: { localModeAfterTicks: 2, seenCap: 5 } });
    expect(e.config).toMatchObject({ localModeAfterTicks: 2, seenCap: 5, wanStableTicks: 8 });
    e.dispatch({ type: 'SetCellsUp', up: false });
    e.step();
    expect(e.getSnapshot().nodes[0]!.mode).toBe('PEACE');
    e.step();
    expect(e.getSnapshot().nodes[0]!.mode).toBe('L1');
    e.dispatch({ type: 'SetMobility', enabled: true, speedKmh: { car: [30, 40] } });
    const { shares, speedKmh } = DEFAULT_ENGINE_CONFIG.mobility;
    expect(e.config.mobility).toEqual({
      enabled: true,
      shares,
      speedKmh: { ...speedKmh, car: [30, 40] },
    });
    e.dispatch({ type: 'SetMobility', enabled: false, shares: { foot: 0.3 } });
    expect(e.config.mobility).toEqual({
      enabled: false,
      shares: { ...shares, foot: 0.3 },
      speedKmh: { ...speedKmh, car: [30, 40] },
    });
    e.dispatch({ type: 'SetConfig', patch: { tickSeconds: 1, mobility: { shares: { bike: 0 } } } });
    expect(e.config.tickSeconds).toBe(1);
    expect(e.config.mobility.shares).toEqual({ ...shares, foot: 0.3, bike: 0 });
    expect(e.getSnapshot().world.mobility).toBe(false);
  });

  it('SetMobility sets walkers, cyclists and drivers moving inside the area, logging adjacency changes', () => {
    const e = createEngine(
      // enough phones that someone is always free to take a place while others linger
      { seed: 7, width: 600, height: 400, mobiles: 80, routers: 2, gateways: 0 },
      {
        tickSeconds: 1,
        mobility: { enabled: false, shares: { foot: 0.125, bike: 0.0625, car: 0.125 } },
      },
    );
    const pos = () => new Map(e.getSnapshot().nodes.map((n) => [n.id, [n.x, n.y]] as const));
    const travelling = () => {
      const nodes = e.getSnapshot().nodes;
      return (['foot', 'bike', 'car'] as const).map(
        (m) => nodes.filter((n) => n.travel === m).length,
      );
    };
    const before = pos();
    expect(travelling()).toEqual([10, 5, 10]); // round(share * 80)
    e.step(5);
    expect(pos()).toEqual(before);
    expect(eventsOf(e, 'ADJACENCY')).toHaveLength(1);
    e.dispatch({ type: 'SetMobility', enabled: true });
    for (let i = 0; i < 40; i++) {
      e.step();
      expect(travelling()).toEqual([10, 5, 10]);
    }
    const after = e.getSnapshot().nodes;
    const moved = after.filter((n) => {
      const [x, y] = before.get(n.id)!;
      return n.x !== x || n.y !== y;
    });
    expect(moved.every((n) => n.kind === 'mobile')).toBe(true);
    expect(moved.length).toBeGreaterThanOrEqual(20);
    for (const n of after) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.x).toBeLessThanOrEqual(600);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeLessThanOrEqual(400);
    }
    expect(eventsOf(e, 'ADJACENCY').length).toBeGreaterThan(1);
    e.dispatch({ type: 'SetMobility', enabled: false });
    const frozen = pos();
    e.step(5);
    expect(pos()).toEqual(frozen);
  });

  it('MoveNode clamps to the area and takes effect in the same snapshot', () => {
    const e = engineFrom([mobile('m-001', 0, 0), mobile('m-002', 500, 0)]);
    e.dispatch({ type: 'MoveNode', nodeId: id('m-002'), x: -40, y: 900 });
    expect(e.getSnapshot().nodes.find((n) => n.id === 'm-002')).toMatchObject({ x: 0, y: 700 });
    e.dispatch({ type: 'MoveNode', nodeId: id('m-002'), x: 30, y: 40 });
    expect(e.getSnapshot().edges).toEqual([{ a: 'm-001', b: 'm-002', quality: 'far' }]);
    expect(e.getSnapshot().metrics.componentCount).toBe(1);
  });

  it('commands naming an unknown node are no-ops apart from the COMMAND event', () => {
    const e = engineFrom([mobile('m-001', 0, 0)]);
    const ghost = id('m-999');
    const commands: Command[] = [
      { type: 'SetNodePowered', nodeId: ghost, powered: false },
      { type: 'MoveNode', nodeId: ghost, x: 1, y: 1 },
      { type: 'SetRange', nodeId: ghost, range: 5 },
      { type: 'SendRequest', from: ghost, class: 'INFO', payload: { kind: 'REQUEST', text: 'x' } },
      { type: 'SendCheckIn', from: ghost, status: 'OK' },
      { type: 'SendRandomRequest', from: ghost },
      { type: 'Accept', nodeId: ghost, requestId: messageId('m-001#1') },
      { type: 'Close', requestId: messageId('m-001#1') },
    ];
    for (const c of commands) e.dispatch(c);
    expect(
      e.getEventLog().filter((ev) => ev.type !== 'COMMAND' && ev.type !== 'ADJACENCY'),
    ).toEqual([]);
    expect(eventsOf(e, 'COMMAND').map((ev) => ev.command)).toEqual(commands);
    expect(e.getSnapshot().messages).toEqual([]);
    expect(e.getCommandLog()).toHaveLength(commands.length);
    e.step(2);
    expect(e.getSnapshot().metrics.totals).toEqual({ originated: 0, delivered: 0, dropped: 0 });
  });

  it('Accept at an ineligible node and Close of an unknown or closed request are no-ops', () => {
    const e = engineFrom([mobile('m-001', 0, 0), mobile('m-002', 50, 0), router('r-001', 100, 0)]);
    e.dispatch(req('m-001'));
    const requestId = lastMessageId(e);
    e.step(); // m-002 has the packet in its inbox but has not delivered it yet
    expect(e.getNodeDetail(id('m-002')).requests).toEqual([]);
    e.dispatch({ type: 'Accept', nodeId: id('m-002'), requestId });
    expect(e.getSnapshot().messages).toHaveLength(1);
    e.step();
    e.dispatch({ type: 'SetNodePowered', nodeId: id('m-002'), powered: false });
    e.dispatch({ type: 'Accept', nodeId: id('m-002'), requestId }); // dead
    expect(e.getSnapshot().messages).toHaveLength(1);
    e.dispatch({ type: 'SetNodePowered', nodeId: id('m-002'), powered: null });
    e.dispatch({ type: 'Accept', nodeId: id('r-001'), requestId }); // relay
    expect(e.getSnapshot().messages).toHaveLength(1);
    e.dispatch({ type: 'Accept', nodeId: id('m-002'), requestId });
    expect(e.getSnapshot().messages).toHaveLength(2);
    e.dispatch({ type: 'Accept', nodeId: id('m-002'), requestId }); // already accepted-by-me
    expect(e.getSnapshot().messages).toHaveLength(2);
    e.dispatch({ type: 'Close', requestId: messageId('nope#1') });
    expect(eventsOf(e, 'TX_CLOSED')).toEqual([]);
    e.dispatch({ type: 'Close', requestId });
    e.dispatch({ type: 'Close', requestId });
    expect(eventsOf(e, 'TX_CLOSED')).toHaveLength(1);
    expect(e.getSnapshot().messages).toHaveLength(3);
  });

  it('keeps its own copy of a command: mutating the caller object afterwards changes nothing', () => {
    const e = engineFrom([mobile('m-001', 0, 0)]);
    const region = { x: 100, y: 100, r: 50 };
    const original = { x: 100, y: 100, r: 50 };
    const cmd: Command = { type: 'DeclareMode', level: 'L2', region };
    e.dispatch(cmd);
    region.x = 999;
    region.r = 1;
    expect(e.getSnapshot().declarations[0]!.region).toEqual(original);
    expect(e.getSnapshot().messages[0]!.region).toEqual(original);
    expect(e.getCommandLog()[0]!.command).toEqual({
      type: 'DeclareMode',
      level: 'L2',
      region: original,
    });
    expect(e.getCommandLog()[0]!.command).not.toBe(cmd);
    expect(eventsOf(e, 'COMMAND')[0]!.command).toEqual({
      type: 'DeclareMode',
      level: 'L2',
      region: original,
    });

    const payload = { kind: 'REQUEST' as const, text: 'ladder', price: 0 };
    e.dispatch({ type: 'SendRequest', from: id('m-001'), class: 'BORROW', payload });
    payload.text = 'changed';
    payload.price = 99;
    expect(e.getSnapshot().messages[1]!.payload).toEqual({
      kind: 'REQUEST',
      text: 'ladder',
      price: 0,
    });
    // primitives survive the copy, Infinity included
    e.dispatch({ type: 'SetConfig', patch: { eventLogCap: Number.POSITIVE_INFINITY } });
    expect(e.config.eventLogCap).toBe(Number.POSITIVE_INFINITY);
    expect(e.getCommandLog().at(-1)!.command).toEqual({
      type: 'SetConfig',
      patch: { eventLogCap: Number.POSITIVE_INFINITY },
    });
  });

  it('replay honours the construction config through initialConfig', () => {
    const live = createEngine({ seed: 42 }, { localModeAfterTicks: 2 });
    live.dispatch({ type: 'SetCellsUp', up: false });
    live.step(4);
    expect(live.getSnapshot().globalMode).toBe('L1');
    const replayed = SimEngine.replay(
      live.initialWorld,
      live.getCommandLog(),
      4,
      live.initialConfig,
    );
    expect(replayed.getEventLog()).toEqual(live.getEventLog());
    expect(replayed.getSnapshot()).toEqual(live.getSnapshot());
    const withDefaults = SimEngine.replay(live.initialWorld, live.getCommandLog(), 4);
    expect(withDefaults.getSnapshot().globalMode).toBe('PEACE');
  });
});

describe('authority commands', () => {
  it('a forged declaration is injected, dropped UNVERIFIABLE, changes no mode and is not listed', () => {
    const e = engineFrom([mobile('m-001', 0, 0), mobile('m-002', 50, 0)]);
    e.dispatch({ type: 'DeclareMode', level: 'L3', forged: true });
    expect(e.getSnapshot().declarations).toEqual([]);
    expect(eventsOf(e, 'AUTHORITY_INJECTED')).toMatchObject([{ count: 2 }]);
    expect(e.getSnapshot().authority.injected).toBe(1);
    e.step(4);
    expect(eventsOf(e, 'DROPPED').map((d) => `${d.nodeId}:${d.reason}`)).toEqual([
      'm-001:UNVERIFIABLE',
      'm-002:UNVERIFIABLE',
    ]);
    expect(e.getSnapshot().nodes.every((n) => n.mode === 'PEACE')).toBe(true);
    expect(eventsOf(e, 'MODE_CHANGED')).toEqual([]);
    expect(e.getSnapshot().messages[0]!.signer).toEqual({
      nodeId: 'authority',
      credentialKind: 'authority',
      valid: false,
    });
  });

  it('declarations take the duration as ttl and untilTick; a regional AllClear retires only the regional listings it covers', () => {
    const e = engineFrom([mobile('m-001', 0, 0)]);
    e.step(10);
    e.dispatch({ type: 'DeclareMode', level: 'L2', durationTicks: 40 }); // city-wide
    e.dispatch({
      type: 'DeclareMode',
      level: 'L1',
      region: { x: 100, y: 100, r: 50 }, // centre inside the all-clear circle below
      durationTicks: 40,
    });
    e.dispatch({
      type: 'DeclareMode',
      level: 'L3',
      region: { x: 900, y: 600, r: 50 }, // outside
      durationTicks: 40,
    });
    expect(
      e.getSnapshot().declarations.map((d) => `${d.level}@${d.fromTick}-${d.untilTick}`),
    ).toEqual(['L2@10-50', 'L1@10-50', 'L3@10-50']);
    const decl = e.getSnapshot().messages[0]!;
    expect(decl.ttlTicks).toBe(40);
    expect(decl.payload).toEqual({ kind: 'MODE_DECLARATION', level: 'L2', untilTick: 50 });
    expect(decl.region).toBeNull();
    expect(e.getSnapshot().messages[1]!.region).toEqual({ x: 100, y: 100, r: 50 });

    // the city-wide L2 survives a regional all-clear: nodes outside the circle stay declared
    e.dispatch({ type: 'AllClear', region: { x: 100, y: 100, r: 200 } });
    expect(e.getSnapshot().declarations.map((d) => d.level)).toEqual(['L2', 'L3']);
    e.dispatch({ type: 'AllClear' });
    expect(e.getSnapshot().declarations).toEqual([]);

    e.dispatch({ type: 'DeclareMode', level: 'L1', durationTicks: 5 });
    expect(e.getSnapshot().declarations).toHaveLength(1);
    e.dispatch({ type: 'AllClear', forged: true }); // a forgery changes nothing
    expect(e.getSnapshot().declarations).toHaveLength(1);
    e.step(4); // tick 14 < untilTick 15
    expect(e.getSnapshot().declarations).toHaveLength(1);
    e.step(); // tick 15: expired and pruned
    expect(e.getSnapshot().declarations).toEqual([]);
  });
});
