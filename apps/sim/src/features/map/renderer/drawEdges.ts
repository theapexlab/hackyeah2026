import type { EdgeView, NodeView } from '@pomoc/core';
import type { Palette } from '../../../theme/tokens';

type Quality = EdgeView['quality'];
export type EdgePaths = Record<Quality, Path2D>;

/** Edge geometry per link quality; rebuilt only when edges or node positions change. */
export function buildEdgePaths(
  edges: readonly EdgeView[],
  nodeById: Map<string, NodeView>,
): EdgePaths {
  const paths: EdgePaths = { near: new Path2D(), medium: new Path2D(), far: new Path2D() };
  for (const e of edges) {
    const a = nodeById.get(e.a);
    const b = nodeById.get(e.b);
    if (!a || !b) continue;
    paths[e.quality].moveTo(a.x, a.y);
    paths[e.quality].lineTo(b.x, b.y);
  }
  return paths;
}

export function drawEdges(
  ctx: CanvasRenderingContext2D,
  paths: EdgePaths,
  palette: Palette,
  k: number,
): void {
  for (const q of ['far', 'medium', 'near'] as const) {
    ctx.strokeStyle = palette.edge[q];
    ctx.lineWidth = (q === 'near' ? 1.6 : q === 'medium' ? 1.2 : 0.9) / k;
    ctx.stroke(paths[q]);
  }
}

export function drawRangeCircles(
  ctx: CanvasRenderingContext2D,
  nodes: readonly NodeView[],
  palette: Palette,
  k: number,
  emphasised: ReadonlySet<string>,
): void {
  ctx.lineWidth = 1 / k;
  for (const n of nodes) {
    if (!n.alive) continue;
    ctx.globalAlpha = emphasised.has(n.id) ? 0.9 : 0.35;
    ctx.strokeStyle = palette.range;
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.range, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
