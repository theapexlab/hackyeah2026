import { describe, expect, it } from 'vitest';
import type { Mode } from '../../src/domain/mode';
import type { Node } from '../../src/domain/node';
import {
  applyDeclaration,
  evaluateMode,
  type ModeEvalContext,
} from '../../src/policies/modeMachine';
import { createPrng } from '../../src/prng';
import { fakeNode } from '../helpers';

const CFG = { localModeAfterTicks: 5, wanStableTicks: 8, l3StepDownHoldTicks: 5 };

/** Drive a node through ticks exactly like the engine: evaluate, then apply the transition. */
class Driver {
  tick = 0;
  readonly modes: Mode[] = [];
  constructor(
    readonly node: Node = fakeNode(),
    private cfg: Omit<ModeEvalContext, 'tick'> = CFG,
  ) {}

  step(wanUp: boolean, n = 1): this {
    for (let i = 0; i < n; i++) {
      this.tick++;
      this.node.wanUp = wanUp;
      const t = evaluateMode(this.node, { tick: this.tick, ...this.cfg });
      if (t) {
        this.node.mode = t.newMode;
        this.node.modeSource = t.source;
      }
      this.modes.push(this.node.mode);
    }
    return this;
  }

  declare(level: 'L1' | 'L2' | 'L3' | 'ALL_CLEAR', durationTicks = 100): this {
    applyDeclaration(
      this.node,
      level,
      this.tick + durationTicks,
      this.tick,
      `d${this.tick}`,
      this.cfg.l3StepDownHoldTicks,
    );
    return this;
  }
}

describe('ModeMachine: local automation (FR-MODE-01/04/09)', () => {
  it('PEACE -> L1 exactly after N ticks without WAN', () => {
    const d = new Driver().step(false, 4);
    expect(d.modes).toEqual(['PEACE', 'PEACE', 'PEACE', 'PEACE']);
    d.step(false);
    expect(d.node.mode).toBe('L1');
    expect(d.node.modeSource).toBe('local');
    expect(d.modes.indexOf('L1')).toBe(4);
  });

  it('a WAN outage shorter than N does not leave PEACE', () => {
    const d = new Driver().step(false, 4).step(true, 3).step(false, 4);
    expect(d.modes.every((m) => m === 'PEACE')).toBe(true);
  });

  it('L1 -> PEACE only after the stable window; exactly wanStableTicks later', () => {
    const d = new Driver().step(false, 5);
    expect(d.node.mode).toBe('L1');
    d.step(true, 7);
    expect(d.node.mode).toBe('L1');
    d.step(true);
    expect(d.node.mode).toBe('PEACE');
  });

  it('3-tick WAN flap stays L1 (hysteresis)', () => {
    const d = new Driver().step(false, 5).step(true, 3).step(false, 2).step(true, 3);
    expect(d.node.mode).toBe('L1');
    expect(d.modes.slice(4).every((m) => m === 'L1')).toBe(true);
  });

  it('a flap resets the stable window', () => {
    const d = new Driver().step(false, 5).step(true, 7).step(false).step(true, 7);
    expect(d.node.mode).toBe('L1');
    d.step(true);
    expect(d.node.mode).toBe('PEACE');
  });

  it('local automation never yields L2/L3 (random WAN flapping, 2000 ticks)', () => {
    const rng = createPrng(7);
    const d = new Driver();
    for (let i = 0; i < 2000; i++) d.step(rng.next() > (i % 200 < 100 ? 0.9 : 0.1));
    expect(new Set(d.modes)).toEqual(new Set(['PEACE', 'L1']));
  });
});

describe('ModeMachine: declarations (FR-MODE-02/03/08/09)', () => {
  it('declared L2 overrides local L1 and survives WAN return', () => {
    const d = new Driver().step(false, 5);
    expect(d.node.mode).toBe('L1');
    d.declare('L2').step(true);
    expect(d.node.mode).toBe('L2');
    expect(d.node.modeSource).toBe('declared');
    d.step(true, 50);
    expect(d.node.mode).toBe('L2');
  });

  it('declared L3 straight from PEACE with WAN up (declaration needs no connectivity loss)', () => {
    const d = new Driver().step(true, 3).declare('L3').step(true);
    expect(d.node.mode).toBe('L3');
  });

  it('declared mode wins even while WAN is down', () => {
    const d = new Driver().step(false, 10).declare('L2').step(false, 3);
    expect(d.node.mode).toBe('L2');
  });

  it('a later declaration replaces an earlier one (L2 -> L3)', () => {
    const d = new Driver().declare('L2').step(true).declare('L3').step(true);
    expect(d.node.mode).toBe('L3');
  });

  it('expiry of L2: steps down through L1 for the hold, then PEACE (WAN up)', () => {
    const d = new Driver().declare('L2', 3).step(true, 2);
    expect(d.node.mode).toBe('L2');
    d.step(true);
    expect(d.node.mode).toBe('L1');
    expect(d.node.modeSource).toBe('stepdown');
    d.step(true, 4);
    expect(d.node.mode).toBe('L1');
    d.step(true);
    expect(d.node.mode).toBe('PEACE');
  });

  it('expiry with the WAN still down falls back to local L1', () => {
    const d = new Driver().step(false, 5).declare('L3', 4).step(false, 20);
    expect(d.node.mode).toBe('L1');
    expect(d.node.modeSource).toBe('local');
  });

  it('expiry of a declared L1 goes straight to local evaluation (PEACE when WAN is fine)', () => {
    const d = new Driver().step(true, 20).declare('L1', 3).step(true, 2);
    expect(d.node.mode).toBe('L1');
    d.step(true);
    expect(d.node.mode).toBe('PEACE');
  });

  it('AllClear from L3 -> L1 for the hold, then PEACE; never direct', () => {
    const d = new Driver().step(true, 10).declare('L3').step(true, 3);
    expect(d.node.mode).toBe('L3');
    d.declare('ALL_CLEAR');
    const before = d.modes.length;
    d.step(true, 10);
    const after = d.modes.slice(before);
    expect(after.slice(0, 5)).toEqual(['L1', 'L1', 'L1', 'L1', 'L1']);
    expect(after.slice(5)).toEqual(['PEACE', 'PEACE', 'PEACE', 'PEACE', 'PEACE']);
    expect(d.modes.some((m, i) => m === 'L3' && d.modes[i + 1] === 'PEACE')).toBe(false);
  });

  it('AllClear from L2 also steps down through L1 (diagram 03: L2 -> L1)', () => {
    const d = new Driver().declare('L2').step(true, 2).declare('ALL_CLEAR').step(true);
    expect(d.node.mode).toBe('L1');
    d.step(true, 5);
    expect(d.node.mode).toBe('PEACE');
  });

  it('AllClear from a declared L1 returns to PEACE directly when WAN is stable', () => {
    const d = new Driver().step(true, 20).declare('L1').step(true).declare('ALL_CLEAR').step(true);
    expect(d.node.mode).toBe('PEACE');
  });

  it('AllClear cannot cancel local automation (WAN still down)', () => {
    const d = new Driver().step(false, 5).declare('ALL_CLEAR').step(false, 3);
    expect(d.node.mode).toBe('L1');
  });

  it('hold length follows the config', () => {
    const d = new Driver(fakeNode(), { ...CFG, l3StepDownHoldTicks: 2 })
      .step(true, 10)
      .declare('L3')
      .step(true)
      .declare('ALL_CLEAR')
      .step(true, 4);
    expect(d.modes.slice(11)).toEqual(['L1', 'L1', 'PEACE', 'PEACE']);
  });

  it('an already expired declaration is ignored on arrival', () => {
    const node = fakeNode();
    applyDeclaration(node, 'L3', 10, 10, 'late', 5);
    expect(node.declared).toBeNull();
  });
});
