import { describe, expect, it } from 'vitest';
import { nodeId } from '../../src/domain/ids';
import { buildAdjacency } from '../../src/graph/adjacency';
import { boundedBfs } from '../../src/graph/bfs';
import { lineNodes } from '../helpers';

describe('boundedBfs', () => {
  const nodes = lineNodes(5, 50, { range: 60 });
  const { neighbours } = buildAdjacency(nodes);

  it('returns hop counts from the start, start = 0', () => {
    const hops = boundedBfs(nodeId('m-001'), neighbours, Number.POSITIVE_INFINITY);
    expect([...hops.entries()]).toEqual([
      ['m-001', 0],
      ['m-002', 1],
      ['m-003', 2],
      ['m-004', 3],
      ['m-005', 4],
    ]);
  });

  it('stops expanding at maxHops', () => {
    const hops = boundedBfs(nodeId('m-003'), neighbours, 1);
    expect([...hops.entries()]).toEqual([
      ['m-003', 0],
      ['m-002', 1],
      ['m-004', 1],
    ]);
    expect([...boundedBfs(nodeId('m-001'), neighbours, 0).entries()]).toEqual([['m-001', 0]]);
  });

  it('tolerates a start that is not in the map', () => {
    expect([...boundedBfs(nodeId('x-999'), neighbours, 3).entries()]).toEqual([['x-999', 0]]);
  });
});
