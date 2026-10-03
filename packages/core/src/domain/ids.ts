/**
 * Branded node and message IDs for type safety.
 * Ids are zero-padded (m-007, r-012, g-01) so lexical order == creation order.
 * Casts only allowed in this module.
 */

export type NodeId = string & { readonly __brand: 'NodeId' };
export type MessageId = string & { readonly __brand: 'MessageId' };

export const AUTHORITY_ID = 'a-00' as NodeId;

export function formatNodeId(kind: 'mobile' | 'router' | 'gateway', index: number): NodeId {
  const prefix = kind[0];
  const padded = String(index).padStart(3, '0');
  return `${prefix}-${padded}` as NodeId;
}

export function formatMessageId(originId: NodeId, seq: number): MessageId {
  const padded = String(seq).padStart(6, '0');
  return `${originId}#${padded}` as MessageId;
}

export function nodeIdFromString(s: string): NodeId {
  return s as NodeId;
}

export function messageIdFromString(s: string): MessageId {
  return s as MessageId;
}
