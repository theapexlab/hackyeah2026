import { messageId, nodeId, type SimEvent } from '@pomoc/core';
import { describe, expect, it } from 'vitest';
import { createEventCursor } from '../src/lib/eventCursor';

function ev(tick: number): SimEvent {
  return { type: 'STORED', tick, msgId: messageId(`m-001#${tick}`), nodeId: nodeId('m-001') };
}

describe('createEventCursor', () => {
  it('starts at the end by default and yields only appended events', () => {
    let log: SimEvent[] = [ev(1), ev(2)];
    const cursor = createEventCursor(() => log);
    expect(cursor.next()).toEqual([]);
    const e3 = ev(3);
    log = [...log, e3];
    expect(cursor.next()).toEqual([e3]);
    expect(cursor.next()).toEqual([]);
  });

  it('replays the current log when startAtEnd is false', () => {
    const log = [ev(1), ev(2)];
    const cursor = createEventCursor(() => log, { startAtEnd: false });
    expect(cursor.next()).toEqual(log);
    expect(cursor.next()).toEqual([]);
  });

  it('re-anchors on the last processed event after the log is truncated at the front', () => {
    const e1 = ev(1);
    const e2 = ev(2);
    const e3 = ev(3);
    const e4 = ev(4);
    let log: SimEvent[] = [e1, e2];
    const cursor = createEventCursor(() => log);
    cursor.next();
    log = [e2, e3, e4];
    expect(cursor.next()).toEqual([e3, e4]);
  });

  it('falls back to "newer than the last tick" when the anchor itself was evicted', () => {
    const e1 = ev(1);
    const e2 = ev(2);
    let log: SimEvent[] = [e1, e2];
    const cursor = createEventCursor(() => log);
    cursor.next();
    const e2b = ev(2);
    const e3 = ev(3);
    log = [e2b, e3];
    expect(cursor.next()).toEqual([e3]);
  });

  it('reset() skips everything currently in the log', () => {
    let log: SimEvent[] = [ev(1)];
    const cursor = createEventCursor(() => log, { startAtEnd: false });
    log = [...log, ev(2)];
    cursor.reset();
    expect(cursor.next()).toEqual([]);
    const e3 = ev(3);
    log = [...log, e3];
    expect(cursor.next()).toEqual([e3]);
  });

  it('handles an empty log and a log that later fills', () => {
    let log: SimEvent[] = [];
    const cursor = createEventCursor(() => log);
    expect(cursor.next()).toEqual([]);
    const e1 = ev(1);
    log = [e1];
    expect(cursor.next()).toEqual([e1]);
  });
});
