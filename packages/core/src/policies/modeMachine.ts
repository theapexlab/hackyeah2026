/**
 * Mode state machine.
 * Implements diagram 03: Peace/L1/L2/L3 transitions with hysteresis and automation.
 * Local automation reaches L1 at most; L2/L3 only via signed declaration.
 * Leaving L2/L3 (all-clear or expiry) steps down through L1, never straight to peace.
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

const isEmergencyLevel = (level: Mode) => level === 'L2' || level === 'L3';

/**
 * Evaluate a node's mode for this tick. Updates WAN counters and clears an expired declaration
 * (arming the L1 step-down hold); returns the new (mode, source) or null when nothing changes.
 */
export function evaluateMode(node: Node, ctx: ModeEvalContext): ModeTransition | null {
  if (node.wanUp) {
    node.ticksWithWan++;
    node.ticksWithoutWan = 0;
  } else {
    node.ticksWithoutWan++;
    node.ticksWithWan = 0;
  }

  if (node.declared && ctx.tick >= node.declared.untilTick) {
    if (isEmergencyLevel(node.declared.level)) {
      node.l1HoldUntilTick = ctx.tick + ctx.l3StepDownHoldTicks;
    }
    node.declared = null;
  }

  const target = nextState(node, ctx);
  if (target.newMode === node.mode && target.source === node.modeSource) return null;
  return target;
}

function nextState(node: Node, ctx: ModeEvalContext): ModeTransition {
  if (node.declared) return { newMode: node.declared.level, source: 'declared' };
  if (ctx.tick < node.l1HoldUntilTick) return { newMode: 'L1', source: 'stepdown' };
  if (node.ticksWithoutWan >= ctx.localModeAfterTicks) return { newMode: 'L1', source: 'local' };
  // Hysteresis: once in L1, only a stable WAN window returns to PEACE.
  if (node.mode === 'L1' && node.ticksWithWan < ctx.wanStableTicks) {
    return { newMode: 'L1', source: 'local' };
  }
  return { newMode: 'PEACE', source: 'local' };
}

/**
 * Apply a delivered authority declaration or all-clear. The only path into L2/L3.
 * The mode itself changes on the next tick's evaluation.
 */
export function applyDeclaration(
  node: Node,
  level: 'L1' | 'L2' | 'L3' | 'ALL_CLEAR',
  untilTick: number,
  tick: number,
  declarationId: string,
  stepDownHoldTicks: number,
): void {
  if (level === 'ALL_CLEAR') {
    if (node.declared ? isEmergencyLevel(node.declared.level) : isEmergencyLevel(node.mode)) {
      // delivered mid-tick: the mode changes next tick, so +1 keeps L1 for exactly the hold
      node.l1HoldUntilTick = tick + stepDownHoldTicks + 1;
    }
    node.declared = null;
    return;
  }
  if (untilTick <= tick) return;
  node.declared = { level, untilTick, declarationId };
}
