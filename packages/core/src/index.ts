// @pomoc/core public surface. Pure TypeScript; nothing here touches React or the DOM.

export type { AutoRespondStrategy, Command, CommandType } from './domain/commands';
export type { EngineConfig, MobilityConfig, RangeConfig, WorldConfig } from './domain/config';
export {
  DEFAULT_ENGINE_CONFIG,
  DEFAULT_WORLD_CONFIG,
  resolveEngineConfig,
  resolveWorldConfig,
} from './domain/config';
export type { DropReason, SimEvent, SimEventType, TransitEvent, TransitVia } from './domain/events';
export { DROP_REASONS } from './domain/events';
export type { MessageId, NodeId } from './domain/ids';
export {
  AUTHORITY_ID,
  formatNodeId,
  isAuthorityId,
  makeMessageId,
  messageId,
  nodeId,
} from './domain/ids';
export type {
  CheckInStatus,
  Circle,
  DeclarationLevel,
  Message,
  MessageClass,
  MessageView,
  Packet,
  Payload,
  PayloadKind,
  RequestPayload,
  Signer,
  StoredEntry,
} from './domain/message';
export { MESSAGE_CLASSES, toMessageView } from './domain/message';
export type { Emission, Mode, ModePolicy, PortalWrite } from './domain/mode';
export {
  hopLimitFor,
  isEmergency,
  MODE_ORDER,
  MODE_POLICIES,
  maxMode,
  modeRank,
  ttlFor,
  UNBOUNDED_CLASSES,
} from './domain/mode';
export type {
  Backhaul,
  Credential,
  CredentialKind,
  DeclaredLevel,
  DeclaredMode,
  InboxEntryView,
  ModeSource,
  Node,
  NodeDetail,
  NodeKind,
  NodeView,
  StoreEntryView,
} from './domain/node';
export type {
  AuthorityReceipt,
  AuthorityView,
  ClassMetrics,
  CommandLogEntry,
  DeclarationView,
  EdgeQuality,
  EdgeView,
  MetricsView,
  Snapshot,
  TickResult,
  WorldView,
} from './domain/snapshot';
export { emptyMetrics } from './domain/snapshot';
export type {
  RequestViewEntry,
  RequestViewStatus,
  Transaction,
  TransactionStatus,
  TransactionView,
} from './domain/transaction';
export { createEngine, SimEngine } from './engine/engine';
export {
  AUTHORITY_CLASSES,
  CITIZEN_REQUEST_CLASSES,
  COMMERCE_CLASSES,
  classAllowedToOriginate,
  classAllowedToRelay,
  comparePriority,
  isAuthorityClass,
  isPriced,
  isRelayOnlyClass,
  PRIORITY_RANK,
  priorityOf,
  RELAY_ONLY_CLASSES,
} from './policies/classes';
export { canOriginate, ORIGIN_RIGHTS, verifySigner } from './policies/trust';
export { Prng } from './prng';
