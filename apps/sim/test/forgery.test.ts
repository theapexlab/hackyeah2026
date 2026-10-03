import { DEFAULT_WORLD_CONFIG } from '@pomoc/core';
import { describe, expect, it } from 'vitest';
import { pickForgerySource } from '../src/sim/events';
import { createWorld, useSimStore } from '../src/sim/store';

const nodesFor = (unregisteredFraction: number) => {
  createWorld({ ...DEFAULT_WORLD_CONFIG, mobiles: 40, unregisteredFraction });
  return useSimStore.getState().snapshot.nodes;
};

describe('pickForgerySource', () => {
  it('picks among alive unregistered phones, varying with the salt', () => {
    const nodes = nodesFor(0.5);
    const picks = new Set<string>();
    for (let salt = 0; salt < 50; salt++) {
      const node = pickForgerySource(nodes, salt);
      expect(node?.kind).toBe('mobile');
      expect(node?.credentialKind).toBe('none');
      picks.add(node?.id ?? '');
    }
    expect(picks.size).toBeGreaterThan(1);
  });

  it('is deterministic for the same salt', () => {
    const nodes = nodesFor(0.5);
    expect(pickForgerySource(nodes, 7)?.id).toBe(pickForgerySource(nodes, 7)?.id);
  });

  it('falls back to any alive phone when none is unregistered', () => {
    const node = pickForgerySource(nodesFor(0), 3);
    expect(node?.kind).toBe('mobile');
    expect(node?.credentialKind).not.toBe('none');
  });
});
