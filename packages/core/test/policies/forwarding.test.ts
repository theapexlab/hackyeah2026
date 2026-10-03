import { describe, expect, it } from 'vitest';
import type { DropReason } from '../../src/domain/events';
import { formatMessageId, type MessageId } from '../../src/domain/ids';
import type { Message, Packet } from '../../src/domain/message';
import type { Mode } from '../../src/domain/mode';
import type { Node } from '../../src/domain/node';
import { type DecideContext, decide, inRegion } from '../../src/policies/forwarding';
import { fakeNode, m, r } from '../helpers';

const msgId = formatMessageId(m(0), 1);

function msg(over: Partial<Message> = {}): Message {
  return {
    id: msgId,
    seq: 1,
    class: 'INFO',
    payload: { kind: 'REQUEST', text: 'x' },
    originId: m(0),
    signer: { nodeId: m(0), credentialKind: 'citizen', valid: true },
    createdTick: 0,
    ttlTicks: 60,
    hopLimit: 3,
    ...over,
  };
}

const pkt = (over: Partial<Packet> = {}): Packet => ({
  msgId,
  hop: 1,
  path: [m(0)],
  lastHop: m(0),
  seq: 1,
  ...over,
});

function ctx(mode: Mode = 'PEACE', node: Partial<Node> = {}, tick = 5): DecideContext {
  return { receiverNode: fakeNode(node), receiverMode: mode, tick };
}

const reasonOf = (m_: Message, p: Packet, c: DecideContext): DropReason | undefined =>
  decide(m_, p, c).dropReason;

describe('decide(): each DropReason', () => {
  it('UNVERIFIABLE: signer.valid false', () => {
    const res = decide(
      msg({ signer: { nodeId: m(0), credentialKind: 'citizen', valid: false } }),
      pkt(),
      ctx(),
    );
    expect(res).toEqual({ drop: true, dropReason: 'UNVERIFIABLE', deliverLocally: false });
  });

  it('UNVERIFIABLE: credential none, or citizen claiming an authority class', () => {
    expect(
      reasonOf(
        msg({ signer: { nodeId: m(0), credentialKind: 'none', valid: true } }),
        pkt(),
        ctx(),
      ),
    ).toBe('UNVERIFIABLE');
    expect(reasonOf(msg({ class: 'OFFICIAL_ALERT' }), pkt(), ctx())).toBe('UNVERIFIABLE');
    expect(reasonOf(msg({ class: 'MODE_DECLARATION' }), pkt(), ctx())).toBe('UNVERIFIABLE');
  });

  it('DUPLICATE: id already seen', () => {
    expect(reasonOf(msg(), pkt(), ctx('PEACE', { seen: new Set([msgId]) }))).toBe('DUPLICATE');
  });

  it('RELAY_CANNOT_ACT: relay-signed BORROW / INFO / OFFICIAL_ALERT; TOPOLOGY and PORTAL_SUMMARY pass', () => {
    const relay = { nodeId: r(0), credentialKind: 'relay' as const, valid: true };
    for (const c of ['BORROW', 'INFO', 'LIFE_CRITICAL', 'CHECK_IN', 'OFFICIAL_ALERT'] as const) {
      expect(reasonOf(msg({ class: c, signer: relay }), pkt(), ctx())).toBe('RELAY_CANNOT_ACT');
    }
    for (const c of ['TOPOLOGY', 'PORTAL_SUMMARY'] as const) {
      expect(decide(msg({ class: c, signer: relay }), pkt(), ctx()).drop).toBe(false);
    }
  });

  it('CLASS_NOT_ALLOWED: SELL in L1, INFO in L3', () => {
    expect(reasonOf(msg({ class: 'SELL' }), pkt(), ctx('L1'))).toBe('CLASS_NOT_ALLOWED');
    expect(reasonOf(msg({ class: 'SELL' }), pkt(), ctx('L3'))).toBe('CLASS_NOT_ALLOWED');
    expect(reasonOf(msg({ class: 'INFO' }), pkt(), ctx('L3'))).toBe('CLASS_NOT_ALLOWED');
    expect(decide(msg({ class: 'SELL' }), pkt(), ctx('PEACE')).drop).toBe(false);
  });

  it('PRICED_IN_EMERGENCY: priced GIVE in L1 and L2, ok in PEACE', () => {
    const priced = msg({ class: 'GIVE', payload: { kind: 'REQUEST', text: 'x', price: 5 } });
    expect(reasonOf(priced, pkt(), ctx('L1'))).toBe('PRICED_IN_EMERGENCY');
    expect(reasonOf(priced, pkt(), ctx('L2'))).toBe('PRICED_IN_EMERGENCY');
    expect(decide(priced, pkt(), ctx('PEACE')).drop).toBe(false);
    const free = msg({ class: 'GIVE', payload: { kind: 'REQUEST', text: 'x', price: 0 } });
    expect(decide(free, pkt(), ctx('L1')).drop).toBe(false);
  });

  it('TTL_EXPIRED: age strictly greater than ttl (tick based)', () => {
    const base = msg({ createdTick: 10, ttlTicks: 20 });
    expect(decide(base, pkt(), ctx('PEACE', {}, 30)).drop).toBe(false);
    expect(reasonOf(base, pkt(), ctx('PEACE', {}, 31))).toBe('TTL_EXPIRED');
  });

  it('TTL is not confused with hop count', () => {
    expect(
      decide(msg({ ttlTicks: 1, hopLimit: 3 }), pkt({ hop: 3 }), ctx('PEACE', {}, 0)).drop,
    ).toBe(false);
  });

  it('HOP_LIMIT: hop strictly greater than msg.hopLimit', () => {
    expect(reasonOf(msg({ hopLimit: 3 }), pkt({ hop: 4 }), ctx())).toBe('HOP_LIMIT');
    expect(decide(msg({ hopLimit: 3 }), pkt({ hop: 3 }), ctx()).drop).toBe(false);
    expect(decide(msg({ hopLimit: Infinity }), pkt({ hop: 500 }), ctx()).drop).toBe(false);
  });

  it('OUT_OF_REGION: regional citizen request outside the circle', () => {
    const region = { centerX: 0, centerY: 0, radiusMtres: 50 };
    const res = decide(msg({ region }), pkt(), ctx('PEACE', { x: 100, y: 0 }));
    expect(res).toEqual({ drop: true, dropReason: 'OUT_OF_REGION', deliverLocally: false });
    const inside = decide(msg({ region }), pkt(), ctx('PEACE', { x: 50, y: 0 }));
    expect(inside).toEqual({ drop: false, deliverLocally: true });
  });
});

describe('decide(): ordering (diagram 06)', () => {
  const invalid = { nodeId: m(0), credentialKind: 'citizen' as const, valid: false };

  it('unverifiable beats duplicate', () => {
    expect(
      reasonOf(msg({ signer: invalid }), pkt(), ctx('PEACE', { seen: new Set([msgId]) })),
    ).toBe('UNVERIFIABLE');
  });

  it('duplicate beats relay-cannot-act and class-not-allowed', () => {
    const seen = new Set<MessageId>([msgId]);
    const relay = { nodeId: r(0), credentialKind: 'relay' as const, valid: true };
    expect(reasonOf(msg({ signer: relay }), pkt(), ctx('PEACE', { seen }))).toBe('DUPLICATE');
    expect(reasonOf(msg({ class: 'SELL' }), pkt(), ctx('L1', { seen }))).toBe('DUPLICATE');
  });

  it('relay-cannot-act beats class-not-allowed', () => {
    const relay = { nodeId: r(0), credentialKind: 'relay' as const, valid: true };
    expect(reasonOf(msg({ class: 'SELL', signer: relay }), pkt(), ctx('L1'))).toBe(
      'RELAY_CANNOT_ACT',
    );
  });

  it('class-not-allowed beats priced', () => {
    const priced = msg({ class: 'SELL', payload: { kind: 'REQUEST', text: 'x', price: 5 } });
    expect(reasonOf(priced, pkt(), ctx('L1'))).toBe('CLASS_NOT_ALLOWED');
  });

  it('priced beats ttl; ttl beats hop limit; hop limit beats out-of-region', () => {
    const priced = msg({
      class: 'GIVE',
      payload: { kind: 'REQUEST', text: 'x', price: 5 },
      createdTick: 0,
      ttlTicks: 1,
    });
    expect(reasonOf(priced, pkt(), ctx('L1', {}, 99))).toBe('PRICED_IN_EMERGENCY');
    expect(reasonOf(msg({ ttlTicks: 1, hopLimit: 1 }), pkt({ hop: 5 }), ctx('PEACE', {}, 99))).toBe(
      'TTL_EXPIRED',
    );
    const region = { centerX: 0, centerY: 0, radiusMtres: 1 };
    expect(reasonOf(msg({ hopLimit: 1, region }), pkt({ hop: 5 }), ctx('PEACE', { x: 99 }))).toBe(
      'HOP_LIMIT',
    );
  });

  it('is pure: never mutates the receiver', () => {
    const c = ctx();
    decide(msg(), pkt(), c);
    expect(c.receiverNode.seen.size).toBe(0);
  });
});

describe('decide(): deliverLocally', () => {
  it('REQUEST: delivered at citizens only (not relays / unregistered)', () => {
    expect(
      decide(msg(), pkt(), ctx('PEACE', { credential: { kind: 'citizen' } })).deliverLocally,
    ).toBe(true);
    const atRelay = decide(msg(), pkt(), ctx('PEACE', { id: r(0), credential: { kind: 'relay' } }));
    expect(atRelay).toEqual({ drop: false, deliverLocally: false });
    expect(
      decide(msg(), pkt(), ctx('PEACE', { credential: { kind: 'none' } })).deliverLocally,
    ).toBe(false);
  });

  const response = (): Message =>
    msg({
      class: 'INFO',
      payload: {
        kind: 'RESPONSE',
        requestId: msgId,
        responderId: m(2),
        targetId: m(0),
        returnPath: [],
      },
      signer: { nodeId: m(2), credentialKind: 'citizen', valid: true },
    });

  it('RESPONSE: only at targetId, otherwise forwarded but not delivered', () => {
    expect(decide(response(), pkt(), ctx('PEACE', { id: m(0) })).deliverLocally).toBe(true);
    expect(decide(response(), pkt(), ctx('PEACE', { id: m(1) }))).toEqual({
      drop: false,
      deliverLocally: false,
    });
  });

  it('CLOSE: delivered at citizens, not at relays', () => {
    const close = msg({ payload: { kind: 'CLOSE', requestId: msgId, accepterId: m(2) } });
    expect(decide(close, pkt(), ctx()).deliverLocally).toBe(true);
    expect(
      decide(close, pkt(), ctx('PEACE', { credential: { kind: 'relay' } })).deliverLocally,
    ).toBe(false);
  });

  it('CHECK_IN: delivered only at backhaul nodes', () => {
    const checkIn = msg({ class: 'CHECK_IN', payload: { kind: 'CHECK_IN', status: 'OK' } });
    expect(decide(checkIn, pkt(), ctx('L1', { hasBackhaul: true })).deliverLocally).toBe(true);
    expect(decide(checkIn, pkt(), ctx('L1', { hasBackhaul: false }))).toEqual({
      drop: false,
      deliverLocally: false,
    });
  });

  const authority = { nodeId: m(0), credentialKind: 'authority' as const, valid: true };
  const region = { centerX: 0, centerY: 0, radiusMtres: 50 };
  const declaration = (over: Partial<Message> = {}) =>
    msg({
      class: 'MODE_DECLARATION',
      payload: { kind: 'MODE_DECLARATION', level: 'L2', untilTick: 99 },
      signer: authority,
      hopLimit: Infinity,
      ...over,
    });

  it('declaration without region: delivered everywhere', () => {
    expect(decide(declaration(), pkt(), ctx('L3')).deliverLocally).toBe(true);
  });

  it('declaration inside region: delivered; outside region: ok (forwarded) but deliverLocally=false', () => {
    expect(decide(declaration({ region }), pkt(), ctx('PEACE', { x: 10 })).deliverLocally).toBe(
      true,
    );
    expect(decide(declaration({ region }), pkt(), ctx('PEACE', { x: 500 }))).toEqual({
      drop: false,
      deliverLocally: false,
    });
  });

  it('alert follows the same region rule, including at relays', () => {
    const alert = msg({
      class: 'OFFICIAL_ALERT',
      payload: { kind: 'ALERT', text: 'x' },
      signer: authority,
      hopLimit: Infinity,
      region,
    });
    const relayIn = ctx('L1', { id: r(0), credential: { kind: 'relay' }, x: 1 });
    const relayOut = ctx('L1', { id: r(0), credential: { kind: 'relay' }, x: 999 });
    expect(decide(alert, pkt(), relayIn).deliverLocally).toBe(true);
    expect(decide(alert, pkt(), relayOut)).toEqual({ drop: false, deliverLocally: false });
  });

  it('inRegion is inclusive of the boundary', () => {
    expect(inRegion(region, 50, 0)).toBe(true);
    expect(inRegion(region, 50.001, 0)).toBe(false);
  });
});
