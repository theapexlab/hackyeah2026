import { useEffect, useRef } from 'react';
import { useSimNodes, useSimWorld } from '../../sim/selectors';
import { useUIStore } from '../../ui/store';
import { CanvasLayer } from './CanvasLayer';
import { MapOverlay } from './MapOverlay';
import { NodesLayer } from './NodesLayer';
import { useZoom } from './useZoom';

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const world = useSimWorld();
  const nodes = useSimNodes();
  const selectedNodeId = useUIStore((s) => s.selectedNodeId);
  const { transformRef, fitToWorld, focusNode } = useZoom(
    containerRef as React.RefObject<HTMLElement>,
  );

  useEffect(() => {
    if (world && containerRef.current) {
      fitToWorld(
        containerRef.current.offsetWidth,
        containerRef.current.offsetHeight,
        world.width,
        world.height,
      );
    }
  }, [world?.width, world?.height, fitToWorld]);

  const handleFitToWorld = () => {
    if (world && containerRef.current) {
      fitToWorld(
        containerRef.current.offsetWidth,
        containerRef.current.offsetHeight,
        world.width,
        world.height,
      );
    }
  };

  const handleFocusNode = () => {
    if (selectedNodeId && selectedNodeId !== 'authority' && world && containerRef.current) {
      const node = nodes.find((n) => n.id === selectedNodeId);
      if (node) {
        focusNode(
          node.x,
          node.y,
          containerRef.current.offsetWidth,
          containerRef.current.offsetHeight,
          100,
        );
      }
    }
  };

  // Register zoom functions in store for hotkey access
  const setFitToWorld = useUIStore((s) => s.setFitToWorld);
  const setFocusNode = useUIStore((s) => s.setFocusNode);

  useEffect(() => {
    setFitToWorld(() => handleFitToWorld);
    setFocusNode(() => handleFocusNode);
  }, [handleFitToWorld, handleFocusNode, setFitToWorld, setFocusNode]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        backgroundColor: '#1a1b1e',
      }}
      onDoubleClick={handleFocusNode}
    >
      <CanvasLayer transformRef={transformRef} />
      <NodesLayer transform={transformRef.current} />
      <MapOverlay onFitToWorld={handleFitToWorld} onFocusNode={handleFocusNode} />
    </div>
  );
}
