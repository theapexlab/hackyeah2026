import { describe, expect, it } from 'vitest';
import type { Signer } from '../../src/domain/message';
import { canOriginate } from '../../src/domain/mode';
import { isTrusted } from '../../src/policies/trust';
import { m } from '../helpers';

const signer = (credentialKind: Signer['credentialKind'], valid = true): Signer => ({
  nodeId: m(0),
  credentialKind,
  valid,
});

describe('Trust', () => {
  it('citizen BORROW ok', () => {
    expect(isTrusted(signer('citizen'), 'BORROW')).toBe(true);
  });

  it('valid:false -> UNVERIFIABLE', () => {
    expect(isTrusted(signer('citizen', false), 'BORROW')).toBe(false);
    expect(isTrusted(signer('authority', false), 'MODE_DECLARATION')).toBe(false);
  });

  it('relay credential passes trust (it is rejected later as RELAY_CANNOT_ACT)', () => {
    expect(isTrusted(signer('relay'), 'BORROW')).toBe(true);
    expect(canOriginate('relay', 'BORROW')).toBe(false);
  });

  it('none -> UNVERIFIABLE for every class', () => {
    expect(isTrusted(signer('none'), 'BORROW')).toBe(false);
    expect(isTrusted(signer('none'), 'TOPOLOGY')).toBe(false);
  });

  it('citizen OFFICIAL_ALERT / MODE_DECLARATION -> UNVERIFIABLE', () => {
    expect(isTrusted(signer('citizen'), 'OFFICIAL_ALERT')).toBe(false);
    expect(isTrusted(signer('citizen'), 'MODE_DECLARATION')).toBe(false);
  });

  it('authority declaration and alert ok; authority cannot forge citizen classes', () => {
    expect(isTrusted(signer('authority'), 'MODE_DECLARATION')).toBe(true);
    expect(isTrusted(signer('authority'), 'OFFICIAL_ALERT')).toBe(true);
    expect(isTrusted(signer('authority'), 'BORROW')).toBe(false);
  });
});
