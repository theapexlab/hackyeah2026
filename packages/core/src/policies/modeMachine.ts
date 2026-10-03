/**
 * Mode state machine.
 * Implements diagram 03: Peace/L1/L2/L3 transitions with hysteresis and automation.
 */

import type { Mode } from '../domain/mode';
import type { Node } from '../domain/node';

export interface ModeTransition {
  newMode: Mode;
  source: 'local' | 'declared' | 'stepdown';
}

export interface ModeEvalContext {
  tick: number;
  localModeAfterTicks: number;
  wanStableTicks: number;
  l3StepDownHoldTicks: number;
}

/**
 * Evaluate the next mode for a node based on its current state and context.
 * Rules from diagram 03 and FR-MODE-01..11.
 */
export function evaluateMode(node: Node, ctx: ModeEvalContext): ModeTransition | null {
  // 1. Declared mode takes precedence
  if (node.declared && ctx.tick < node.declared.untilTick) {
    // Already in declared mode
    if (node.mode === node.declared.level && node.modeSource === 'declared') {
      return null; // No change
    }
    // Transition to declared mode
    return {
      newMode: node.declared.level,
      source: 'declared',
    };
  }

  // 2. Clear expired declaration
  if (node.declared && ctx.tick >= node.declared.untilTick) {
    const wasL3 = node.declared.level === 'L3';
    node.declared = null;

    // If it was L3, we step down through L1
    if (wasL3) {
      node.l1HoldUntilTick = ctx.tick + ctx.l3StepDownHoldTicks;
      return {
        newMode: 'L1',
        source: 'stepdown',
      };
    }

    // Otherwise fall through to local evaluation
  }

  // 3. L3 step-down hold
  if (ctx.tick < node.l1HoldUntilTick) {
    if (node.mode !== 'L1') {
      return {
        newMode: 'L1',
        source: 'stepdown',
      };
    }
    return null;
  }

  // 4. Update WAN counters
  if (node.wanUp) {
    node.ticksWithWan++;
    node.ticksWithoutWan = 0;
  } else {
    node.ticksWithoutWan++;
    node.ticksWithWan = 0;
  }

  // 5. Local mode automation
  if (node.ticksWithoutWan >= ctx.localModeAfterTicks) {
    // No WAN for long enough: enter L1
    if (node.mode !== 'L1') {
      node.ticksWithoutWan = ctx.localModeAfterTicks; // Clamp
      return {
        newMode: 'L1',
        source: 'local',
      };
    }
  }

  // 6. Exit L1 after WAN is stable
  if (node.mode === 'L1' && node.modeSource === 'local') {
    if (node.ticksWithWan >= ctx.wanStableTicks) {
      return {
        newMode: 'PEACE',
        source: 'local',
      };
    }
  }

  // No transition
  return null;
}

/**
 * Apply a mode declaration from an authority message.
 */
export function applyDeclaration(
  node: Node,
  level: 'L1' | 'L2' | 'L3' | 'ALL_CLEAR',
  untilTick: number,
  tick: number,
): void {
  if (level === 'ALL_CLEAR') {
    node.declared = null;
    // If we were in L3, step down through L1
    if (node.mode === 'L3') {
      node.l1HoldUntilTick = tick + 5; // Standard hold time
    }
  } else {
    node.declared = {
      level,
      untilTick,
      declarationId: `decl-${tick}`,
    };
  }
}
