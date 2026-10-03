import type { EdgeView, NodeView } from '@pomoc/core';
import type { Transform } from '../../../lib/geometry';

export function drawEdges(
  ctx: CanvasRenderingContext2D,
  edges: EdgeView[],
  nodes: NodeView[],
  transform: Transform,
  gridColor: string,
) {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;

  for (const edge of edges) {
    const a = nodeMap.get(edge.a);
    const b = nodeMap.get(edge.b);
    if (!a || !b) continue;

    const x1 = (a.x - transform.x) * transform.k;
    const y1 = (a.y - transform.y) * transform.k;
    const x2 = (b.x - transform.x) * transform.k;
    const y2 = (b.y - transform.y) * transform.k;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
}

export function drawRangeCircles(
  ctx: CanvasRenderingContext2D,
  nodes: NodeView[],
  transform: Transform,
  rangeColor: string,
) {
  ctx.strokeStyle = rangeColor;
  ctx.lineWidth = 0.5;
  ctx.globalAlpha = 0.3;

  for (const node of nodes) {
    const x = (node.x - transform.x) * transform.k;
    const y = (node.y - transform.y) * transform.k;
    const r = node.range * transform.k;

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
}
