import type { Prng } from '../prng';
import {
  nearestPointOnSegment,
  pointInPolygon,
  polygonBbox,
  segmentIntersection,
  segmentIntersectsPolygon,
} from './geometry';
import type { GraphEdge, Polygon, Polyline, Pt, StreetGraph } from './types';

/** Points closer than this (metres) become one graph node; also the T-junction tolerance. */
export const DEFAULT_SNAP_M = 8;

interface Segment {
  readonly a: Pt;
  readonly b: Pt;
  readonly len: number;
  readonly major: boolean;
  readonly line: number;
  readonly index: number;
  readonly ts: number[];
}

function inAnyPolygon(p: Pt, polys: readonly Polygon[]): boolean {
  for (const poly of polys) if (pointInPolygon(p, poly.pts)) return true;
  return false;
}

/**
 * Street graph from centrelines. Every segment is split where it crosses another, where
 * another segment's endpoint lies on it (T-junction) and at near misses within `snap`;
 * points within `snap` of an existing node merge into it (first come wins, so the result
 * depends only on input order). Edges touching water are flagged `bridge`.
 */
export function buildStreetGraph(
  streets: readonly Polyline[],
  water: readonly Polygon[],
  snap = DEFAULT_SNAP_M,
): StreetGraph {
  // 1. segments
  const segs: Segment[] = [];
  streets.forEach((street, line) => {
    for (let i = 1; i < street.pts.length; i++) {
      const a = street.pts[i - 1]!;
      const b = street.pts[i]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 1e-6) continue;
      segs.push({ a, b, len, major: street.major, line, index: i, ts: [0, 1] });
    }
  });

  // 2. split points: crossings, T-junctions and near misses
  const snap2 = snap * snap;
  const boxes = segs.map((s) => ({
    minX: Math.min(s.a.x, s.b.x) - snap,
    maxX: Math.max(s.a.x, s.b.x) + snap,
    minY: Math.min(s.a.y, s.b.y) - snap,
    maxY: Math.max(s.a.y, s.b.y) + snap,
  }));
  const projectEnds = (from: Segment, onto: Segment): void => {
    for (const e of [from.a, from.b]) {
      const q = nearestPointOnSegment(e, onto.a, onto.b);
      if (q.dist2 <= snap2 && q.t > 0 && q.t < 1) onto.ts.push(q.t);
    }
  };
  for (let i = 0; i < segs.length; i++) {
    const si = segs[i]!;
    const bi = boxes[i]!;
    for (let j = i + 1; j < segs.length; j++) {
      const sj = segs[j]!;
      const bj = boxes[j]!;
      if (bi.maxX < bj.minX || bj.maxX < bi.minX || bi.maxY < bj.minY || bj.maxY < bi.minY) {
        continue;
      }
      // consecutive pieces of one polyline already share their vertex
      if (si.line === sj.line && Math.abs(si.index - sj.index) === 1) continue;
      const x = segmentIntersection(si.a, si.b, sj.a, sj.b);
      if (x !== null) {
        const ei = snap / si.len;
        const ej = snap / sj.len;
        if (x.t >= -ei && x.t <= 1 + ei && x.u >= -ej && x.u <= 1 + ej) {
          si.ts.push(Math.min(1, Math.max(0, x.t)));
          sj.ts.push(Math.min(1, Math.max(0, x.u)));
        }
      }
      projectEnds(sj, si);
      projectEnds(si, sj);
    }
  }

  // 3. node merge via a grid hash of cell `snap`
  const nodes: Pt[] = [];
  const grid = new Map<string, number[]>();
  const resolve = (x: number, y: number): number => {
    const cx = Math.floor(x / snap);
    const cy = Math.floor(y / snap);
    let best = -1;
    let bestD2 = snap2;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const cell = grid.get(`${cx + dx},${cy + dy}`);
        if (cell === undefined) continue;
        for (const id of cell) {
          const n = nodes[id]!;
          const d2 = (n.x - x) ** 2 + (n.y - y) ** 2;
          if (d2 < bestD2 || (d2 === bestD2 && best >= 0 && id < best)) {
            best = id;
            bestD2 = d2;
          }
        }
      }
    }
    if (best >= 0) return best;
    const id = nodes.length;
    nodes.push({ x, y });
    const key = `${cx},${cy}`;
    const cell = grid.get(key);
    if (cell === undefined) grid.set(key, [id]);
    else cell.push(id);
    return id;
  };

  // 4. edges between consecutive distinct nodes along each segment
  const edgeIndex = new Map<string, number>();
  const raw: { a: number; b: number; major: boolean }[] = [];
  for (const s of segs) {
    const ts = [...new Set(s.ts)].sort((p, q) => p - q);
    let prev = -1;
    for (const t of ts) {
      const id = resolve(s.a.x + (s.b.x - s.a.x) * t, s.a.y + (s.b.y - s.a.y) * t);
      if (prev >= 0 && id !== prev) {
        const a = Math.min(prev, id);
        const b = Math.max(prev, id);
        const key = `${a},${b}`;
        const known = edgeIndex.get(key);
        if (known === undefined) {
          edgeIndex.set(key, raw.length);
          raw.push({ a, b, major: s.major });
        } else if (s.major) {
          raw[known]!.major = true;
        }
      }
      prev = id;
    }
  }

  // 5. per-node water flag, bridges, lengths
  const inWater = nodes.map((n) => inAnyPolygon(n, water));
  const waterBoxes = water.map((w) => polygonBbox(w.pts));
  const edges: GraphEdge[] = raw.map(({ a, b, major }) => {
    const pa = nodes[a]!;
    const pb = nodes[b]!;
    let bridge = inWater[a]! || inWater[b]!;
    if (!bridge) {
      for (let k = 0; k < water.length && !bridge; k++) {
        const box = waterBoxes[k]!;
        if (
          Math.max(pa.x, pb.x) < box.minX ||
          Math.min(pa.x, pb.x) > box.maxX ||
          Math.max(pa.y, pb.y) < box.minY ||
          Math.min(pa.y, pb.y) > box.maxY
        ) {
          continue;
        }
        bridge = segmentIntersectsPolygon(pa, pb, water[k]!.pts);
      }
    }
    return { a, b, length: Math.hypot(pb.x - pa.x, pb.y - pa.y), major, bridge };
  });

  // 6. adjacency, components, cumulative lengths
  const adjacency: number[][] = nodes.map(() => []);
  edges.forEach((e, i) => {
    adjacency[e.a]!.push(i);
    adjacency[e.b]!.push(i);
  });
  const componentOf = new Array<number>(nodes.length).fill(-1);
  let componentCount = 0;
  for (let s = 0; s < nodes.length; s++) {
    if (componentOf[s] !== -1) continue;
    const queue = [s];
    componentOf[s] = componentCount;
    for (let q = 0; q < queue.length; q++) {
      const n = queue[q]!;
      for (const ei of adjacency[n]!) {
        const e = edges[ei]!;
        const other = e.a === n ? e.b : e.a;
        if (componentOf[other] === -1) {
          componentOf[other] = componentCount;
          queue.push(other);
        }
      }
    }
    componentCount++;
  }
  const cumulativeLength: number[] = [];
  const landCumulativeLength: number[] = [];
  let total = 0;
  let land = 0;
  for (const e of edges) {
    total += e.length;
    if (!e.bridge) land += e.length;
    cumulativeLength.push(total);
    landCumulativeLength.push(land);
  }
  return {
    nodes,
    edges,
    adjacency,
    componentOf,
    componentCount,
    inWater,
    cumulativeLength,
    totalLength: total,
    landCumulativeLength,
    landTotalLength: land,
  };
}

/** Closest point of the street network to p. */
export interface GraphProjection {
  readonly x: number;
  readonly y: number;
  readonly edge: number;
  readonly t: number;
  readonly distance: number;
  /** The nearer endpoint of that edge. */
  readonly nearestNode: number;
}

/** Nearest point on any street (land streets only with `land`); null when there is none. */
export function nearestPointOnGraph(
  graph: StreetGraph,
  p: Pt,
  opts: { readonly land?: boolean } = {},
): GraphProjection | null {
  let bestD2 = Number.POSITIVE_INFINITY;
  let bestEdge = -1;
  let bestX = 0;
  let bestY = 0;
  let bestT = 0;
  for (let i = 0; i < graph.edges.length; i++) {
    const e = graph.edges[i]!;
    if (opts.land === true && e.bridge) continue;
    const q = nearestPointOnSegment(p, graph.nodes[e.a]!, graph.nodes[e.b]!);
    if (q.dist2 < bestD2) {
      bestD2 = q.dist2;
      bestEdge = i;
      bestX = q.x;
      bestY = q.y;
      bestT = q.t;
    }
  }
  if (bestEdge < 0) return null;
  const e = graph.edges[bestEdge]!;
  return {
    x: bestX,
    y: bestY,
    edge: bestEdge,
    t: bestT,
    distance: Math.sqrt(bestD2),
    nearestNode: bestT < 0.5 ? e.a : e.b,
  };
}

/**
 * A point on the streets, uniformly by length (land streets only with `land`). Exactly two
 * PRNG draws when it returns a point; none (and null) when there are no streets.
 */
export function randomPointOnStreets(
  graph: StreetGraph,
  prng: Prng,
  opts: { readonly land: boolean },
): Pt | null {
  const cum = opts.land ? graph.landCumulativeLength : graph.cumulativeLength;
  const total = opts.land ? graph.landTotalLength : graph.totalLength;
  if (total <= 0) return null;
  const r = prng.float(0, total);
  let lo = 0;
  let hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid]! > r) hi = mid;
    else lo = mid + 1;
  }
  const e = graph.edges[lo]!;
  const t = prng.next();
  const a = graph.nodes[e.a]!;
  const b = graph.nodes[e.b]!;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * Dijkstra by street length from `from`, stopping early once `to` is settled (-1: settle
 * everything). Binary heap; ties go to the lower node index, so results are deterministic.
 */
function dijkstra(
  graph: StreetGraph,
  from: number,
  to = -1,
): { readonly dist: Float64Array; readonly prev: Int32Array; readonly done: Uint8Array } {
  const n = graph.nodes.length;
  const dist = new Float64Array(n).fill(Number.POSITIVE_INFINITY);
  const prev = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  const heapD: number[] = [];
  const heapN: number[] = [];
  const less = (i: number, j: number): boolean =>
    heapD[i]! < heapD[j]! || (heapD[i] === heapD[j] && heapN[i]! < heapN[j]!);
  const swap = (i: number, j: number): void => {
    const d = heapD[i]!;
    heapD[i] = heapD[j]!;
    heapD[j] = d;
    const v = heapN[i]!;
    heapN[i] = heapN[j]!;
    heapN[j] = v;
  };
  const push = (d: number, v: number): void => {
    heapD.push(d);
    heapN.push(v);
    let i = heapD.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!less(i, p)) break;
      swap(i, p);
      i = p;
    }
  };
  const pop = (): number => {
    const top = heapN[0]!;
    const lastD = heapD.pop()!;
    const lastN = heapN.pop()!;
    if (heapD.length > 0) {
      heapD[0] = lastD;
      heapN[0] = lastN;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heapD.length && less(l, m)) m = l;
        if (r < heapD.length && less(r, m)) m = r;
        if (m === i) break;
        swap(i, m);
        i = m;
      }
    }
    return top;
  };
  if (from < 0 || from >= n) return { dist, prev, done };
  dist[from] = 0;
  push(0, from);
  while (heapD.length > 0) {
    const u = pop();
    if (done[u]) continue;
    done[u] = 1;
    if (u === to) break;
    for (const ei of graph.adjacency[u]!) {
      const e = graph.edges[ei]!;
      const v = e.a === u ? e.b : e.a;
      const d = dist[u]! + e.length;
      if (d < dist[v]! || (d === dist[v]! && u < prev[v]!)) {
        dist[v] = d;
        prev[v] = u;
        push(d, v);
      }
    }
  }
  return { dist, prev, done };
}

/**
 * Shortest route by street length as node indices from `from` to `to` inclusive: [from]
 * when they are equal, [] when unreachable. Ties go to the lower node index, so routes are
 * deterministic.
 */
export function shortestPath(graph: StreetGraph, from: number, to: number): number[] {
  const n = graph.nodes.length;
  if (from < 0 || to < 0 || from >= n || to >= n) return [];
  if (from === to) return [from];
  if (graph.componentOf[from] !== graph.componentOf[to]) return [];
  const { prev, done } = dijkstra(graph, from, to);
  if (!done[to]) return [];
  const path: number[] = [];
  for (let v = to; v !== -1; v = prev[v]!) path.push(v);
  return path.reverse();
}

/** Street distance from `from` to every node (Infinity where unreachable). */
export function distancesFrom(graph: StreetGraph, from: number): Float64Array {
  return dijkstra(graph, from).dist;
}

const centralCache = new WeakMap<StreetGraph, readonly number[]>();

/**
 * The network's hubs, most central first: junctions (three or more streets) on a major,
 * non-bridge street in the largest component, ranked by closeness (smallest total street
 * distance to every node of that component; ties by index). Falls back to any junction,
 * then to any node, of that component. Memoised per graph.
 */
export function centralJunctions(graph: StreetGraph): readonly number[] {
  const cached = centralCache.get(graph);
  if (cached !== undefined) return cached;
  const sizes = new Map<number, number>();
  for (let i = 0; i < graph.nodes.length; i++) {
    if (graph.inWater[i]) continue;
    const c = graph.componentOf[i]!;
    sizes.set(c, (sizes.get(c) ?? 0) + 1);
  }
  let main = -1;
  let mainSize = 0;
  for (const [c, size] of sizes) {
    if (size > mainSize || (size === mainSize && c < main)) {
      main = c;
      mainSize = size;
    }
  }
  const inMain: number[] = [];
  for (let i = 0; i < graph.nodes.length; i++) {
    if (!graph.inWater[i] && graph.componentOf[i] === main) inMain.push(i);
  }
  const junction = (i: number): boolean => graph.adjacency[i]!.length >= 3;
  const onMajor = (i: number): boolean =>
    graph.adjacency[i]!.some((ei) => graph.edges[ei]!.major && !graph.edges[ei]!.bridge);
  let candidates = inMain.filter((i) => junction(i) && onMajor(i));
  if (candidates.length === 0) candidates = inMain.filter(junction);
  if (candidates.length === 0) candidates = inMain;
  const score = new Map<number, number>();
  for (const c of candidates) {
    const dist = distancesFrom(graph, c);
    let total = 0;
    for (const i of inMain) total += dist[i]!;
    score.set(c, total);
  }
  const ranked = [...candidates].sort((a, b) => score.get(a)! - score.get(b)! || a - b);
  centralCache.set(graph, ranked);
  return ranked;
}

/**
 * A uniformly random point inside the polygon that also satisfies `accept`, by bounding-box
 * rejection. Two draws per try; null after `maxTries` misses.
 */
export function randomPointInPolygon(
  poly: readonly Pt[],
  prng: Prng,
  accept: (p: Pt) => boolean = () => true,
  maxTries = 32,
): Pt | null {
  if (poly.length < 3) return null;
  const box = polygonBbox(poly);
  for (let i = 0; i < maxTries; i++) {
    const p = { x: prng.float(box.minX, box.maxX), y: prng.float(box.minY, box.maxY) };
    if (pointInPolygon(p, poly) && accept(p)) return p;
  }
  return null;
}
