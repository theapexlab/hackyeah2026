import type { MessageClass } from '@pomoc/core';
import { classColors } from '../../../theme/tokens';

export function createPulseSprite(
  canvas: HTMLCanvasElement,
  color: string,
  size = 20,
): CanvasImageSource {
  const ctx = canvas.getContext('2d')!;
  canvas.width = size * 2;
  canvas.height = size * 2;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const gradient = ctx.createRadialGradient(size, size, 0, size, size, size);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, 'transparent');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  return canvas;
}

export function createBurstSprite(canvas: HTMLCanvasElement, size = 30): CanvasImageSource {
  const ctx = canvas.getContext('2d')!;
  canvas.width = size * 2;
  canvas.height = size * 2;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const gradient = ctx.createRadialGradient(size, size, 0, size, size, size);
  gradient.addColorStop(0, '#ff6b6b');
  gradient.addColorStop(0.5, 'rgba(255, 107, 107, 0.5)');
  gradient.addColorStop(1, 'transparent');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  return canvas;
}

export const spriteCache = new Map<MessageClass, CanvasImageSource>();

export function getPulseSprite(cls: MessageClass): CanvasImageSource {
  if (!spriteCache.has(cls)) {
    const canvas = document.createElement('canvas');
    const color = classColors[cls] || '#4dabf7';
    spriteCache.set(cls, createPulseSprite(canvas, color));
  }
  return spriteCache.get(cls)!;
}
