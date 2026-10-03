import { AUTHORITY_ID, messageId, nodeId, type TransitEvent } from '@pomoc/core';
import { describe, expect, it } from 'vitest';
import { chainEdges, collectTrail } from '../src/features/map/renderer/highlight';

const msg = messageId('m-001#1');
const other = messageId('m-002#1');
const a = nodeId('m-001');
const b = nodeId('m-002');
const c = nodeId('r-001');

function t(
  from: string,
  to: string,
  id = msg,
  tick = 1,
  via: TransitEvent['via'] = 'hop',
): TransitEvent {
  return { tick, msgId: id, class: 'INFO', from: nodeId(from), to: nodeId(to), hop: 1, via };
}

describe('collectTrail', () => {
  it('collects unique edges of one message across ticks, oldest first', () => {
    const trail = collectTrail(
      [
        [t('m-001', 'm-002', msg, 1), t('m-001', 'm-002', other, 1)],
        [t('m-002', 'r-001', msg, 2), t('m-002', 'm-001', msg, 2)],
      ],
      msg,
    );
    expect(trail.edges).toEqual([
      { from: a, to: b, tick: 1 },
      { from: b, to: c, tick: 2 },
    ]);
    expect([...trail.nodes]).toEqual([a, b, c]);
  });

  it('skips Authority legs but keeps the touched node', () => {
    const trail = collectTrail(
      [[t(AUTHORITY_ID, 'r-001', msg, 1, 'authority-inject'), t('r-001', 'm-001', msg, 2)]],
      msg,
    );
    expect(trail.edges).toEqual([{ from: c, to: a, tick: 2 }]);
    expect(trail.nodes.has(c)).toBe(true);
    expect(trail.nodes.has(AUTHORITY_ID)).toBe(false);
  });
});

describe('chainEdges', () => {
  it('pairs consecutive nodes of a recorded path', () => {
    expect(chainEdges([a, b, c])).toEqual([
      { from: a, to: b, tick: 1 },
      { from: b, to: c, tick: 2 },
    ]);
    expect(chainEdges([a])).toEqual([]);
    expect(chainEdges([AUTHORITY_ID, c, a])).toEqual([{ from: c, to: a, tick: 2 }]);
  });
});
