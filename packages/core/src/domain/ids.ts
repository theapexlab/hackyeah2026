import type { NodeKind } from './node';

declare const NodeIdBrand: unique symbol;
declare const MessageIdBrand: unique symbol;

/** Branded node identifier, e.g. 'm-007', 'r-012', 'g-01' or 'authority'. */
export type NodeId = string & { readonly [NodeIdBrand]: true };
/** Branded message identifier: '<originId>#<seq>'. */
export type MessageId = string & { readonly [MessageIdBrand]: true };

/** Brand a raw string as a NodeId. The only place this cast is allowed. */
export const nodeId = (s: string): NodeId => s as NodeId;
/** Brand a raw string as a MessageId. The only place this cast is allowed. */
export const messageId = (s: string): MessageId => s as MessageId;

/** The virtual Authority node id. It has no position and no edges. */
export const AUTHORITY_ID: NodeId = nodeId('authority');

const PREFIX: Readonly<Record<NodeKind, { prefix: string; width: number }>> = {
  mobile: { prefix: 'm', width: 3 },
  router: { prefix: 'r', width: 3 },
  gateway: { prefix: 'g', width: 2 },
};

/** Zero-padded node id so lexical order equals creation order: m-007, r-012, g-01. */
export function formatNodeId(kind: NodeKind, index: number): NodeId {
  const { prefix, width } = PREFIX[kind];
  return nodeId(`${prefix}-${String(index).padStart(width, '0')}`);
}

/** Message id derived from origin and the global sequence number. */
export function makeMessageId(originId: NodeId, seq: number): MessageId {
  return messageId(`${originId}#${seq}`);
}

/** True when the id belongs to the virtual Authority. */
export function isAuthorityId(id: NodeId): boolean {
  return id === AUTHORITY_ID;
}
