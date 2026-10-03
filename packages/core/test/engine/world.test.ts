import { describe, expect, it } from 'vitest';
import { DEFAULT_WORLD_CONFIG } from '../../src/domain/config';
import { generateWorld } from '../../src/engine/world';
import { Prng } from '../../src/prng';

describe('generateWorld', () => {
  const nodes = generateWorld(DEFAULT_WORLD_CONFIG, new Prng(42));

  it('creates the configured counts with zero-padded ids, sorted', () => {
    expect(nodes).toHaveLength(67);
    const ids = nodes.map((n) => n.id);
    expect(ids).toEqual([...ids].sort());
    expect(ids.slice(0, 2)).toEqual(['g-01', 'g-02']);
    expect(ids[2]).toBe('m-001');
    expect(ids[41]).toBe('m-040');
    expect(ids[42]).toBe('r-001');
    expect(ids[66]).toBe('r-025');
  });

  it('keeps every node inside the area and assigns ranges, credentials and backhaul by kind', () => {
    for (const n of nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.x).toBeLessThanOrEqual(1000);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeLessThanOrEqual(700);
      expect(n.mode).toBe('PEACE');
      expect(n.alive).toBe(true);
      expect(n.seen.size).toBe(0);
      expect(n.inbox).toEqual([]);
      if (n.kind === 'router') {
        expect(n.range).toBe(DEFAULT_WORLD_CONFIG.range.router);
        expect(n.credential.kind).toBe('relay');
        expect(n.backhaul).toBe('none');
      } else if (n.kind === 'gateway') {
        expect(n.range).toBe(DEFAULT_WORLD_CONFIG.range.gateway);
        expect(n.credential.kind).toBe('relay');
        expect(n.backhaul).toBe('satellite');
        expect(n.batteryBacked).toBe(false);
      } else {
        expect(n.range).toBe(DEFAULT_WORLD_CONFIG.range.mobile);
        expect(n.backhaul).toBe('cellular');
        expect(['citizen', 'none']).toContain(n.credential.kind);
      }
    }
  });

  it('applies the unregistered and battery-backed fractions', () => {
    const unregistered = nodes.filter((n) => n.kind === 'mobile' && n.credential.kind === 'none');
    expect(unregistered).toHaveLength(4); // round(0.1 * 40)
    const battery = nodes.filter((n) => n.kind === 'router' && n.batteryBacked);
    expect(battery).toHaveLength(3); // round(0.1 * 25)
  });

  it('spreads gateways to the corners first and routers on a jittered grid', () => {
    const g1 = nodes.find((n) => n.id === 'g-01')!;
    const g2 = nodes.find((n) => n.id === 'g-02')!;
    expect([g1.x, g1.y]).toEqual([120, 84]);
    expect([g2.x, g2.y]).toEqual([880, 616]);
    // 25 routers on 1000x700: 6 columns x 4 rows (cells 166.7 x 175) plus one random
    const routers = nodes.filter((n) => n.kind === 'router');
    const cellW = 1000 / 6;
    const cellH = 700 / 4;
    for (let i = 0; i < 24; i++) {
      const r = routers[i]!;
      const cx = ((i % 6) + 0.5) * cellW;
      const cy = (Math.floor(i / 6) + 0.5) * cellH;
      expect(Math.abs(r.x - cx)).toBeLessThanOrEqual(0.25 * cellW + 1e-9);
      expect(Math.abs(r.y - cy)).toBeLessThanOrEqual(0.25 * cellH + 1e-9);
    }
  });

  it('is deterministic per seed and differs across seeds', () => {
    const again = generateWorld(DEFAULT_WORLD_CONFIG, new Prng(42));
    const pos = (ns: typeof nodes) =>
      ns.map((n) => [n.id, n.x, n.y, n.credential.kind, n.batteryBacked]);
    expect(pos(again)).toEqual(pos(nodes));
    const other = generateWorld({ ...DEFAULT_WORLD_CONFIG, seed: 7 }, new Prng(7));
    expect(pos(other)).not.toEqual(pos(nodes));
  });

  it('handles empty counts', () => {
    expect(
      generateWorld({ ...DEFAULT_WORLD_CONFIG, mobiles: 0, routers: 0, gateways: 0 }, new Prng(1)),
    ).toEqual([]);
  });
});
