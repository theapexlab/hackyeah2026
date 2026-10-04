import type { TravelMode } from './node';

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
 * Street traffic in generated worlds: at any moment a share of the phones walk, cycle and
 * drive. A traveller who arrives stops and lingers, then rejoins in whichever mode needs
 * someone (or stays put for good), so the shares hold while the people change. Speeds are
 * real-world km/h; EngineConfig.tickSeconds turns them into metres per tick.
 */
export interface MobilityConfig {
  readonly enabled: boolean;
  /** Share of the generated mobiles travelling in each mode at any moment. */
  readonly shares: Readonly<Record<TravelMode, number>>;
  /** Speed per mode in km/h as [min, max]; every trip draws its speed from the range. */
  readonly speedKmh: Readonly<Record<TravelMode, readonly [number, number]>>;
}

/** Part of a MobilityConfig; shares and speeds merge per mode. */
export interface MobilityPatch {
  readonly enabled?: boolean;
  readonly shares?: Partial<Record<TravelMode, number>>;
  readonly speedKmh?: Partial<Record<TravelMode, readonly [number, number]>>;
}

/** Engine behaviour knobs, in ticks unless stated. Changeable at runtime via SetConfig. */
export interface EngineConfig {
  /**
   * Simulated seconds one tick stands for (0.2: playing at 1x with 200 ms ticks is real
   * time). Movement and the durations of stops use it; protocol timings stay in ticks.
   */
  readonly tickSeconds: number;
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
  mobiles: 500,
  routers: 1200,
  gateways: 1,
  range: { mobile: 50, router: 100, gateway: 200 },
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
  tickSeconds: 0.2,
  mobility: {
    enabled: false,
    shares: { foot: 0.2, bike: 0.2, car: 0.2 },
    speedKmh: { foot: [2, 3], bike: [10, 10], car: [50, 50] },
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

/** Part of an EngineConfig; mobility may be partial too (see mergeMobility). */
export type EngineConfigPatch = Omit<Partial<EngineConfig>, 'mobility'> & {
  readonly mobility?: MobilityPatch;
};

/** Mobility settings with a patch applied: flags replaced, shares and speeds merged per mode. */
export function mergeMobility(base: MobilityConfig, patch?: MobilityPatch): MobilityConfig {
  return {
    enabled: patch?.enabled ?? base.enabled,
    shares: { ...base.shares, ...(patch?.shares ?? {}) },
    speedKmh: { ...base.speedKmh, ...(patch?.speedKmh ?? {}) },
  };
}

/** An engine config with a patch applied (mobility merged per mode). */
export function patchEngineConfig(base: EngineConfig, patch?: EngineConfigPatch): EngineConfig {
  return { ...base, ...patch, mobility: mergeMobility(base.mobility, patch?.mobility) };
}

/** Merge a partial engine config over the defaults (mobility merged per mode). */
export function resolveEngineConfig(partial?: EngineConfigPatch): EngineConfig {
  return patchEngineConfig(DEFAULT_ENGINE_CONFIG, partial);
}
