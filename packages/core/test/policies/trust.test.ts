/**
 * Trust verification tests
 */

import { describe, expect, it } from 'vitest';
import { isTrusted } from '../../src/policies/trust';

describe('Trust', () => {
  it('valid signer is trusted', () => {
    expect(isTrusted({ nodeId: 'm-000' as any, credentialKind: 'citizen', valid: true })).toBe(
      true,
    );
  });

  it('invalid signer is not trusted', () => {
    expect(isTrusted({ nodeId: 'm-000' as any, credentialKind: 'citizen', valid: false })).toBe(
      false,
    );
  });
});
