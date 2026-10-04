import { describe, expect, it } from 'vitest';
import type * as core from '../src/index';
import {
  AUTHORITY_ID,
  CANNED_REQUESTS,
  canOriginate,
  classAllowedToOriginate,
  classAllowedToRelay,
  closeExpiredTransactions,
  comparePriority,
  createEngine,
  createEngineFromNodes,
  DEFAULT_ENGINE_CONFIG,
  DEFAULT_WORLD_CONFIG,
  DROP_REASONS,
  decide,
  decisionContextFor,
  distance,
  emptyMetrics,
  evaluateMode,
  formatNodeId,
  hopLimitFor,
  insideCircle,
  isAuthorityId,
  isEmergency,
  isPriced,
  KRAKOW_SEED,
  KRAKOW_TERRAIN_ID,
  MESSAGE_CLASSES,
  MESSAGE_VIEW_CAP,
  MODE_ORDER,
  MODE_POLICIES,
  makeMessageId,
  maxMode,
  messageId,
  modeRank,
  moveTravellers,
  nearestPointOnGraph,
  nodeId,
  PRIORITY_RANK,
  Prng,
  placeOnLand,
  priorityOf,
  pruneExpiredRequestViews,
  REQUEST_CATEGORY,
  requestExpired,
  resolveEngineConfig,
  resolveTerrain,
  resolveWorldConfig,
  SimEngine,
  TRANSIT_RING_SIZE,
  toMessageView,
  ttlFor,
  UNBOUNDED_CLASSES,
  verifySigner,
} from '../src/index';

/** Runtime symbols the UI track builds against (plan A4 + the stage 3 list). */
const RUNTIME_EXPORTS = {
  SimEngine,
  createEngine,
  createEngineFromNodes,
  AUTHORITY_ID,
  formatNodeId,
  isAuthorityId,
  nodeId,
  messageId,
  makeMessageId,
  DEFAULT_WORLD_CONFIG,
  DEFAULT_ENGINE_CONFIG,
  resolveWorldConfig,
  resolveEngineConfig,
  MODE_POLICIES,
  MODE_ORDER,
  PRIORITY_RANK,
  DROP_REASONS,
  MESSAGE_CLASSES,
  UNBOUNDED_CLASSES,
  isEmergency,
  modeRank,
  maxMode,
  hopLimitFor,
  ttlFor,
  classAllowedToOriginate,
  classAllowedToRelay,
  comparePriority,
  priorityOf,
  isPriced,
  canOriginate,
  verifySigner,
  decide,
  decisionContextFor,
  evaluateMode,
  emptyMetrics,
  toMessageView,
  Prng,
  CANNED_REQUESTS,
  REQUEST_CATEGORY,
  MESSAGE_VIEW_CAP,
  TRANSIT_RING_SIZE,
  distance,
  insideCircle,
  requestExpired,
  pruneExpiredRequestViews,
  closeExpiredTransactions,
  KRAKOW_SEED,
  KRAKOW_TERRAIN_ID,
  resolveTerrain,
  nearestPointOnGraph,
  placeOnLand,
  moveTravellers,
};

describe('public surface (@pomoc/core index)', () => {
  it('exports every runtime symbol the UI needs', () => {
    for (const [name, value] of Object.entries(RUNTIME_EXPORTS)) {
      expect(value, name).toBeDefined();
    }
    expect(Object.keys(RUNTIME_EXPORTS).length).toBeGreaterThanOrEqual(40);
  });

  it('the exported types describe what the engine returns', () => {
    const engine: core.SimEngine = createEngine(DEFAULT_WORLD_CONFIG);
    const snapshot: core.Snapshot = engine.getSnapshot();
    const node: core.NodeView | undefined = snapshot.nodes[0];
    const edge: core.EdgeView | undefined = snapshot.edges[0];
    const message: core.MessageView | undefined = snapshot.messages[0];
    const transit: core.TransitEvent | undefined = snapshot.transits[0];
    const event: core.SimEvent | undefined = snapshot.recentEvents[0];
    const detail: core.NodeDetail = engine.getNodeDetail(AUTHORITY_ID);
    const mode: core.Mode = snapshot.globalMode;
    const world: core.WorldConfig = engine.world;
    const config: core.EngineConfig = engine.config;
    const command: core.Command = { type: 'SetCellsUp', up: false };
    const kind: core.NodeKind = node?.kind ?? 'mobile';
    const credential: core.CredentialKind = node?.credentialKind ?? 'citizen';
    const cls: core.MessageClass = MESSAGE_CLASSES[0];
    const reason: core.DropReason = DROP_REASONS[0];

    const total =
      DEFAULT_WORLD_CONFIG.mobiles + DEFAULT_WORLD_CONFIG.routers + DEFAULT_WORLD_CONFIG.gateways;
    const terrain: core.Terrain = snapshot.terrain;
    expect(snapshot.nodes).toHaveLength(total);
    expect(snapshot.world.nodeCount).toBe(total);
    expect(world.seed).toBe(KRAKOW_SEED);
    expect([snapshot.world.width, snapshot.world.height]).toEqual([2200, 1300]);
    expect(terrain.id).toBe(KRAKOW_TERRAIN_ID);
    expect(node?.id).toBe(formatNodeId('gateway', 1));
    expect(edge).toBeDefined();
    expect(message).toBeUndefined();
    expect(transit).toBeUndefined();
    expect(event?.type).toBe('ADJACENCY');
    expect(detail.id).toBe('authority');
    expect(mode).toBe('PEACE');
    expect(world.seed).toBe(42);
    expect(config.mobility.enabled).toBe(false);
    expect(config.eventLogCap).toBe(100_000);
    expect(command.type).toBe('SetCellsUp');
    expect(['mobile', 'router', 'gateway']).toContain(kind);
    expect(['citizen', 'relay', 'authority', 'none']).toContain(credential);
    expect(cls).toBe('LEND');
    expect(reason).toBe('UNVERIFIABLE');
  });

  it('policy helpers agree with the mode table', () => {
    expect(MODE_ORDER).toEqual(['PEACE', 'L1', 'L2', 'L3']);
    expect(isEmergency('PEACE')).toBe(false);
    expect(isEmergency('L1')).toBe(true);
    expect(classAllowedToOriginate(MODE_POLICIES.L3, 'INFO')).toBe(false);
    expect(classAllowedToOriginate(MODE_POLICIES.PEACE, 'CHECK_IN')).toBe(false);
    expect(classAllowedToRelay(MODE_POLICIES.PEACE, 'CHECK_IN')).toBe(true);
    expect(PRIORITY_RANK.LIFE_CRITICAL).toBe(0);
    expect(DROP_REASONS).toHaveLength(11);
    expect(MESSAGE_CLASSES).toHaveLength(12);
    expect(formatNodeId('mobile', 7)).toBe('m-007');
    expect(isAuthorityId(AUTHORITY_ID)).toBe(true);
  });
});
