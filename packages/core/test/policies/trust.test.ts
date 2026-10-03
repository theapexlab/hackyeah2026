import { describe, expect, it } from 'vitest';
import { nodeId } from '../../src/domain/ids';
import type { Signer } from '../../src/domain/message';
import { canOriginate, ORIGIN_RIGHTS, verifySigner } from '../../src/policies/trust';

const signer = (kind: Signer['credentialKind'], valid = true): Signer => ({
  nodeId: nodeId('m-001'),
  credentialKind: kind,
  valid,
});

describe('trust stub', () => {
  it('citizen may originate requests and check-ins', () => {
    expect(verifySigner(signer('citizen'), 'BORROW')).toBe(true);
    expect(verifySigner(signer('citizen'), 'LIFE_CRITICAL')).toBe(true);
    expect(verifySigner(signer('citizen'), 'CHECK_IN')).toBe(true);
  });

  it('an invalid signature fails regardless of the claimed kind', () => {
    expect(verifySigner(signer('citizen', false), 'BORROW')).toBe(false);
    expect(verifySigner(signer('authority', false), 'OFFICIAL_ALERT')).toBe(false);
  });

  it('relay certificates may only originate topology and portal summaries', () => {
    expect(verifySigner(signer('relay'), 'BORROW')).toBe(false);
    expect(verifySigner(signer('relay'), 'CHECK_IN')).toBe(false);
    expect(verifySigner(signer('relay'), 'TOPOLOGY')).toBe(true);
    expect(verifySigner(signer('relay'), 'PORTAL_SUMMARY')).toBe(true);
  });

  it('unregistered devices originate nothing', () => {
    expect(ORIGIN_RIGHTS.none).toHaveLength(0);
    expect(verifySigner(signer('none'), 'INFO')).toBe(false);
    expect(verifySigner(signer('none'), 'TOPOLOGY')).toBe(false);
  });

  it('only the authority may originate alerts and declarations', () => {
    expect(canOriginate('citizen', 'OFFICIAL_ALERT')).toBe(false);
    expect(canOriginate('citizen', 'MODE_DECLARATION')).toBe(false);
    expect(canOriginate('relay', 'OFFICIAL_ALERT')).toBe(false);
    expect(verifySigner(signer('authority'), 'MODE_DECLARATION')).toBe(true);
    expect(verifySigner(signer('authority'), 'OFFICIAL_ALERT')).toBe(true);
    expect(canOriginate('authority', 'BORROW')).toBe(false);
  });
});
