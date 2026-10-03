/**
 * Trust verification (stub).
 * In reality, this would verify signatures and certificates.
 * For the demo, we just check the signer.valid flag.
 */

import type { Signer } from '../domain/message';

export function isTrusted(signer: Signer): boolean {
  return signer.valid;
}
