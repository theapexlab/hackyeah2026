/**
 * Test helpers: world builders and simulation utilities.
 */

import type { WorldConfig } from '../src/domain/config';
import { createEngine, type SimEngine } from '../src/engine/engine';

/**
 * Create a linear world: n nodes in a line, equally spaced.
 */
export function lineWorld(n: number, spacing: number = 100): WorldConfig {
  return {
    seed: 42,
    width: n * spacing + 200,
    height: 200,
    mobiles: n,
    routers: 0,
    gateways: 0,
    range: { mobile: spacing * 1.5, router: 200, gateway: 200 },
    unregisteredFraction: 0,
    batteryBackedRouterFraction: 0,
    gatewayBackhaul: 'satellite',
  };
}

/**
 * Create a triangle world: three nodes at the vertices of a triangle.
 */
export function triangleWorld(): WorldConfig {
  return {
    seed: 42,
    width: 1000,
    height: 1000,
    mobiles: 3,
    routers: 0,
    gateways: 0,
    range: { mobile: 500, router: 200, gateway: 200 },
    unregisteredFraction: 0,
    batteryBackedRouterFraction: 0,
    gatewayBackhaul: 'satellite',
  };
}

/**
 * Create a two-islands world: two routers with mobiles, separated by a gap.
 */
export function twoIslandsWorld(): WorldConfig {
  return {
    seed: 42,
    width: 1000,
    height: 1000,
    mobiles: 10,
    routers: 2,
    gateways: 1,
    range: { mobile: 100, router: 150, gateway: 200 },
    unregisteredFraction: 0,
    batteryBackedRouterFraction: 0,
    gatewayBackhaul: 'satellite',
  };
}

/**
 * Step the engine until a predicate is true, or maxTicks is reached.
 */
export function runUntil(
  engine: SimEngine,
  predicate: (engine: SimEngine) => boolean,
  maxTicks: number = 1000,
): number {
  for (let i = 0; i < maxTicks; i++) {
    if (predicate(engine)) {
      return i;
    }
    engine.step(1);
  }
  return maxTicks;
}

/**
 * Helper: assert lists are equal
 */
export function assertArraysEqual<T>(actual: T[], expected: T[], msg: string = ''): void {
  if (actual.length !== expected.length) {
    throw new Error(`${msg}: length mismatch. Expected ${expected.length}, got ${actual.length}`);
  }
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] !== expected[i]) {
      throw new Error(`${msg}: element ${i} mismatch. Expected ${expected[i]}, got ${actual[i]}`);
    }
  }
}
