/**
 * Configuration for world generation and engine behavior.
 */

export interface WorldConfig {
  seed: number | string;
  width: number;
  height: number;
  mobiles: number;
  routers: number;
  gateways: number;
  range: {
    mobile: number;
    router: number;
    gateway: number;
  };
  unregisteredFraction: number;
  batteryBackedRouterFraction: number;
  gatewayBackhaul: 'satellite' | 'fibre';
}

export interface EngineConfig {
  localModeAfterTicks: number;
  wanStableTicks: number;
  l3StepDownHoldTicks: number;
  declarationDurationTicks: number;
  nodeCapacityPerTick: number;
  mobility: {
    enabled: boolean;
    stepMetres: number;
  };
  seenCap: number;
  recentEventsCap: number;
  /** Oldest events are discarded beyond this (long demos); the command log is never trimmed. */
  eventLogCap: number;
  autoConfirm: boolean;
}

export const DEFAULT_WORLD_CONFIG: WorldConfig = {
  seed: 42,
  width: 1000,
  height: 700,
  mobiles: 40,
  routers: 25,
  gateways: 2,
  range: {
    mobile: 60,
    router: 120,
    gateway: 150,
  },
  unregisteredFraction: 0.1,
  batteryBackedRouterFraction: 0.2,
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
    stepMetres: 4,
  },
  seenCap: 10_000,
  recentEventsCap: 500,
  eventLogCap: 200_000,
  autoConfirm: true,
};
