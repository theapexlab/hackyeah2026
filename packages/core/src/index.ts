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
  TravelMode,
  TripPhase,
  WalkState,
  Waypoint,
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
export type { AuthorityMessageOptions } from './engine/authority';
export { createAuthorityMessage, inject, isAuthorityBound, uplink } from './engine/authority';
export {
  applyCommand,
  CANNED_REQUESTS,
  originRejection,
  REQUEST_CATEGORY,
} from './engine/commands';
export { createEngine, createEngineFromNodes, SimEngine } from './engine/engine';
export {
  advanceWalker,
  assignTravellers,
  moveTravellers,
  PARK_CHANCE,
  resetTrip,
  STAY_CHANCE,
  TRIP_BAND_M,
  travelTargets,
} from './engine/mobility';
export type { OriginateOptions } from './engine/originate';
export { createMessage, queueOrigination } from './engine/originate';
export { expireStores, flushStores, forwardOrStore } from './engine/routing';
export type { SnapshotCache } from './engine/snapshot';
export {
  buildNodeDetail,
  buildSnapshot,
  createSnapshotCache,
  eventTouchesNode,
  MESSAGE_VIEW_CAP,
} from './engine/snapshot';
export type {
  ActiveDeclaration,
  AdjacencyState,
  AuthorityState,
  EngineState,
  TransitRingSlot,
} from './engine/state';
export {
  addSeen,
  createState,
  globalMode,
  logEvent,
  nextPacketSeq,
  recordDrop,
  resetWorld,
  TRANSIT_RING_SIZE,
} from './engine/state';
export { rebuildAdjacency, refreshTopology, runTick, updateLiveness } from './engine/tick';
export type { AcceptEligibility, AcceptRejection } from './engine/transactions';
export {
  accept,
  acceptEligibility,
  closeExpiredTransactions,
  closeTransaction,
  eligibleResponders,
  onCloseSeen,
  onResponseAtRequester,
  openTransaction,
  openTransactionsOldestFirst,
  pickResponder,
  pruneExpiredRequestViews,
  requestExpired,
} from './engine/transactions';
export type { NodeInit } from './engine/world';
export { compareNodeId, createNode, generateWorld, sortNodes } from './engine/world';
export type { Adjacency } from './graph/adjacency';
export { buildAdjacency, edgesEqual } from './graph/adjacency';
export { boundedBfs } from './graph/bfs';
export type { Components } from './graph/components';
export { connectedComponents } from './graph/components';
export { dist2, distance, insideCircle, qualityBucket } from './graph/distance';
export type { TickMetrics, TopologyMetrics } from './metrics/metrics';
export { MetricsState, medianOfHistogram } from './metrics/metrics';
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
export type { DecisionContext, Verdict } from './policies/forwarding';
export { decide, decisionContextFor } from './policies/forwarding';
export type { ModeEvaluation } from './policies/modeMachine';
export { applyAllClear, applyDeclaration, evaluateMode } from './policies/modeMachine';
export { canOriginate, ORIGIN_RIGHTS, verifySigner } from './policies/trust';
export { Prng } from './prng';
export type { Bbox, SegmentProjection } from './terrain/geometry';
export {
  distanceToPolygonBoundary,
  nearestPointOnSegment,
  pointInPolygon,
  polygonBbox,
  polygonCentroid,
  segmentIntersection,
  segmentIntersectsPolygon,
  segmentsCross,
} from './terrain/geometry';
export type { GraphProjection } from './terrain/graph';
export {
  buildStreetGraph,
  DEFAULT_SNAP_M,
  nearestPointOnGraph,
  randomPointInPolygon,
  randomPointOnStreets,
  shortestPath,
} from './terrain/graph';
export {
  buildTerrain,
  computeParkGates,
  PARK_GATE_RADIUS_M,
  resolveTerrain,
} from './terrain/index';
export {
  KRAKOW_HEIGHT,
  KRAKOW_SEED,
  KRAKOW_TERRAIN_ID,
  KRAKOW_WIDTH,
  krakowTerrainSource,
} from './terrain/krakow';
export {
  distanceToParks,
  distanceToStreets,
  inPark,
  inWater,
  isPlaceable,
  isRouterSpot,
  nearestRouterSpot,
  placeNode,
  placeOnLand,
  STREET_TOLERANCE_M,
} from './terrain/placement';
export { proceduralTerrain } from './terrain/procedural';
export type {
  GraphEdge,
  Polygon,
  Polyline,
  Pt,
  StreetGraph,
  Terrain,
  TerrainLabel,
  TerrainSource,
} from './terrain/types';
