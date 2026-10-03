export interface MapControls {
  fit: () => void;
  focus: (nodeId: string) => void;
}

const noop: MapControls = { fit: () => {}, focus: () => {} };
let controls: MapControls = noop;

/** MapView registers its zoom controls here so hotkeys and overlays can reach them. */
export function registerMapControls(next: MapControls): () => void {
  controls = next;
  return () => {
    if (controls === next) controls = noop;
  };
}

export const mapControls: MapControls = {
  fit: () => controls.fit(),
  focus: (id) => controls.focus(id),
};
