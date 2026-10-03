import type { EngineConfig } from '../domain/config';
import type { MessageId } from '../domain/ids';
import type { Mode } from '../domain/mode';
import type { DeclaredLevel, ModeSource, Node } from '../domain/node';

/** Result of one mode evaluation; the engine writes it to node.mode / node.modeSource. */
export interface ModeEvaluation {
  readonly mode: Mode;
  readonly source: ModeSource;
}

/**
 * Mode state machine (docs/diagrams/03-mode-state-machine.mmd, FR-MODE-01..11),
 * evaluated once per tick per alive node, AFTER the engine has updated
 * `ticksWithWan` / `ticksWithoutWan` and BEFORE the inbox is processed.
 *
 *   declared && tick < untilTick          -> declared level, 'declared'   (FR-MODE-02/03)
 *   declared expired                      -> clear it; if it was L3, hold L1 for
 *                                            cfg.l3StepDownHoldTicks        (FR-MODE-11)
 *   tick < l1HoldUntilTick                -> L1, 'stepdown'
 *   ticksWithoutWan >= localModeAfterTicks -> L1, 'local'                  (FR-MODE-01)
 *   mode is L1 && ticksWithWan >= wanStableTicks -> PEACE, 'local'         (FR-MODE-04)
 *   mode is L1 otherwise                  -> L1, 'local'   (hysteresis)
 *   else                                  -> PEACE, 'local'
 *
 * MUTATES the node on declaration expiry only: sets `node.declared = null` and, when
 * the expired level was L3, `node.l1HoldUntilTick = tick + cfg.l3StepDownHoldTicks`.
 * It never writes `node.mode`, `node.modeSource` or the WAN counters.
 *
 * Local automation can only produce PEACE or L1; L2 and L3 exist only through
 * `node.declared` (FR-MODE-09).
 */
export function evaluateMode(node: Node, cfg: EngineConfig, tick: number): ModeEvaluation {
  const declared = node.declared;
  if (declared !== null) {
    if (tick < declared.untilTick) return { mode: declared.level, source: 'declared' };
    node.declared = null;
    if (declared.level === 'L3') node.l1HoldUntilTick = tick + cfg.l3StepDownHoldTicks;
  }
  if (tick < node.l1HoldUntilTick) return { mode: 'L1', source: 'stepdown' };
  if (node.ticksWithoutWan >= cfg.localModeAfterTicks) return { mode: 'L1', source: 'local' };
  if (node.mode === 'L1') {
    if (node.ticksWithWan >= cfg.wanStableTicks) return { mode: 'PEACE', source: 'local' };
    return { mode: 'L1', source: 'local' };
  }
  return { mode: 'PEACE', source: 'local' };
}

/**
 * Apply a verified MODE_DECLARATION to a node. The only path to L2 / L3.
 * Replaces any previous declaration; takes effect at the next evaluateMode().
 */
export function applyDeclaration(
  node: Node,
  level: DeclaredLevel,
  untilTick: number,
  declarationId: MessageId,
): void {
  node.declared = { level, untilTick, declarationId };
}

/**
 * Apply a verified ALL_CLEAR: clears the declaration. If the node was in L3 (by its
 * current mode or its declaration) it holds L1 for `holdTicks` from `tick`, so it never
 * drops straight to PEACE (FR-MODE-11). An existing hold is left untouched otherwise.
 * Local L1 (no declaration) is unaffected: the WAN counters still govern it.
 */
export function applyAllClear(node: Node, tick: number, holdTicks: number): void {
  const wasL3 = node.mode === 'L3' || node.declared?.level === 'L3';
  node.declared = null;
  if (wasL3) node.l1HoldUntilTick = tick + holdTicks;
}
