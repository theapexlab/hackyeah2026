/**
 * describeEvent over a real engine run: every SimEvent type the demo produces gets a
 * summary, a colour and a category, and the categories partition the log the way the
 * filter chips expect.
 */
import {
  DEFAULT_WORLD_CONFIG,
  type DropReason,
  messageId,
  nodeId,
  type SimEvent,
  type SimEventType,
} from '@pomoc/core';
import { describe, expect, it } from 'vitest';
import { describeEvent, eventCategory, eventKey, LOG_CATEGORIES } from '../src/lib/eventText';
import {
  autoRespond,
  broadcastAlert,
  declareMode,
  sendRandomRequest,
  sendRequest,
  setCellsUp,
  setGridUp,
} from '../src/sim/commands';
import { pickForgerySource } from '../src/sim/events';
import { createWorld, useSimStore } from '../src/sim/store';

function runDemo(): readonly SimEvent[] {
  createWorld({ ...DEFAULT_WORLD_CONFIG, seed: 3 });
  const engine = useSimStore.getState().engine;
  engine.step(1);
  sendRandomRequest();
  engine.step(3);
  autoRespond();
  engine.step(3);
  const forger = pickForgerySource(useSimStore.getState().snapshot.nodes);
  if (forger) {
    sendRequest(
      forger.id,
      'LIFE_CRITICAL',
      { kind: 'REQUEST', text: 'forged' },
      { forge: { claimKind: 'citizen' } },
    );
  }
  engine.step(2);
  setCellsUp(false);
  engine.step(8);
  declareMode('L3', { region: { x: 250, y: 350, r: 300 } });
  broadcastAlert('shelters open');
  engine.step(4);
  setGridUp(false);
  engine.step(6);
  autoRespond();
  engine.step(2);
  return engine.getEventLog();
}

describe('describeEvent', () => {
  const log = runDemo();
  const types = new Set<SimEventType>(log.map((e) => e.type));

  it('the demo run exercises most event types', () => {
    for (const expected of [
      'COMMAND',
      'ORIGINATED',
      'DELIVERED',
      'DROPPED',
      'MODE_CHANGED',
      'TX_OPENED',
      'AUTHORITY_INJECTED',
      'ADJACENCY',
    ] as const) {
      expect(types.has(expected), expected).toBe(true);
    }
  });

  it('every event gets text, a colour and a category from the known set', () => {
    for (const event of log) {
      const summary = describeEvent(event);
      expect(summary.text.length).toBeGreaterThan(0);
      expect(summary.color.length).toBeGreaterThan(0);
      expect(LOG_CATEGORIES).toContain(summary.category);
      expect(summary.category).toBe(eventCategory(event));
    }
  });

  it('duplicates are their own category; rejections are red, exhaustion is orange', () => {
    const drop = (reason: DropReason): SimEvent => ({
      type: 'DROPPED',
      tick: 1,
      msgId: messageId('m-001#1'),
      nodeId: nodeId('m-002'),
      class: 'INFO',
      reason,
    });
    expect(describeEvent(drop('DUPLICATE'))).toMatchObject({ category: 'dupe', color: 'gray' });
    expect(describeEvent(drop('UNVERIFIABLE'))).toMatchObject({ category: 'drop', color: 'red' });
    expect(describeEvent(drop('CLASS_NOT_ALLOWED'))).toMatchObject({
      category: 'drop',
      color: 'red',
    });
    expect(describeEvent(drop('HOP_LIMIT'))).toMatchObject({ category: 'drop', color: 'orange' });
    expect(describeEvent(drop('TTL_EXPIRED'))).toMatchObject({ category: 'drop', color: 'orange' });
  });

  it('eventKey is stable per event object and distinct across events', () => {
    const [a, b] = log;
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    if (!a || !b) return;
    expect(eventKey(a)).toBe(eventKey(a));
    expect(eventKey(a)).not.toBe(eventKey(b));
  });
});
