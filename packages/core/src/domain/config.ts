/** Radio range in metres per node kind. */
export interface RangeConfig {
  readonly mobile: number;
  readonly router: number;
  readonly gateway: number;
}

/** Parameters that generate a world. Changing any of them means a new world. */
export interface WorldConfig {
  readonly seed: number;
  /** Area width in metres. */
  readonly width: number;
  /** Area height in metres. */
  readonly height: number;
  readonly mobiles: number;
  readonly routers: number;
  readonly gateways: number;
  readonly range: RangeConfig;
  /** Fraction of mobiles with credential 'none' (unregistered, relay-only). */
  readonly unregisteredFraction: number;
  /** Fraction of routers that stay alive when the grid is down. */
  readonly batteryBackedRouterFraction: number;
  readonly gatewayBackhaul: 'satellite' | 'fibre';
}

/**
 * Street traffic in generated worlds: at any moment a share of the phones walk and a share
 * drive. A traveller who arrives stops and lingers, then rejoins in whichever mode needs
 * someone (or stays put for good), so the shares hold while the people change.
 */
export interface MobilityConfig {
  readonly enabled: boolean;
  /** Metres a walker covers per tick (each trip scales it by a 0.7-1.3 pace). */
  readonly stepMetres: number;
  /** A car covers this many walker steps per tick. */
  readonly carSpeedFactor: number;
  /** Share of the generated mobiles on foot at any moment. */
  readonly walkerFraction: number;
  /** Share of the generated mobiles driving at any moment. */
  readonly driverFraction: number;
}

/** Engine behaviour knobs; all in ticks. Changeable at runtime via SetConfig. */
export interface EngineConfig {
  /** Ticks without WAN before a node enters L1 locally. */
  readonly localModeAfterTicks: number;
  /** Ticks of stable WAN before a local L1 node returns to PEACE (hysteresis). */
  readonly wanStableTicks: number;
  /** Ticks a node holds L1 after leaving L3 (never straight to PEACE). */
  readonly l3StepDownHoldTicks: number;
  /** Default lifetime of a declaration. */
  readonly declarationDurationTicks: number;
  /** Max forwards per node per tick; excess lowest-priority packets drop as CONGESTION. */
  readonly nodeCapacityPerTick: number;
  readonly mobility: MobilityConfig;
  /** Max remembered message ids per node (FIFO eviction). */
  readonly seenCap: number;
  /** Max events kept in Snapshot.recentEvents. */
  readonly recentEventsCap: number;
  /**
   * Max events kept in the engine's event log (FIFO, trimmed every tick);
   * Number.POSITIVE_INFINITY disables the cap.
   */
  readonly eventLogCap: number;
  /** When true the requester closes a request on the first accepted response. */
  readonly autoConfirm: boolean;
}

export const DEFAULT_WORLD_CONFIG: WorldConfig = {
  seed: 42,
  width: 2200,
  height: 1300,
  mobiles: 200,
  routers: 120,
  gateways: 4,
  range: { mobile: 100, router: 200, gateway: 220 },
  unregisteredFraction: 0.1,
  batteryBackedRouterFraction: 0.1,
  gatewayBackhaul: 'satellite',
};

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  localModeAfterTicks: 5,
  wanStableTicks: 8,
  l3StepDownHoldTicks: 5,
  declarationDurationTicks: 300,
  nodeCapacityPerTick: 32,
  mobility: {
    enabled: false,
    stepMetres: 2,
    carSpeedFactor: 20,
    walkerFraction: 0.1,
    driverFraction: 0.1,
  },
  seenCap: 10_000,
  recentEventsCap: 500,
  eventLogCap: 100_000,
  autoConfirm: true,
};

/** Merge a partial world config over the defaults (range merged one level deep). */
export function resolveWorldConfig(partial?: Partial<WorldConfig>): WorldConfig {
  return {
    ...DEFAULT_WORLD_CONFIG,
    ...partial,
    range: { ...DEFAULT_WORLD_CONFIG.range, ...(partial?.range ?? {}) },
  };
}

/** Merge a partial engine config over the defaults (mobility merged one level deep). */
export function resolveEngineConfig(partial?: Partial<EngineConfig>): EngineConfig {
  return {
    ...DEFAULT_ENGINE_CONFIG,
    ...partial,
    mobility: { ...DEFAULT_ENGINE_CONFIG.mobility, ...(partial?.mobility ?? {}) },
  };
}
