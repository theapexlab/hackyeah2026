import type { Transform } from '../../../lib/geometry';

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  transform: Transform,
  gridColor: string,
  spacing = 100,
) {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;

  const x0 = Math.floor(transform.x / spacing) * spacing;
  const y0 = Math.floor(transform.y / spacing) * spacing;

  // Vertical lines
  for (let x = x0; x < transform.x + width / transform.k; x += spacing) {
    const sx = (x - transform.x) * transform.k;
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, height);
    ctx.stroke();
  }

  // Horizontal lines
  for (let y = y0; y < transform.y + height / transform.k; y += spacing) {
    const sy = (y - transform.y) * transform.k;
    ctx.beginPath();
    ctx.moveTo(0, sy);
    ctx.lineTo(width, sy);
    ctx.stroke();
  }
}

export function drawModeVignette(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  color: string,
  intensity = 0.3,
) {
  const gradient = ctx.createRadialGradient(
    width / 2,
    height / 2,
    0,
    width / 2,
    height / 2,
    Math.max(width, height),
  );
  gradient.addColorStop(0, 'transparent');
  gradient.addColorStop(
    1,
    color +
      Math.floor(intensity * 255)
        .toString(16)
        .padStart(2, '0'),
  );

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

export function drawRegionTint(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radius: number,
  color: string,
  transform: Transform,
) {
  const sx = (centerX - transform.x) * transform.k;
  const sy = (centerY - transform.y) * transform.k;
  const sr = radius * transform.k;

  ctx.fillStyle = color + '33';
  ctx.beginPath();
  ctx.arc(sx, sy, sr, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = color + '77';
  ctx.lineWidth = 1;
  ctx.stroke();
}
