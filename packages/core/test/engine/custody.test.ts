import { describe, expect, it } from 'vitest';
import type { Command } from '../../src/domain/commands';
import { nodeId } from '../../src/domain/ids';
import { MESSAGE_TTL_S } from '../../src/domain/mode';
import { engineFrom, eventsOf, lastMessageId, mobile } from '../helpers';

const id = nodeId;
const info = (from: string): Command => ({
  type: 'SendRequest',
  from: id(from),
  class: 'INFO',
  payload: { kind: 'REQUEST', text: 'water at the school?' },
});

describe('custody: every node carries an emergency message for five minutes', () => {
  it('a phone that already forwarded a message still hands it to whoever comes along later', () => {
    // m-001 -- m-002 are neighbours; m-003 is far away
    const e = engineFrom([mobile('m-001', 0, 0), mobile('m-002', 50, 0), mobile('m-003', 600, 0)]);
    e.dispatch({ type: 'SetCellsUp', up: false });
    e.step(5); // L1: store-and-forward
    e.dispatch(info('m-001'));
    const msgId = lastMessageId(e);
    e.step(2); // m-001 -> m-002; both keep a copy
    expect(e.getNodeDetail(id('m-001')).store).toHaveLength(1);
    expect(e.getNodeDetail(id('m-002')).store).toHaveLength(1);
    // only the leaf, which could hand it to nobody, logs STORED
    expect(eventsOf(e, 'STORED').map((x) => x.nodeId)).toEqual(['m-002']);

    e.step(100);
    e.dispatch({ type: 'MoveNode', nodeId: id('m-003'), x: 25, y: 40 }); // next to both carriers
    e.step(2);
    const toM3 = eventsOf(e, 'STORE_FLUSHED').filter((x) => x.to === 'm-003');
    expect(toM3).toHaveLength(1); // the second carrier skips it: m-003 already has the message
    expect(eventsOf(e, 'DELIVERED').filter((x) => x.nodeId === 'm-003')).toMatchObject([{ msgId }]);
  });

  it('keeps copies exactly five simulated minutes (1500 ticks of 200 ms), then drops them', () => {
    const e = engineFrom([mobile('m-001', 0, 0), mobile('m-002', 50, 0)]);
    expect(e.config.tickSeconds).toBe(0.2);
    e.dispatch({ type: 'SetCellsUp', up: false });
    e.step(5);
    e.dispatch(info('m-001')); // created at tick 5
    const ttl = MESSAGE_TTL_S / 0.2;
    expect(ttl).toBe(1500);
    expect(e.getSnapshot().messages.at(-1)?.ttlTicks).toBe(ttl);
    e.step(ttl); // tick 1505: 5 + 1500 is not < 1505
    expect(e.getSnapshot().metrics.storedTotal).toBe(2);
    expect(eventsOf(e, 'DROPPED')).toEqual([]);
    e.step(); // tick 1506
    expect(eventsOf(e, 'DROPPED').map((d) => `${d.tick}:${d.nodeId}:${d.reason}`)).toEqual([
      '1506:m-001:TTL_EXPIRED',
      '1506:m-002:TTL_EXPIRED',
    ]);
    expect(e.getSnapshot().metrics.storedTotal).toBe(0);
  });
});
