import { useEffect, useRef } from 'react';
import { useSimStore } from '../../sim/store';
import { CanvasLayer } from './CanvasLayer';
import { MapOverlay } from './MapOverlay';
import { registerMapControls } from './mapControls';
import { NodesLayer } from './NodesLayer';
import { useZoom } from './useZoom';

const getWorld = () => {
  const w = useSimStore.getState().snapshot?.world;
  return { width: w?.width ?? 0, height: w?.height ?? 0 };
};
const getNodePos = (id: string) => useSimStore.getState().snapshot?.nodes.find((n) => n.id === id);

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const groupRef = useRef<SVGGElement>(null);
  const generation = useSimStore((s) => s.generation);
  const { transformRef, fitToWorld, focusNode } = useZoom({
    containerRef,
    groupRef,
    svgRef,
    getWorld,
    getNodePos,
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: generation is the refit trigger
  useEffect(() => fitToWorld(false), [generation, fitToWorld]);
  useEffect(
    () => registerMapControls({ fit: () => fitToWorld(true), focus: focusNode }),
    [fitToWorld, focusNode],
  );

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        overflow: 'hidden',
        touchAction: 'none',
        background: 'light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-8))',
      }}
    >
      <CanvasLayer transformRef={transformRef} />
      <NodesLayer svgRef={svgRef} groupRef={groupRef} transformRef={transformRef} />
      <MapOverlay />
    </div>
  );
}
