/**
 * The sim store against the real engine API: Generate (createWorld) with the default
 * config, Reset (same seed) and determinism of the pair. Node only: no DOM is touched.
 */
import { DEFAULT_WORLD_CONFIG, type Snapshot } from '@pomoc/core';
import { describe, expect, it } from 'vitest';
import {
  autoRespond,
  broadcastAlert,
  declareMode,
  sendRandomRequest,
  setGridUp,
  setMobility,
} from '../src/sim/commands';
import { createWorld, resetWorld, useSimStore } from '../src/sim/store';
import { DEFAULT_CONFIG_DRAFT, draftToWorldConfig, useUiStore } from '../src/ui/store';

function script(): void {
  const engine = useSimStore.getState().engine;
  engine.step(2);
  sendRandomRequest();
  engine.step(4);
  autoRespond({ strategy: 'nearest-hops' });
  engine.step(3);
  declareMode('L2');
  broadcastAlert('test alert');
  engine.step(3);
  setGridUp(false);
  engine.step(5);
}

function trace(snapshot: Snapshot): string {
  return JSON.stringify({
    tick: snapshot.tick,
    nodes: snapshot.nodes.map((n) => [n.id, n.mode, n.alive, n.storeSize]),
    totals: snapshot.metrics.totals,
    drops: snapshot.metrics.dropsByReason,
    events: snapshot.recentEvents.map((e) => e.type),
  });
}

describe('sim store against the engine', () => {
  it('Generate with the default config draft yields the default world', () => {
    const engine = createWorld(draftToWorldConfig(DEFAULT_CONFIG_DRAFT), {
      tickMs: DEFAULT_CONFIG_DRAFT.tickMs,
      mobility: DEFAULT_CONFIG_DRAFT.mobility,
    });
    const state = useSimStore.getState();
    expect(state.engine).toBe(engine);
    expect(state.snapshot).toBe(engine.getSnapshot());
    expect(state.snapshot.tick).toBe(0);
    expect(state.snapshot.nodes.length).toBe(
      DEFAULT_WORLD_CONFIG.mobiles + DEFAULT_WORLD_CONFIG.routers + DEFAULT_WORLD_CONFIG.gateways,
    );
    expect(state.snapshot.edges.length).toBeGreaterThan(0);
    expect(state.config).toEqual(DEFAULT_WORLD_CONFIG);
    expect(state.tickIntervalMs).toBe(DEFAULT_CONFIG_DRAFT.tickMs);
  });

  it('the store follows the engine on step and dispatch, stamping lastTickAt on ticks only', () => {
    createWorld(DEFAULT_WORLD_CONFIG);
    const before = useSimStore.getState();
    before.engine.step();
    const afterStep = useSimStore.getState();
    expect(afterStep.snapshot.tick).toBe(1);
    expect(afterStep.snapshot).not.toBe(before.snapshot);
    expect(afterStep.lastTickAt).toBeGreaterThanOrEqual(before.lastTickAt);

    sendRandomRequest();
    const afterDispatch = useSimStore.getState();
    expect(afterDispatch.snapshot).not.toBe(afterStep.snapshot);
    expect(afterDispatch.snapshot.tick).toBe(1);
    expect(afterDispatch.lastTickAt).toBe(afterStep.lastTickAt);
  });

  it('Reset (same seed) replays to an identical world and bumps the epoch', () => {
    createWorld(DEFAULT_WORLD_CONFIG);
    script();
    const first = trace(useSimStore.getState().snapshot);
    const epoch = useSimStore.getState().worldEpoch;

    const engine = resetWorld();
    const fresh = useSimStore.getState();
    expect(fresh.engine).toBe(engine);
    expect(fresh.worldEpoch).toBe(epoch + 1);
    expect(fresh.snapshot.tick).toBe(0);
    expect(fresh.snapshot.metrics.totals.originated).toBe(0);

    script();
    expect(trace(useSimStore.getState().snapshot)).toBe(first);
  });

  it('Reset keeps a mobility flag toggled after Generate (reads the live engine config)', () => {
    createWorld(DEFAULT_WORLD_CONFIG, { mobility: false });
    expect(useSimStore.getState().snapshot.world.mobility).toBe(false);
    setMobility(true);
    expect(useSimStore.getState().snapshot.world.mobility).toBe(true);
    resetWorld();
    expect(useSimStore.getState().snapshot.world.mobility).toBe(true);

    setMobility(false);
    resetWorld();
    expect(useSimStore.getState().snapshot.world.mobility).toBe(false);
  });

  it('Generate with an explicit mobility option overrides the live engine flag', () => {
    createWorld(DEFAULT_WORLD_CONFIG, { mobility: true });
    expect(useSimStore.getState().snapshot.world.mobility).toBe(true);
    createWorld(DEFAULT_WORLD_CONFIG, { mobility: false });
    expect(useSimStore.getState().snapshot.world.mobility).toBe(false);
  });

  it('a different seed produces a different world', () => {
    createWorld(DEFAULT_WORLD_CONFIG);
    const a = useSimStore.getState().snapshot.nodes.map((n) => [n.x, n.y]);
    createWorld({ ...DEFAULT_WORLD_CONFIG, seed: 7 });
    const b = useSimStore.getState().snapshot.nodes.map((n) => [n.x, n.y]);
    expect(a).not.toEqual(b);
  });

  it('ui store: select records the last real node and deselect clears the highlight', () => {
    createWorld(DEFAULT_WORLD_CONFIG);
    const node = useSimStore.getState().snapshot.nodes[0];
    expect(node).toBeDefined();
    if (!node) return;
    const ui = useUiStore.getState();
    ui.select(node.id);
    ui.select('authority');
    expect(useUiStore.getState().selectedNodeId).toBe('authority');
    expect(useUiStore.getState().lastSelectedNodeId).toBe(node.id);
    ui.highlightMessage(useSimStore.getState().snapshot.messages[0]?.id ?? null, [node.id]);
    ui.deselect();
    const after = useUiStore.getState();
    expect(after.selectedNodeId).toBeNull();
    expect(after.highlightedMessageId).toBeNull();
    expect(after.highlightedPath).toBeNull();
  });
});
