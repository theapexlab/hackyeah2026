import { type DropReason, messageId, nodeId, type SimEvent, type TransitEvent } from '@pomoc/core';
import { describe, expect, it } from 'vitest';
import {
  arrivePulses,
  BURST_MS,
  burstsFromEvents,
  capPulses,
  easePulse,
  flightMs,
  fxMs,
  ingestTransits,
  liveBursts,
  livePulses,
  liveRipples,
  MIN_FLIGHT_MS,
  MIN_FX_MS,
  type Pulse,
  particleAge,
  pulseProgress,
  RIPPLE_MS,
  ripplesForArrivals,
  ripplesForTouches,
  tailProgress,
} from '../src/features/map/renderer/particles';

const a = nodeId('m-001');
const b = nodeId('m-002');
const c = nodeId('r-001');
const authority = nodeId('authority');

function transit(partial: Partial<TransitEvent>): TransitEvent {
  return {
    tick: 5,
    msgId: messageId('m-001#1'),
    class: 'INFO',
    from: a,
    to: b,
    hop: 1,
    via: 'hop',
    ...partial,
  };
}

describe('ingestTransits', () => {
  it('coalesces copies of the same (from, to, class) into one pulse with a count', () => {
    const result = ingestTransits(
      [
        transit({ msgId: messageId('m-001#1') }),
        transit({ msgId: messageId('m-001#2') }),
        transit({ msgId: messageId('m-001#3'), class: 'SAFETY' }),
        transit({ from: b, to: a }),
      ],
      5,
      { showTopology: false },
    );
    expect(result.pulses).toHaveLength(3);
    const info = result.pulses.find((p) => p.cls === 'INFO' && p.fromId === a);
    expect(info?.count).toBe(2);
    expect(result.pulses.every((p) => p.born === 5 && !p.arrived)).toBe(true);
  });

  it('keeps the highest-priority pulses when over the cap and reports the rest', () => {
    const transits: TransitEvent[] = [];
    for (let i = 0; i < 10; i++) {
      transits.push(transit({ class: 'INFO', to: nodeId(`m-${100 + i}`) }));
    }
    transits.push(transit({ class: 'LIFE_CRITICAL', to: c }));
    transits.push(transit({ class: 'OFFICIAL_ALERT', to: c }));
    const result = ingestTransits(transits, 1, { showTopology: false, cap: 3 });
    expect(result.pulses.map((p) => p.cls)).toEqual(['LIFE_CRITICAL', 'OFFICIAL_ALERT', 'INFO']);
    expect(result.truncated).toBe(9);
  });

  it('is deterministic inside a priority rank (insertion order)', () => {
    const transits = [
      transit({ class: 'INFO', to: nodeId('m-010') }),
      transit({ class: 'INFO', to: nodeId('m-011') }),
      transit({ class: 'INFO', to: nodeId('m-012') }),
    ];
    const result = ingestTransits(transits, 1, { showTopology: false, cap: 2 });
    expect(result.pulses.map((p) => p.toId)).toEqual(['m-010', 'm-011']);
  });

  it('hides TOPOLOGY unless asked', () => {
    const transits = [transit({ class: 'TOPOLOGY' }), transit({ class: 'INFO' })];
    expect(ingestTransits(transits, 1, { showTopology: false }).pulses).toHaveLength(1);
    expect(ingestTransits(transits, 1, { showTopology: true }).pulses).toHaveLength(2);
  });

  it('turns injections and uplinks into node touches instead of pulses', () => {
    const result = ingestTransits(
      [
        transit({ from: authority, to: c, via: 'authority-inject', class: 'OFFICIAL_ALERT' }),
        transit({ from: authority, to: c, via: 'authority-inject', class: 'OFFICIAL_ALERT' }),
        transit({ from: b, to: authority, via: 'uplink', class: 'CHECK_IN' }),
      ],
      1,
      { showTopology: false },
    );
    expect(result.pulses).toHaveLength(0);
    expect(result.injects).toEqual([{ nodeId: c, cls: 'OFFICIAL_ALERT', count: 2 }]);
    expect(result.uplinks).toEqual([{ nodeId: b, cls: 'CHECK_IN', count: 1 }]);
  });
});

describe('pulse lifecycle', () => {
  const make = (): Pulse => ({
    fromId: a,
    toId: b,
    cls: 'INFO',
    msgId: messageId('m-001#1'),
    via: 'hop',
    born: 1,
    count: 1,
    start: 1000,
    duration: 200,
    arrived: false,
  });

  it('arrives when its own flight is over, only once; a newer tick does not cut it short', () => {
    const pulses = [make(), { ...make(), start: 1100 }];
    expect(pulseProgress(pulses[0]!, 1100)).toBe(0.5);
    expect(arrivePulses(pulses, 1100)).toHaveLength(0);
    expect(arrivePulses(pulses, 1200)).toHaveLength(1);
    expect(arrivePulses(pulses, 1200)).toHaveLength(0);
    expect(livePulses(pulses)).toHaveLength(1);
    expect(arrivePulses(pulses, 1300)).toHaveLength(1);
    expect(livePulses(pulses)).toHaveLength(0);
  });

  it('flies one tick of wall time but never under MIN_FLIGHT_MS', () => {
    expect(flightMs(1000)).toBe(1000);
    expect(flightMs(200)).toBe(200);
    expect(flightMs(5)).toBe(MIN_FLIGHT_MS);
    const [pulse] = ingestTransits([transit({})], 3, {
      showTopology: false,
      start: 50,
      flightMs: 300,
    }).pulses;
    expect(pulse).toMatchObject({ born: 3, start: 50, duration: 300 });
  });

  it('ripples and bursts last two ticks, between MIN_FX_MS and their base length', () => {
    expect(fxMs(RIPPLE_MS, 1000)).toBe(RIPPLE_MS);
    expect(fxMs(RIPPLE_MS, 100)).toBe(200);
    expect(fxMs(RIPPLE_MS, 5)).toBe(MIN_FX_MS);
    expect(fxMs(100, 5)).toBe(100); // a base under the floor is kept
  });

  it('caps pulses in flight by priority, newest first inside a rank, order kept', () => {
    const info = (i: number): Pulse => ({ ...make(), toId: nodeId(`m-${100 + i}`) });
    const critical = { ...make(), cls: 'LIFE_CRITICAL' as const };
    const pulses = [info(0), critical, info(1), info(2)];
    expect(capPulses(pulses, 2).map((p) => p.toId)).toEqual([b, 'm-102']);
    expect(capPulses(pulses, 10)).toBe(pulses);
  });

  it('spawns one arrival ripple per destination node and class', () => {
    const p1 = make();
    const p2 = make();
    const p3 = { ...make(), cls: 'SAFETY' as const };
    const ripples = ripplesForArrivals([p1, p2, p3], 1000);
    expect(ripples).toHaveLength(2);
    expect(ripples[0]).toMatchObject({ nodeId: b, kind: 'arrive', duration: RIPPLE_MS });
  });

  it('ripples expire after their duration', () => {
    const ripples = ripplesForTouches(
      [{ nodeId: c, cls: 'OFFICIAL_ALERT', count: 1 }],
      'inject',
      0,
    );
    expect(liveRipples(ripples, 100)).toHaveLength(1);
    expect(liveRipples(ripples, ripples[0]!.duration)).toHaveLength(0);
  });

  it('eases smoothly and keeps ghost heads behind the head', () => {
    expect(easePulse(0)).toBe(0);
    expect(easePulse(1)).toBe(1);
    expect(easePulse(0.5)).toBeCloseTo(0.5);
    expect(easePulse(2)).toBe(1);
    const tails = tailProgress(0.1);
    expect(tails).toHaveLength(4);
    expect(tails[0]).toBeCloseTo(0.03);
    expect(tails.every((v) => v >= 0 && v <= 0.1)).toBe(true);
  });

  it('particleAge clamps to [0, 1]', () => {
    expect(particleAge(100, 200, 50)).toBe(0);
    expect(particleAge(100, 200, 200)).toBe(0.5);
    expect(particleAge(100, 200, 900)).toBe(1);
    expect(particleAge(100, 0, 100)).toBe(1);
  });
});

describe('burstsFromEvents', () => {
  const dropped = (node: string, reason: DropReason): SimEvent => ({
    type: 'DROPPED',
    tick: 3,
    msgId: messageId('m-001#1'),
    nodeId: nodeId(node),
    class: 'INFO',
    reason,
  });

  it('ignores duplicates, coalesces per node and reason, rejections first', () => {
    const events: SimEvent[] = [
      dropped('m-001', 'DUPLICATE'),
      dropped('m-002', 'HOP_LIMIT'),
      dropped('m-003', 'UNVERIFIABLE'),
      dropped('m-003', 'UNVERIFIABLE'),
      { type: 'ORIGINATED', tick: 3, msgId: messageId('m-001#1'), nodeId: a, class: 'INFO' },
    ];
    const bursts = burstsFromEvents(events, 500);
    expect(bursts.map((b) => [b.nodeId, b.reason, b.count])).toEqual([
      ['m-003', 'UNVERIFIABLE', 2],
      ['m-002', 'HOP_LIMIT', 1],
    ]);
    expect(liveBursts(bursts, 500 + BURST_MS - 1)).toHaveLength(2);
    expect(liveBursts(bursts, 500 + BURST_MS)).toHaveLength(0);
  });

  it('respects the cap', () => {
    const events: SimEvent[] = [];
    for (let i = 0; i < 20; i++) events.push(dropped(`m-${i}`, 'NO_ROUTE'));
    expect(burstsFromEvents(events, 0, 5)).toHaveLength(5);
  });
});
