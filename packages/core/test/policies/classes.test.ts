/**
 * Message class policy tests
 */

import { describe, expect, it } from 'vitest';
import { hopLimitFor, MODE_POLICIES } from '../../src/domain/mode';
import {
  arePaymentsAllowed,
  canOriginateClass,
  isClassAllowed,
  isPriced,
} from '../../src/policies/classes';

describe('Classes', () => {
  it('SELL relayed in PEACE not L1-L3', () => {
    expect(isClassAllowed('SELL', 'PEACE')).toBe(true);
    expect(isClassAllowed('SELL', 'L1')).toBe(false);
    expect(isClassAllowed('SELL', 'L2')).toBe(false);
    expect(isClassAllowed('SELL', 'L3')).toBe(false);
  });

  it('priced GIVE → PRICED_IN_EMERGENCY check', () => {
    const priced = { kind: 'REQUEST' as const, text: 'test', price: 10 };
    expect(isPriced(priced)).toBe(true);
    expect(arePaymentsAllowed('PEACE')).toBe(true);
    expect(arePaymentsAllowed('L1')).toBe(false);
  });

  it('INFO ok L1/L2, rejected L3', () => {
    expect(isClassAllowed('INFO', 'PEACE')).toBe(true);
    expect(isClassAllowed('INFO', 'L1')).toBe(true);
    expect(isClassAllowed('INFO', 'L2')).toBe(true);
    expect(isClassAllowed('INFO', 'L3')).toBe(false);
  });

  it('CHECK_IN relayed in emergency modes', () => {
    expect(isClassAllowed('CHECK_IN', 'L1')).toBe(true);
    expect(isClassAllowed('CHECK_IN', 'L2')).toBe(true);
    expect(isClassAllowed('CHECK_IN', 'L3')).toBe(true);
  });

  it('authority classes have unbounded hop limit', () => {
    const policy = MODE_POLICIES.PEACE;
    expect(hopLimitFor(policy, 'OFFICIAL_ALERT')).toBe(Infinity);
    expect(hopLimitFor(policy, 'MODE_DECLARATION')).toBe(Infinity);
  });
});
