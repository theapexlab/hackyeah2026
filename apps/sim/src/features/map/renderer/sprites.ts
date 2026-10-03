const cache = new Map<string, HTMLCanvasElement>();

/** Pre-rendered radial-gradient glow; `hot` adds a white core (LIFE_CRITICAL). */
export function pulseSprite(color: string, hot: boolean, size = 24): HTMLCanvasElement {
  const key = `${color}|${hot}|${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = size * 2;
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(size, size, 0, size, size, size);
    g.addColorStop(0, hot ? '#ffffff' : color);
    g.addColorStop(hot ? 0.22 : 0.18, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size * 2, size * 2);
  }
  cache.set(key, c);
  return c;
}
