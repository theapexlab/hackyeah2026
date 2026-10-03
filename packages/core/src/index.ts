/**
 * @pomoc/core: simulation engine and type contract.
 * Pure TypeScript, zero React, deterministic PRNG.
 */

export type { Command } from './domain/commands';
export {
  DEFAULT_ENGINE_CONFIG,
  DEFAULT_WORLD_CONFIG,
  type EngineConfig,
  type WorldConfig,
} from './domain/config';
export type {
  DropReason,
  SimEvent,
  TransitEvent,
} from './domain/events';
// Domain types
export {
  AUTHORITY_ID,
  formatMessageId,
  formatNodeId,
  type MessageId,
  messageIdFromString,
  type NodeId,
  nodeIdFromString,
} from './domain/ids';
export type {
  Circle,
  Message,
  Packet,
  Payload,
  Signer,
} from './domain/message';
export {
  CREDENTIAL_ORIGINS,
  type CredentialKind,
  canOriginate,
  hopLimitFor,
  type MessageClass,
  MODE_LABELS,
  MODE_POLICIES,
  type Mode,
  type ModePolicy,
  PRIORITY_RANK,
} from './domain/mode';

export type {
  BackhaulKind,
  Credential,
  MessageView,
  Node,
  NodeDetail,
  NodeKind,
  NodeView,
} from './domain/node';
export type {
  ClassMetricsView,
  EdgeView,
  MetricsView,
  Snapshot,
} from './domain/snapshot';
export type {
  Declaration,
  Transaction,
  TransactionStatus,
} from './domain/transaction';
// Engine
export {
  createEngine,
  SimEngine,
  type TickResult,
  type TimedCommand,
} from './engine/engine';
// PRNG
export { createPrng, type Prng } from './prng';
