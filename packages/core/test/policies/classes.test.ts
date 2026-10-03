import { describe, expect, it } from 'vitest';
import { messageId, nodeId } from '../../src/domain/ids';
import type { Message, MessageClass } from '../../src/domain/message';
import { hopLimitFor, MODE_POLICIES } from '../../src/domain/mode';
import {
  classAllowedToOriginate,
  classAllowedToRelay,
  comparePriority,
  isPriced,
  PRIORITY_RANK,
} from '../../src/policies/classes';

const request = (cls: MessageClass, price?: number): Message => ({
  id: messageId('m-001#1'),
  seq: 1,
  class: cls,
  payload: { kind: 'REQUEST', text: 'x', price },
  originId: nodeId('m-001'),
  signer: { nodeId: nodeId('m-001'), credentialKind: 'citizen', valid: true },
  createdTick: 0,
  ttlTicks: 10,
  hopLimit: 3,
});

describe('priority', () => {
  it('orders LIFE_CRITICAL < OFFICIAL_ALERT = MODE_DECLARATION < SAFETY < CHECK_IN < rest', () => {
    expect(PRIORITY_RANK.LIFE_CRITICAL).toBeLessThan(PRIORITY_RANK.OFFICIAL_ALERT);
    expect(PRIORITY_RANK.OFFICIAL_ALERT).toBe(PRIORITY_RANK.MODE_DECLARATION);
    expect(PRIORITY_RANK.OFFICIAL_ALERT).toBeLessThan(PRIORITY_RANK.SAFETY);
    expect(PRIORITY_RANK.SAFETY).toBeLessThan(PRIORITY_RANK.CHECK_IN);
    for (const cls of ['LEND', 'BORROW', 'GIVE', 'SELL', 'INFO'] as const) {
      expect(PRIORITY_RANK.CHECK_IN).toBeLessThan(PRIORITY_RANK[cls]);
    }
    const sorted = (['INFO', 'SAFETY', 'LIFE_CRITICAL', 'CHECK_IN'] as MessageClass[]).sort(
      comparePriority,
    );
    expect(sorted).toEqual(['LIFE_CRITICAL', 'SAFETY', 'CHECK_IN', 'INFO']);
  });
});

describe('class vs mode policy', () => {
  it('SELL is relayed in PEACE but not in any emergency level', () => {
    expect(classAllowedToRelay(MODE_POLICIES.PEACE, 'SELL')).toBe(true);
    expect(classAllowedToRelay(MODE_POLICIES.L1, 'SELL')).toBe(false);
    expect(classAllowedToRelay(MODE_POLICIES.L2, 'SELL')).toBe(false);
    expect(classAllowedToRelay(MODE_POLICIES.L3, 'SELL')).toBe(false);
  });

  it('priced requests are detected; emergency policies disallow payments', () => {
    expect(isPriced(request('GIVE', 5))).toBe(true);
    expect(isPriced(request('GIVE', 0))).toBe(false);
    expect(isPriced(request('GIVE'))).toBe(false);
    expect(MODE_POLICIES.PEACE.paymentsAllowed).toBe(true);
    expect(MODE_POLICIES.L1.paymentsAllowed).toBe(false);
    expect(MODE_POLICIES.L2.paymentsAllowed).toBe(false);
    expect(MODE_POLICIES.L3.paymentsAllowed).toBe(false);
  });

  it('INFO may be originated in L1 and L2 but not in L3 (rumour control)', () => {
    expect(classAllowedToOriginate(MODE_POLICIES.L1, 'INFO')).toBe(true);
    expect(classAllowedToOriginate(MODE_POLICIES.L2, 'INFO')).toBe(true);
    expect(classAllowedToOriginate(MODE_POLICIES.L3, 'INFO')).toBe(false);
    expect(classAllowedToRelay(MODE_POLICIES.L3, 'INFO')).toBe(false);
  });

  it('CHECK_IN is relayed in PEACE but cannot be originated there', () => {
    expect(classAllowedToRelay(MODE_POLICIES.PEACE, 'CHECK_IN')).toBe(true);
    expect(classAllowedToOriginate(MODE_POLICIES.PEACE, 'CHECK_IN')).toBe(false);
    expect(classAllowedToOriginate(MODE_POLICIES.L1, 'CHECK_IN')).toBe(true);
  });

  it('life-critical, safety and authority classes are relayed in every mode', () => {
    for (const mode of ['PEACE', 'L1', 'L2', 'L3'] as const) {
      for (const cls of [
        'LIFE_CRITICAL',
        'SAFETY',
        'OFFICIAL_ALERT',
        'MODE_DECLARATION',
      ] as const) {
        expect(classAllowedToRelay(MODE_POLICIES[mode], cls)).toBe(true);
      }
    }
  });

  it('relayClasses is a superset of originClasses in every mode', () => {
    for (const mode of ['PEACE', 'L1', 'L2', 'L3'] as const) {
      for (const cls of MODE_POLICIES[mode].originClasses) {
        expect(MODE_POLICIES[mode].relayClasses).toContain(cls);
      }
    }
  });

  it('hop limits follow the concept table and authority classes are unbounded', () => {
    expect(MODE_POLICIES.PEACE.hopLimit).toBe(3);
    expect(MODE_POLICIES.L1.hopLimit).toBe(10);
    expect(MODE_POLICIES.L2.hopLimit).toBe(15);
    expect(MODE_POLICIES.L3.hopLimit).toBe(6);
    expect(hopLimitFor(MODE_POLICIES.PEACE, 'BORROW')).toBe(3);
    expect(hopLimitFor(MODE_POLICIES.L3, 'OFFICIAL_ALERT')).toBe(Number.POSITIVE_INFINITY);
    expect(hopLimitFor(MODE_POLICIES.PEACE, 'MODE_DECLARATION')).toBe(Number.POSITIVE_INFINITY);
  });

  it('L3 switches phone topology gossip off; all emergency levels store-and-forward', () => {
    expect(MODE_POLICIES.L3.phoneTopologyGossip).toBe(false);
    expect(MODE_POLICIES.L2.phoneTopologyGossip).toBe(true);
    expect(MODE_POLICIES.PEACE.storeAndForward).toBe(false);
    for (const mode of ['L1', 'L2', 'L3'] as const) {
      expect(MODE_POLICIES[mode].storeAndForward).toBe(true);
    }
  });
});
