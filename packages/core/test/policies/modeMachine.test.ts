import { describe, expect, it } from 'vitest';
import { messageId } from '../../src/domain/ids';
import type { Mode } from '../../src/domain/mode';
import type { ModeSource, Node } from '../../src/domain/node';
import { applyAllClear, applyDeclaration, evaluateMode } from '../../src/policies/modeMachine';
import { Prng } from '../../src/prng';
import { makeConfig, makeNode } from '../helpers';

const cfg = makeConfig({ localModeAfterTicks: 5, wanStableTicks: 8, l3StepDownHoldTicks: 5 });
const DECL = messageId('authority#1');

/** What the engine does each tick before evaluateMode: update the WAN counters. */
function countWan(node: Node, wanUp: boolean): void {
  node.wanUp = wanUp;
  if (wanUp) {
    node.ticksWithWan++;
    node.ticksWithoutWan = 0;
  } else {
    node.ticksWithoutWan++;
    node.ticksWithWan = 0;
  }
}

/** One engine mode step: counters, evaluation, write-back. Returns the resulting mode. */
function stepMode(node: Node, tick: number, wanUp: boolean): `${Mode}/${ModeSource}` {
  countWan(node, wanUp);
  const r = evaluateMode(node, cfg, tick);
  node.mode = r.mode;
  node.modeSource = r.source;
  return `${r.mode}/${r.source}`;
}

/** Run ticks [from, from+n) with a constant WAN state; returns the trace. */
function run(node: Node, from: number, n: number, wanUp: boolean): string[] {
  return Array.from({ length: n }, (_, i) => stepMode(node, from + i, wanUp));
}

describe('local automation (FR-MODE-01, FR-MODE-04)', () => {
  it('PEACE -> L1 exactly after localModeAfterTicks without WAN', () => {
    const node = makeNode();
    expect(run(node, 1, 4, false)).toEqual(Array(4).fill('PEACE/local'));
    expect(stepMode(node, 5, false)).toBe('L1/local');
    expect(stepMode(node, 6, false)).toBe('L1/local');
  });

  it('L1 -> PEACE only after wanStableTicks; a 3-tick WAN flap stays L1', () => {
    const node = makeNode();
    run(node, 1, 5, false);
    expect(node.mode).toBe('L1');
    expect(run(node, 6, 3, true)).toEqual(Array(3).fill('L1/local')); // WAN back for 3 ticks
    expect(stepMode(node, 9, false)).toBe('L1/local'); // flap: counters reset, still L1
    expect(run(node, 10, 7, true)).toEqual(Array(7).fill('L1/local'));
    expect(stepMode(node, 17, true)).toBe('PEACE/local'); // 8th stable tick
    expect(stepMode(node, 18, true)).toBe('PEACE/local');
  });

  it('a PEACE node with WAN briefly down stays PEACE', () => {
    const node = makeNode();
    expect(run(node, 1, 4, false)).toEqual(Array(4).fill('PEACE/local'));
    expect(run(node, 5, 2, true)).toEqual(Array(2).fill('PEACE/local'));
  });

  it('never yields L2 or L3 without a declaration', () => {
    const prng = new Prng(7);
    const node = makeNode();
    for (let tick = 1; tick <= 2000; tick++) {
      const r = stepMode(node, tick, prng.next() < 0.5);
      expect(['PEACE/local', 'L1/local']).toContain(r);
    }
  });
});

describe('declarations (FR-MODE-02, FR-MODE-03, FR-MODE-09)', () => {
  it('declared L2 overrides local mode and survives WAN return until expiry', () => {
    const node = makeNode();
    run(node, 1, 5, false); // local L1
    applyDeclaration(node, 'L2', 20, DECL);
    expect(node.declared).toEqual({ level: 'L2', untilTick: 20, declarationId: DECL });
    expect(stepMode(node, 6, false)).toBe('L2/declared');
    expect(run(node, 7, 13, true)).toEqual(Array(13).fill('L2/declared')); // ticks 7..19, WAN up
    expect(stepMode(node, 20, true)).toBe('PEACE/local'); // expired at untilTick, WAN stable
    expect(node.declared).toBeNull();
    expect(node.l1HoldUntilTick).toBe(0);
  });

  it('declared L1 is the only way to L1 while WAN is up, then hysteresis applies after expiry', () => {
    const node = makeNode();
    run(node, 1, 3, true);
    applyDeclaration(node, 'L1', 10, DECL);
    expect(run(node, 4, 6, true)).toEqual(Array(6).fill('L1/declared'));
    // expired at 10; mode is L1 and ticksWithWan is 10 >= 8 -> PEACE at once
    expect(stepMode(node, 10, true)).toBe('PEACE/local');

    const flappy = makeNode();
    applyDeclaration(flappy, 'L1', 3, DECL);
    expect(stepMode(flappy, 1, false)).toBe('L1/declared');
    expect(stepMode(flappy, 2, false)).toBe('L1/declared');
    // expired; WAN just came back (ticksWithWan 1 < 8) and mode was L1 -> stays L1 locally
    expect(stepMode(flappy, 3, true)).toBe('L1/local');
    expect(run(flappy, 4, 6, true)).toEqual(Array(6).fill('L1/local'));
    expect(stepMode(flappy, 10, true)).toBe('PEACE/local');
  });

  it('expiry with WAN still down falls back to local L1', () => {
    const node = makeNode();
    applyDeclaration(node, 'L2', 10, DECL);
    expect(run(node, 1, 9, false)).toEqual(Array(9).fill('L2/declared'));
    expect(stepMode(node, 10, false)).toBe('L1/local');
    expect(node.declared).toBeNull();
  });

  it('a newer declaration replaces the older one', () => {
    const node = makeNode();
    applyDeclaration(node, 'L2', 100, DECL);
    applyDeclaration(node, 'L3', 50, messageId('authority#2'));
    expect(stepMode(node, 1, true)).toBe('L3/declared');
    expect(node.declared?.declarationId).toBe('authority#2');
  });

  it('evaluateMode mutates only on expiry', () => {
    const node = makeNode();
    applyDeclaration(node, 'L3', 10, DECL);
    const declaredRef = node.declared;
    evaluateMode(node, cfg, 5);
    expect(node.declared).toBe(declaredRef);
    expect(node.l1HoldUntilTick).toBe(0);
    expect(node.mode).toBe('PEACE'); // never written by evaluateMode
    evaluateMode(node, cfg, 10);
    expect(node.declared).toBeNull();
    expect(node.l1HoldUntilTick).toBe(15);
  });
});

describe('step-down from L3 (FR-MODE-11)', () => {
  it('AllClear from L3 holds L1 for l3StepDownHoldTicks, then PEACE; never straight to PEACE', () => {
    const node = makeNode();
    applyDeclaration(node, 'L3', 100, DECL);
    expect(run(node, 1, 9, true)).toEqual(Array(9).fill('L3/declared'));
    applyAllClear(node, 10, cfg.l3StepDownHoldTicks);
    expect(node.declared).toBeNull();
    expect(node.l1HoldUntilTick).toBe(15);
    const trace = run(node, 10, 7, true);
    expect(trace).toEqual([
      'L1/stepdown',
      'L1/stepdown',
      'L1/stepdown',
      'L1/stepdown',
      'L1/stepdown',
      'PEACE/local', // tick 15: hold over, WAN stable for 15 ticks
      'PEACE/local',
    ]);
    expect(trace[0]).not.toBe('PEACE/local');
  });

  it('after the hold, local hysteresis still applies when WAN only just returned', () => {
    const node = makeNode();
    applyDeclaration(node, 'L3', 100, DECL);
    run(node, 1, 9, false); // L3 with no WAN
    applyAllClear(node, 10, 5);
    expect(run(node, 10, 5, true)).toEqual(Array(5).fill('L1/stepdown'));
    // ticksWithWan is 6 at tick 15, 7 at 16, 8 at 17
    expect(run(node, 15, 2, true)).toEqual(['L1/local', 'L1/local']);
    expect(stepMode(node, 17, true)).toBe('PEACE/local');
  });

  it('L3 expiry (no all-clear) also steps down through the L1 hold', () => {
    const node = makeNode();
    applyDeclaration(node, 'L3', 10, DECL);
    run(node, 1, 9, true);
    expect(stepMode(node, 10, true)).toBe('L1/stepdown');
    expect(node.l1HoldUntilTick).toBe(15);
    expect(run(node, 11, 4, true)).toEqual(Array(4).fill('L1/stepdown'));
    expect(stepMode(node, 15, true)).toBe('PEACE/local');
  });

  it('AllClear from L2 clears the declaration without a hold', () => {
    const node = makeNode();
    applyDeclaration(node, 'L2', 100, DECL);
    run(node, 1, 9, true);
    applyAllClear(node, 10, 5);
    expect(node.declared).toBeNull();
    expect(node.l1HoldUntilTick).toBe(0);
    expect(stepMode(node, 10, true)).toBe('PEACE/local');
  });

  it('AllClear detects L3 from a not-yet-evaluated declaration too', () => {
    const node = makeNode();
    applyDeclaration(node, 'L3', 100, DECL); // mode still PEACE: evaluateMode has not run
    applyAllClear(node, 4, 5);
    expect(node.l1HoldUntilTick).toBe(9);
    expect(stepMode(node, 4, true)).toBe('L1/stepdown');
  });

  it('AllClear during local L1 (no declaration) leaves the counters in charge', () => {
    const node = makeNode();
    run(node, 1, 5, false);
    expect(node.mode).toBe('L1');
    applyAllClear(node, 6, 5);
    expect(node.declared).toBeNull();
    expect(node.l1HoldUntilTick).toBe(0);
    expect(stepMode(node, 6, false)).toBe('L1/local');
  });

  it('a second AllClear during the hold does not shorten it', () => {
    const node = makeNode();
    applyDeclaration(node, 'L3', 100, DECL);
    run(node, 1, 2, true);
    applyAllClear(node, 3, 5);
    stepMode(node, 3, true);
    applyAllClear(node, 4, 5);
    expect(node.l1HoldUntilTick).toBe(8);
    expect(run(node, 4, 4, true)).toEqual(Array(4).fill('L1/stepdown'));
  });
});
