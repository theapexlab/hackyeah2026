import type { EdgeQuality, EdgeView, NodeView, Snapshot } from '@pomoc/core';
import { nodeIndex } from '../../../sim/selectors';
import type { Palette } from '../../../theme/tokens';

/**
 * Edges baked into Path2Ds, keyed on the arrays they were built from: router-to-router links
 * (the backbone, drawn faint so the routers do not dominate the map) in one path, every
 * other link in one path per quality bucket.
 */
export interface EdgePaths {
  readonly edges: readonly EdgeView[];
  readonly nodes: readonly NodeView[];
  readonly byQuality: Readonly<Record<EdgeQuality, Path2D>>;
  readonly backbone: Path2D;
  readonly count: number;
}

/** A link between two routers: part of the faint backbone. */
export function isBackboneEdge(a: Pick<NodeView, 'kind'>, b: Pick<NodeView, 'kind'>): boolean {
  return a.kind === 'router' && b.kind === 'router';
}

export function buildEdgePaths(nodes: readonly NodeView[], edges: readonly EdgeView[]): EdgePaths {
  const index = nodeIndex(nodes);
  const byQuality: Record<EdgeQuality, Path2D> = {
    near: new Path2D(),
    medium: new Path2D(),
    far: new Path2D(),
  };
  const backbone = new Path2D();
  let count = 0;
  for (const edge of edges) {
    const a = index.get(edge.a);
    const b = index.get(edge.b);
    if (!a || !b) continue;
    const path = isBackboneEdge(a, b) ? backbone : byQuality[edge.quality];
    path.moveTo(a.x, a.y);
    path.lineTo(b.x, b.y);
    count += 1;
  }
  return { edges, nodes, byQuality, backbone, count };
}

/** True when the cache must be rebuilt: new edges, or moving nodes under an unchanged adjacency. */
export function edgePathsStale(
  cache: EdgePaths | null,
  snapshot: Pick<Snapshot, 'edges' | 'nodes' | 'world'>,
): boolean {
  if (cache === null || cache.edges !== snapshot.edges) return true;
  return snapshot.world.mobility && cache.nodes !== snapshot.nodes;
}

/** Fill the whole canvas (screen space, before the world transform is applied). */
export function drawBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  palette: Palette,
): void {
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, width, height);
}

const QUALITY_ORDER: readonly EdgeQuality[] = ['far', 'medium', 'near'];
const QUALITY_WIDTH: Readonly<Record<EdgeQuality, number>> = { near: 1.4, medium: 1.1, far: 0.9 };

/** Stroke the cached edge paths; line width is divided by k so edges stay thin when zoomed. */
export function drawEdges(
  ctx: CanvasRenderingContext2D,
  paths: EdgePaths,
  palette: Palette,
  k: number,
): void {
  ctx.lineCap = 'round';
  ctx.strokeStyle = palette.edgeBackbone;
  ctx.lineWidth = palette.edgeWidth / k;
  ctx.stroke(paths.backbone);
  for (const quality of QUALITY_ORDER) {
    ctx.strokeStyle = palette.edge[quality];
    ctx.lineWidth = (palette.edgeWidth * QUALITY_WIDTH[quality]) / k;
    ctx.stroke(paths.byQuality[quality]);
  }
}

/** Radio range of every alive node as one union fill plus a hairline outline. */
export function drawRangeCircles(
  ctx: CanvasRenderingContext2D,
  nodes: readonly NodeView[],
  palette: Palette,
  k: number,
): void {
  ctx.beginPath();
  for (const node of nodes) {
    if (!node.alive) continue;
    ctx.moveTo(node.x + node.range, node.y);
    ctx.arc(node.x, node.y, node.range, 0, Math.PI * 2);
  }
  ctx.fillStyle = palette.range;
  ctx.fill();
  ctx.strokeStyle = palette.range;
  ctx.lineWidth = 1 / k;
  ctx.stroke();
}
