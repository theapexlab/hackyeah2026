import { describe, expect, it } from 'vitest';
import {
  CREDENTIAL_ORIGINS,
  hopLimitFor,
  type MessageClass,
  MODE_POLICIES,
  type Mode,
  PRIORITY_RANK,
} from '../../src/domain/mode';
import {
  arePaymentsAllowed,
  canOriginateClass,
  isClassAllowed,
  isPriced,
} from '../../src/policies/classes';

const MODES: Mode[] = ['PEACE', 'L1', 'L2', 'L3'];
const CITIZEN_CLASSES: MessageClass[] = [
  'LEND',
  'BORROW',
  'GIVE',
  'SELL',
  'INFO',
  'LIFE_CRITICAL',
  'SAFETY',
];
const AUTHORITY_AND_RELAY: MessageClass[] = [
  'OFFICIAL_ALERT',
  'MODE_DECLARATION',
  'TOPOLOGY',
  'PORTAL_SUMMARY',
];

describe('Classes', () => {
  it('priority order: LIFE_CRITICAL, OFFICIAL_ALERT/MODE_DECLARATION, SAFETY, CHECK_IN, rest', () => {
    expect(PRIORITY_RANK.LIFE_CRITICAL).toBeLessThan(PRIORITY_RANK.OFFICIAL_ALERT);
    expect(PRIORITY_RANK.OFFICIAL_ALERT).toBe(PRIORITY_RANK.MODE_DECLARATION);
    expect(PRIORITY_RANK.MODE_DECLARATION).toBeLessThan(PRIORITY_RANK.SAFETY);
    expect(PRIORITY_RANK.SAFETY).toBeLessThan(PRIORITY_RANK.CHECK_IN);
    for (const c of [
      'LEND',
      'BORROW',
      'GIVE',
      'SELL',
      'INFO',
      'TOPOLOGY',
      'PORTAL_SUMMARY',
    ] as const) {
      expect(PRIORITY_RANK[c]).toBeGreaterThan(PRIORITY_RANK.CHECK_IN);
    }
  });

  it('SELL (and LEND/BORROW) relayed in PEACE, not L1-L3', () => {
    for (const c of ['SELL', 'LEND', 'BORROW'] as const) {
      expect(isClassAllowed(c, 'PEACE')).toBe(true);
      for (const mode of ['L1', 'L2', 'L3'] as const) expect(isClassAllowed(c, mode)).toBe(false);
    }
  });

  it('GIVE is the only commerce class allowed in L1/L2; none in L3', () => {
    expect(isClassAllowed('GIVE', 'L1')).toBe(true);
    expect(isClassAllowed('GIVE', 'L2')).toBe(true);
    expect(isClassAllowed('GIVE', 'L3')).toBe(false);
  });

  it('priced payloads: isPriced and paymentsAllowed per mode', () => {
    expect(isPriced({ kind: 'REQUEST', text: 'x', price: 10 })).toBe(true);
    expect(isPriced({ kind: 'REQUEST', text: 'x', price: 0 })).toBe(false);
    expect(isPriced({ kind: 'REQUEST', text: 'x' })).toBe(false);
    expect(isPriced({ kind: 'ALERT', text: 'x' })).toBe(false);
    expect(arePaymentsAllowed('PEACE')).toBe(true);
    for (const mode of ['L1', 'L2', 'L3'] as const) expect(arePaymentsAllowed(mode)).toBe(false);
  });

  it('INFO ok in PEACE/L1/L2, rejected in L3', () => {
    expect(isClassAllowed('INFO', 'PEACE')).toBe(true);
    expect(isClassAllowed('INFO', 'L1')).toBe(true);
    expect(isClassAllowed('INFO', 'L2')).toBe(true);
    expect(isClassAllowed('INFO', 'L3')).toBe(false);
    expect(canOriginateClass('INFO', 'L3')).toBe(false);
  });

  it('CHECK_IN relayed in PEACE but not originable there; originable in L1-L3', () => {
    expect(isClassAllowed('CHECK_IN', 'PEACE')).toBe(true);
    expect(canOriginateClass('CHECK_IN', 'PEACE')).toBe(false);
    for (const mode of ['L1', 'L2', 'L3'] as const) {
      expect(isClassAllowed('CHECK_IN', mode)).toBe(true);
      expect(canOriginateClass('CHECK_IN', mode)).toBe(true);
    }
  });

  it('LIFE_CRITICAL and SAFETY allowed in every mode (FR-PE-11)', () => {
    for (const mode of MODES) {
      expect(isClassAllowed('LIFE_CRITICAL', mode)).toBe(true);
      expect(isClassAllowed('SAFETY', mode)).toBe(true);
      expect(canOriginateClass('LIFE_CRITICAL', mode)).toBe(true);
    }
  });

  it('authority and relay classes are relayed in every mode but never citizen-originated', () => {
    for (const mode of MODES) {
      for (const c of AUTHORITY_AND_RELAY) {
        expect(isClassAllowed(c, mode)).toBe(true);
        expect(canOriginateClass(c, mode)).toBe(false);
      }
    }
  });

  it('every originable class is also relayed (origin subset of relay)', () => {
    for (const mode of MODES) {
      for (const c of MODE_POLICIES[mode].originClasses) expect(isClassAllowed(c, mode)).toBe(true);
    }
  });

  it('policy table matches concept.md (hop limit, ttl, store-and-forward, gossip, payments)', () => {
    const rows = {
      PEACE: [3, 60, false, true, true],
      L1: [10, 200, true, true, false],
      L2: [15, 300, true, true, false],
      L3: [6, 120, true, false, false],
    } as const;
    for (const mode of MODES) {
      const p = MODE_POLICIES[mode];
      expect([
        p.hopLimit,
        p.ttlTicks,
        p.storeAndForward,
        p.phoneTopologyGossip,
        p.paymentsAllowed,
      ]).toEqual(rows[mode]);
    }
    expect(MODE_POLICIES.L3.emission).toBe('reduced');
    expect(MODE_POLICIES.L1.emission).toBe('normal');
    expect(MODE_POLICIES.L1.portalWrite).toBe('check-in');
    expect(MODE_POLICIES.L2.portalWrite).toBe('check-in+request');
    expect(MODE_POLICIES.L3.portalWrite).toBe('none');
  });

  it('origin classes per mode', () => {
    expect([...MODE_POLICIES.PEACE.originClasses].sort()).toEqual([...CITIZEN_CLASSES].sort());
    const emergency = ['LIFE_CRITICAL', 'SAFETY', 'CHECK_IN', 'INFO', 'GIVE'].sort();
    expect([...MODE_POLICIES.L1.originClasses].sort()).toEqual(emergency);
    expect([...MODE_POLICIES.L2.originClasses].sort()).toEqual(emergency);
    expect([...MODE_POLICIES.L3.originClasses].sort()).toEqual(
      ['LIFE_CRITICAL', 'SAFETY', 'CHECK_IN'].sort(),
    );
  });

  it('trust table: authority / citizen / relay / none', () => {
    expect([...CREDENTIAL_ORIGINS.authority].sort()).toEqual([
      'MODE_DECLARATION',
      'OFFICIAL_ALERT',
    ]);
    expect(CREDENTIAL_ORIGINS.relay).toEqual(['TOPOLOGY', 'PORTAL_SUMMARY']);
    expect(CREDENTIAL_ORIGINS.none).toEqual([]);
    expect([...CREDENTIAL_ORIGINS.citizen].sort()).toEqual([...CITIZEN_CLASSES, 'CHECK_IN'].sort());
  });

  it('hopLimitFor: Infinity for authority classes, policy limit otherwise', () => {
    for (const mode of MODES) {
      const p = MODE_POLICIES[mode];
      expect(hopLimitFor(p, 'OFFICIAL_ALERT')).toBe(Infinity);
      expect(hopLimitFor(p, 'MODE_DECLARATION')).toBe(Infinity);
      expect(hopLimitFor(p, 'INFO')).toBe(p.hopLimit);
      expect(hopLimitFor(p, 'CHECK_IN')).toBe(p.hopLimit);
    }
  });
});
