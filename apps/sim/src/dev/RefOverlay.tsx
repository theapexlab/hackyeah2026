/**
 * DEV ONLY (?ref=1): the map screenshot the Kraków terrain was traced from, laid under the
 * nodes in world coordinates, to check the trace while panning and zooming. The image is
 * third-party imagery kept out of git (apps/sim/dev-ref/ is ignored) and out of builds
 * (it is not under public/). Loaded lazily by MapView.
 */
import { KRAKOW_TERRAIN_ID } from '@pomoc/core';
import { useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { ZoomController } from '../features/map/useZoom';
import type { Transform } from '../lib/geometry';
import { useSimStore } from '../sim/store';

const REF_SRC = '/dev-ref/krakow-ref.webp';

export function RefOverlay({ zoom }: { readonly zoom: ZoomController }) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const { id, width, height } = useSimStore(
    useShallow((s) => ({
      id: s.snapshot.terrain.id,
      width: s.snapshot.terrain.width,
      height: s.snapshot.terrain.height,
    })),
  );
  const visible = id === KRAKOW_TERRAIN_ID;

  useEffect(() => {
    if (!visible) return;
    const apply = (t: Transform): void => {
      const el = imgRef.current;
      if (el) el.style.transform = `translate(${t.x}px, ${t.y}px) scale(${t.k})`;
    };
    apply(zoom.transformRef.current);
    return zoom.onTransform(apply);
  }, [zoom, visible]);

  if (!visible) return null;
  return (
    <img
      ref={imgRef}
      src={REF_SRC}
      alt=""
      draggable={false}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width,
        height,
        maxWidth: 'none',
        transformOrigin: '0 0',
        opacity: 0.45,
        pointerEvents: 'none',
      }}
    />
  );
}
