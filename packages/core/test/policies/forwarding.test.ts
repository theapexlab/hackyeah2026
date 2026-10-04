import { describe, expect, it } from 'vitest';
import { AUTHORITY_ID, messageId, nodeId } from '../../src/domain/ids';
import type { Message } from '../../src/domain/message';
import { MODE_POLICIES } from '../../src/domain/mode';
import { decide, decisionContextFor } from '../../src/policies/forwarding';
import { makeContext, makeMessage, makeNode, makePacket } from '../helpers';

const far = { x: 500, y: 500, r: 100 }; // the default context node at (0,0) is outside

const declaration = (partial: Partial<Message> = {}): Message =>
  makeMessage({
    id: messageId('authority#7'),
    class: 'MODE_DECLARATION',
    originId: AUTHORITY_ID,
    signer: { nodeId: AUTHORITY_ID, credentialKind: 'authority', valid: true },
    payload: { kind: 'MODE_DECLARATION', level: 'L2', untilTick: 300 },
    hopLimit: Number.POSITIVE_INFINITY,
    ...partial,
  });

describe('decide: accept path', () => {
  it('accepts a valid citizen request at a citizen node and delivers it', () => {
    const msg = makeMessage();
    expect(decide(makeContext(), msg, makePacket(msg))).toEqual({
      ok: true,
      deliverLocally: true,
    });
  });

  it('never mutates the seen set', () => {
    const seen = new Set<ReturnType<typeof messageId>>();
    const msg = makeMessage();
    decide(makeContext({ seen }), msg, makePacket(msg));
    expect(seen.size).toBe(0);
  });

  it('decisionContextFor reads the node', () => {
    const node = makeNode({
      id: 'r-003',
      kind: 'router',
      credential: { kind: 'relay' },
      mode: 'L1',
      x: 7,
      y: 9,
    });
    node.seen.add(messageId('m-001#1'));
    const ctx = decisionContextFor(node, 42);
    expect(ctx).toEqual({
      tick: 42,
      policy: MODE_POLICIES.L1,
      nodeId: 'r-003',
      credentialKind: 'relay',
      seen: node.seen,
      x: 7,
      y: 9,
    });
  });
});

describe('decide: drop reasons', () => {
  it('(a) UNVERIFIABLE: invalid signature, wrong rights, or no credential', () => {
    const invalid = makeMessage({
      signer: { nodeId: nodeId('m-001'), credentialKind: 'citizen', valid: false },
    });
    expect(decide(makeContext(), invalid, makePacket(invalid))).toEqual({
      ok: false,
      reason: 'UNVERIFIABLE',
    });

    const citizenAlert = makeMessage({
      class: 'OFFICIAL_ALERT',
      payload: { kind: 'ALERT', text: 'x' },
    });
    expect(decide(makeContext(), citizenAlert, makePacket(citizenAlert)).ok).toBe(false);
    expect(decide(makeContext(), citizenAlert, makePacket(citizenAlert))).toMatchObject({
      reason: 'UNVERIFIABLE',
    });

    const none = makeMessage({
      signer: { nodeId: nodeId('m-001'), credentialKind: 'none', valid: true },
    });
    expect(decide(makeContext(), none, makePacket(none))).toEqual({
      ok: false,
      reason: 'UNVERIFIABLE',
    });

    const forged = makeMessage({
      signer: { nodeId: nodeId('m-001'), credentialKind: 'authority', valid: false },
      class: 'OFFICIAL_ALERT',
      payload: { kind: 'ALERT', text: 'x' },
    });
    expect(decide(makeContext(), forged, makePacket(forged))).toEqual({
      ok: false,
      reason: 'UNVERIFIABLE',
    });
  });

  it('(b) DUPLICATE when the id was seen', () => {
    const msg = makeMessage();
    const ctx = makeContext({ seen: new Set([msg.id]) });
    expect(decide(ctx, msg, makePacket(msg))).toEqual({ ok: false, reason: 'DUPLICATE' });
  });

  it('(c) relay signers: non-relay classes are rejected (shadowed as UNVERIFIABLE by the trust table), relay-only classes pass', () => {
    const relayBorrow = makeMessage({
      signer: { nodeId: nodeId('r-001'), credentialKind: 'relay', valid: true },
    });
    expect(decide(makeContext(), relayBorrow, makePacket(relayBorrow))).toEqual({
      ok: false,
      reason: 'UNVERIFIABLE',
    });

    const topology = makeMessage({
      class: 'TOPOLOGY',
      originId: nodeId('r-001'),
      signer: { nodeId: nodeId('r-001'), credentialKind: 'relay', valid: true },
      payload: { kind: 'TOPOLOGY', neighbours: [] },
    });
    expect(decide(makeContext(), topology, makePacket(topology))).toEqual({
      ok: true,
      deliverLocally: true,
    });
  });

  it('(d) CLASS_NOT_ALLOWED by the receiving mode policy', () => {
    const lend = makeMessage({ class: 'LEND' });
    expect(decide(makeContext({ policy: MODE_POLICIES.PEACE }), lend, makePacket(lend)).ok).toBe(
      true,
    );
    expect(decide(makeContext({ policy: MODE_POLICIES.L1 }), lend, makePacket(lend))).toEqual({
      ok: false,
      reason: 'CLASS_NOT_ALLOWED',
    });
    const info = makeMessage({ class: 'INFO' });
    expect(decide(makeContext({ policy: MODE_POLICIES.L2 }), info, makePacket(info)).ok).toBe(true);
    expect(decide(makeContext({ policy: MODE_POLICIES.L3 }), info, makePacket(info))).toEqual({
      ok: false,
      reason: 'CLASS_NOT_ALLOWED',
    });
  });

  it('(d) PRICED_IN_EMERGENCY for a priced request outside PEACE', () => {
    const priced = makeMessage({
      class: 'GIVE',
      payload: { kind: 'REQUEST', text: 'water', price: 5 },
    });
    expect(
      decide(makeContext({ policy: MODE_POLICIES.PEACE }), priced, makePacket(priced)).ok,
    ).toBe(true);
    for (const mode of ['L1', 'L2'] as const) {
      expect(
        decide(makeContext({ policy: MODE_POLICIES[mode] }), priced, makePacket(priced)),
      ).toEqual({ ok: false, reason: 'PRICED_IN_EMERGENCY' });
    }
    const free = makeMessage({
      class: 'GIVE',
      payload: { kind: 'REQUEST', text: 'water', price: 0 },
    });
    expect(decide(makeContext({ policy: MODE_POLICIES.L1 }), free, makePacket(free)).ok).toBe(true);
  });

  it('(e) TTL_EXPIRED strictly after createdTick + ttlTicks', () => {
    const msg = makeMessage({ createdTick: 0, ttlTicks: 10 });
    expect(decide(makeContext({ tick: 10 }), msg, makePacket(msg)).ok).toBe(true);
    expect(decide(makeContext({ tick: 11 }), msg, makePacket(msg))).toEqual({
      ok: false,
      reason: 'TTL_EXPIRED',
    });
  });

  it('(e) HOP_LIMIT when the packet hop exceeds the message hop limit; Infinity never does', () => {
    const msg = makeMessage({ hopLimit: 3 });
    expect(decide(makeContext(), msg, makePacket(msg, { hop: 3 })).ok).toBe(true);
    expect(decide(makeContext(), msg, makePacket(msg, { hop: 4 }))).toEqual({
      ok: false,
      reason: 'HOP_LIMIT',
    });
    const alert = declaration();
    expect(
      decide(makeContext({ x: 500, y: 500 }), alert, makePacket(alert, { hop: 10_000 })).ok,
    ).toBe(true);
  });

  it('(f) OUT_OF_REGION only for citizen REQUESTs outside the region', () => {
    const req = makeMessage({ region: far });
    expect(decide(makeContext(), req, makePacket(req))).toEqual({
      ok: false,
      reason: 'OUT_OF_REGION',
    });
    expect(decide(makeContext({ x: 450, y: 500 }), req, makePacket(req))).toEqual({
      ok: true,
      deliverLocally: true,
    });

    const checkIn = makeMessage({
      class: 'CHECK_IN',
      payload: { kind: 'CHECK_IN', status: 'OK' },
      region: far,
    });
    expect(decide(makeContext(), checkIn, makePacket(checkIn))).toEqual({
      ok: true,
      deliverLocally: true,
    });
  });
});

describe('decide: branch order', () => {
  it('UNVERIFIABLE beats DUPLICATE', () => {
    const msg = makeMessage({
      signer: { nodeId: nodeId('m-001'), credentialKind: 'citizen', valid: false },
    });
    const ctx = makeContext({ seen: new Set([msg.id]) });
    expect(decide(ctx, msg, makePacket(msg))).toEqual({ ok: false, reason: 'UNVERIFIABLE' });
  });

  it('DUPLICATE beats CLASS_NOT_ALLOWED', () => {
    const lend = makeMessage({ class: 'LEND' });
    const ctx = makeContext({ policy: MODE_POLICIES.L1, seen: new Set([lend.id]) });
    expect(decide(ctx, lend, makePacket(lend))).toEqual({ ok: false, reason: 'DUPLICATE' });
  });

  it('CLASS_NOT_ALLOWED beats PRICED_IN_EMERGENCY and TTL_EXPIRED', () => {
    const lend = makeMessage({
      class: 'LEND',
      payload: { kind: 'REQUEST', text: 'x', price: 9 },
      createdTick: 0,
      ttlTicks: 1,
    });
    expect(
      decide(makeContext({ policy: MODE_POLICIES.L1, tick: 50 }), lend, makePacket(lend)),
    ).toEqual({ ok: false, reason: 'CLASS_NOT_ALLOWED' });
  });

  it('PRICED_IN_EMERGENCY beats TTL_EXPIRED', () => {
    const give = makeMessage({
      class: 'GIVE',
      payload: { kind: 'REQUEST', text: 'x', price: 9 },
      createdTick: 0,
      ttlTicks: 1,
    });
    expect(
      decide(makeContext({ policy: MODE_POLICIES.L1, tick: 50 }), give, makePacket(give)),
    ).toEqual({ ok: false, reason: 'PRICED_IN_EMERGENCY' });
  });

  it('TTL_EXPIRED beats HOP_LIMIT beats OUT_OF_REGION', () => {
    const msg = makeMessage({ createdTick: 0, ttlTicks: 1, hopLimit: 1, region: far });
    expect(decide(makeContext({ tick: 50 }), msg, makePacket(msg, { hop: 5 }))).toEqual({
      ok: false,
      reason: 'TTL_EXPIRED',
    });
    const fresh = makeMessage({ hopLimit: 1, region: far });
    expect(decide(makeContext(), fresh, makePacket(fresh, { hop: 5 }))).toEqual({
      ok: false,
      reason: 'HOP_LIMIT',
    });
    expect(decide(makeContext(), fresh, makePacket(fresh, { hop: 1 }))).toEqual({
      ok: false,
      reason: 'OUT_OF_REGION',
    });
  });
});

describe('decide: deliverLocally', () => {
  it('RESPONSE is delivered only at its target, forwarded elsewhere', () => {
    const response = makeMessage({
      originId: nodeId('m-009'),
      signer: { nodeId: nodeId('m-009'), credentialKind: 'citizen', valid: true },
      payload: {
        kind: 'RESPONSE',
        requestId: messageId('m-001#1'),
        responderId: nodeId('m-009'),
        targetId: nodeId('m-001'),
        returnPath: [],
      },
    });
    expect(
      decide(makeContext({ nodeId: nodeId('m-001') }), response, makePacket(response)),
    ).toEqual({ ok: true, deliverLocally: true });
    expect(
      decide(makeContext({ nodeId: nodeId('m-002') }), response, makePacket(response)),
    ).toEqual({ ok: true, deliverLocally: false });
  });

  it('REQUEST is delivered only at citizens; relays and unregistered phones just forward', () => {
    const msg = makeMessage();
    expect(decide(makeContext({ credentialKind: 'relay' }), msg, makePacket(msg))).toEqual({
      ok: true,
      deliverLocally: false,
    });
    expect(decide(makeContext({ credentialKind: 'none' }), msg, makePacket(msg))).toEqual({
      ok: true,
      deliverLocally: false,
    });
    expect(decide(makeContext({ credentialKind: 'citizen' }), msg, makePacket(msg))).toEqual({
      ok: true,
      deliverLocally: true,
    });
  });

  it('declarations and alerts outside their region are forwarded but not applied', () => {
    const decl = declaration({ region: far });
    expect(decide(makeContext(), decl, makePacket(decl))).toEqual({
      ok: true,
      deliverLocally: false,
    });
    expect(decide(makeContext({ x: 520, y: 480 }), decl, makePacket(decl))).toEqual({
      ok: true,
      deliverLocally: true,
    });
    expect(decide(makeContext(), declaration(), makePacket(decl))).toEqual({
      ok: true,
      deliverLocally: true,
    });

    const alert = declaration({
      class: 'OFFICIAL_ALERT',
      payload: { kind: 'ALERT', text: 'boil water' },
      region: far,
    });
    expect(decide(makeContext(), alert, makePacket(alert))).toEqual({
      ok: true,
      deliverLocally: false,
    });
    expect(
      decide(makeContext({ policy: MODE_POLICIES.L3, x: 500, y: 500 }), alert, makePacket(alert)),
    ).toEqual({ ok: true, deliverLocally: true });
  });

  it('CLOSE is delivered only at citizens (the only nodes holding request views); CHECK_IN wherever accepted', () => {
    const close = makeMessage({
      payload: { kind: 'CLOSE', requestId: messageId('m-001#1'), accepterId: nodeId('m-009') },
    });
    expect(decide(makeContext({ credentialKind: 'relay' }), close, makePacket(close))).toEqual({
      ok: true,
      deliverLocally: false,
    });
    expect(decide(makeContext({ credentialKind: 'none' }), close, makePacket(close))).toEqual({
      ok: true,
      deliverLocally: false,
    });
    expect(decide(makeContext({ credentialKind: 'citizen' }), close, makePacket(close))).toEqual({
      ok: true,
      deliverLocally: true,
    });
    const checkIn = makeMessage({
      class: 'CHECK_IN',
      payload: { kind: 'CHECK_IN', status: 'TRAPPED' },
    });
    expect(
      decide(
        makeContext({ policy: MODE_POLICIES.L3, credentialKind: 'relay' }),
        checkIn,
        makePacket(checkIn),
      ),
    ).toEqual({ ok: true, deliverLocally: true });
  });
});
