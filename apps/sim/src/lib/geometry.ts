export interface Vec2 {
  x: number;
  y: number;
}

export interface Transform {
  x: number;
  y: number;
  k: number;
}

export function distance(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function nearestNode(
  pos: Vec2,
  nodes: Array<{ x: number; y: number }>,
  threshold = 50,
): number {
  let nearest = -1;
  let minDist = threshold;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!node) continue;
    const d = distance(pos, node);
    if (d < minDist) {
      minDist = d;
      nearest = i;
    }
  }
  return nearest;
}

export function inCircle(pos: Vec2, center: Vec2, radius: number): boolean {
  return distance(pos, center) <= radius;
}

export function applyTransform(point: Vec2, t: Transform): Vec2 {
  return {
    x: (point.x - t.x) * t.k,
    y: (point.y - t.y) * t.k,
  };
}

export function inverseTransform(point: Vec2, t: Transform): Vec2 {
  return {
    x: point.x / t.k + t.x,
    y: point.y / t.k + t.y,
  };
}
