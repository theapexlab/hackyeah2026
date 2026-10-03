import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { nodeIndex } from '../../sim/selectors';
import { useSimStore } from '../../sim/store';
import { useUiStore } from '../../ui/store';
import { CanvasLayer } from './CanvasLayer';
import './map.css';
import { MapOverlay } from './MapOverlay';
import { NodesLayer } from './NodesLayer';
import { useZoom } from './useZoom';

interface Size {
  readonly width: number;
  readonly height: number;
}

/** The district plane: canvas (moving things) + SVG (clickable nodes) + HTML overlay, one shared transform. */
export function MapView() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gRef = useRef<SVGGElement | null>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const zoom = useZoom(containerRef, gRef);
  const worldEpoch = useSimStore((s) => s.worldEpoch);
  const world = useSimStore(
    useShallow((s) => ({ width: s.snapshot.world.width, height: s.snapshot.world.height })),
  );
  const viewRequest = useUiStore((s) => s.viewRequest);
  const hasSize = size.width > 0 && size.height > 0;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize((prev) =>
        prev.width === width && prev.height === height ? prev : { width, height },
      );
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Fit on a new world and when the container first gets a size.
  useEffect(() => {
    if (!hasSize) return;
    zoom.fitToWorld(world.width, world.height, worldEpoch > 0);
  }, [zoom, hasSize, worldEpoch, world.width, world.height]);

  // One-shot camera requests from hotkeys, overlay buttons and node double-clicks. Each
  // request is consumed exactly once (by seq), so a later world change cannot replay it.
  const handledSeq = useRef(0);
  useEffect(() => {
    if (!viewRequest || !hasSize || viewRequest.seq === handledSeq.current) return;
    handledSeq.current = viewRequest.seq;
    const { snapshot } = useSimStore.getState();
    if (viewRequest.kind === 'fit') {
      zoom.fitToWorld(snapshot.world.width, snapshot.world.height);
      return;
    }
    const node = nodeIndex(snapshot.nodes).get(viewRequest.nodeId);
    if (node) zoom.focusNode(node.x, node.y);
  }, [zoom, viewRequest, hasSize]);

  return (
    <div
      ref={containerRef}
      className="pomoc-map"
      style={{
        position: 'relative',
        flex: 1,
        minHeight: 0,
        overflow: 'hidden',
        cursor: 'grab',
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      <CanvasLayer width={size.width} height={size.height} zoom={zoom} />
      <NodesLayer gRef={gRef} transformRef={zoom.transformRef} />
      <MapOverlay zoom={zoom} />
    </div>
  );
}
