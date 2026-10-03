import type { MessageClass } from '@pomoc/core';
import { MESSAGE_CLASSES } from '@pomoc/core';
import { type Palette, withAlpha } from '../../../theme/tokens';

/** Pre-rendered radial-gradient glow per message class, drawn with drawImage per pulse. */
export interface SpriteSet {
  /** Sprite side in device pixels. */
  readonly size: number;
  get(cls: MessageClass): HTMLCanvasElement;
  /** Small white-hot core used on top of LIFE_CRITICAL pulses. */
  readonly core: HTMLCanvasElement;
  /** Soft ring sprite in the class colour (arrival ripple fill). */
  ring(cls: MessageClass): HTMLCanvasElement;
}

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable for sprite');
  return [canvas, ctx];
}

function glowSprite(color: string, size: number, hot: string | null): HTMLCanvasElement {
  const [canvas, ctx] = makeCanvas(size);
  const r = size / 2;
  const gradient = ctx.createRadialGradient(r, r, 0, r, r, r);
  if (hot !== null) {
    gradient.addColorStop(0, hot);
    gradient.addColorStop(0.18, withAlpha(color, 1));
    gradient.addColorStop(0.42, withAlpha(color, 0.5));
    gradient.addColorStop(1, withAlpha(color, 0));
  } else {
    gradient.addColorStop(0, withAlpha(color, 1));
    gradient.addColorStop(0.22, withAlpha(color, 0.85));
    gradient.addColorStop(0.5, withAlpha(color, 0.3));
    gradient.addColorStop(1, withAlpha(color, 0));
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

function ringSprite(color: string, size: number): HTMLCanvasElement {
  const [canvas, ctx] = makeCanvas(size);
  const r = size / 2;
  const gradient = ctx.createRadialGradient(r, r, r * 0.55, r, r, r);
  gradient.addColorStop(0, withAlpha(color, 0));
  gradient.addColorStop(0.55, withAlpha(color, 0.75));
  gradient.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

/** Build every sprite once per palette; cheap enough to rebuild on a scheme toggle. */
export function createSprites(palette: Palette, size = 64): SpriteSet {
  const glows = new Map<MessageClass, HTMLCanvasElement>();
  const rings = new Map<MessageClass, HTMLCanvasElement>();
  for (const cls of MESSAGE_CLASSES) {
    glows.set(
      cls,
      glowSprite(palette.cls[cls], size, cls === 'LIFE_CRITICAL' ? palette.highlight : null),
    );
  }
  const core = glowSprite(palette.highlight, Math.round(size / 2), null);
  const fallback = glowSprite(palette.muted, size, null);
  return {
    size,
    core,
    get: (cls) => glows.get(cls) ?? fallback,
    ring: (cls) => {
      const cached = rings.get(cls);
      if (cached) return cached;
      const sprite = ringSprite(palette.cls[cls], size);
      rings.set(cls, sprite);
      return sprite;
    },
  };
}
