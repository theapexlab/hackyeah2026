/**
 * Every pure UI helper must cope with an engine whose snapshot has zero nodes (the config
 * panel allows 0 / 0 / 0), and with commands fired into such a world.
 */
import { DEFAULT_WORLD_CONFIG } from '@pomoc/core';
import { describe, expect, it } from 'vitest';
import { collectTrail } from '../src/features/map/renderer/highlight';
import { burstsFromEvents, ingestTransits } from '../src/features/map/renderer/particles';
import { createEventCursor } from '../src/lib/eventCursor';
import { describeEvent } from '../src/lib/eventText';
import { fitTransform, nearestNode } from '../src/lib/geometry';
import { regionFor } from '../src/lib/regions';
import {
  allClear,
  autoRespond,
  broadcastAlert,
  declareMode,
  sendRandomRequest,
  setCellsUp,
  setGridUp,
  setMobility,
} from '../src/sim/commands';
import { pickForgerySource } from '../src/sim/events';
import { countNodes, nodeIndex, selectNodeById } from '../src/sim/selectors';
import { createWorld, useSimStore } from '../src/sim/store';

const EMPTY = { ...DEFAULT_WORLD_CONFIG, mobiles: 0, routers: 0, gateways: 0 };

describe('zero-node world', () => {
  it('generates, steps and accepts every demo command without throwing', () => {
    createWorld(EMPTY);
    const cursor = createEventCursor(() => useSimStore.getState().snapshot.recentEvents, {
      startAtEnd: false,
    });
    const engine = useSimStore.getState().engine;
    expect(() => {
      engine.step(3);
      sendRandomRequest();
      autoRespond();
      declareMode('L3');
      broadcastAlert('nobody home');
      allClear();
      setCellsUp(false);
      setGridUp(false);
      setMobility(true);
      engine.step(5);
    }).not.toThrow();

    const snapshot = useSimStore.getState().snapshot;
    expect(snapshot.nodes).toHaveLength(0);
    expect(snapshot.edges).toHaveLength(0);
    expect(snapshot.tick).toBe(8);
    for (const value of [
      snapshot.metrics.reachableFraction,
      snapshot.metrics.authorityReachableFraction,
      snapshot.metrics.componentCount,
      snapshot.metrics.storedTotal,
    ]) {
      expect(Number.isFinite(value)).toBe(true);
    }

    // Every event the engine logged describes without throwing and with non-empty text.
    for (const event of cursor.next()) {
      const summary = describeEvent(event);
      expect(summary.text.length).toBeGreaterThan(0);
      expect(summary.category).toBeDefined();
    }
  });

  it('UI helpers return empty results rather than crashing', () => {
    createWorld(EMPTY);
    const snapshot = useSimStore.getState().snapshot;
    expect(countNodes(snapshot.nodes)).toEqual({
      total: 0,
      mobiles: 0,
      routers: 0,
      gateways: 0,
      alive: 0,
      backhaul: 0,
      unregistered: 0,
    });
    expect(nodeIndex(snapshot.nodes).size).toBe(0);
    expect(selectNodeById(null)(useSimStore.getState())).toBeUndefined();
    expect(pickForgerySource(snapshot.nodes)).toBeNull();
    expect(nearestNode(snapshot.nodes, 10, 10)).toBeNull();
    expect(regionFor('around', snapshot.world, null)).toBeUndefined();
    expect(regionFor('west', snapshot.world)).toBeDefined();
    const fit = fitTransform(snapshot.world.width, snapshot.world.height, 800, 600);
    expect(fit.k).toBeGreaterThan(0);

    const ingest = ingestTransits(snapshot.transits, snapshot.tick, { showTopology: false });
    expect(ingest.pulses).toHaveLength(0);
    expect(ingest.injects).toHaveLength(0);
    expect(burstsFromEvents(snapshot.recentEvents, 0)).toHaveLength(0);
    const trail = collectTrail([snapshot.transits], snapshot.messages[0]?.id ?? ('x#1' as never));
    expect(trail.edges).toHaveLength(0);
  });
});
