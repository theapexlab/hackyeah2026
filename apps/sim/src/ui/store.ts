import { create } from 'zustand';

export type InspectorTab = 'inbox' | 'store' | 'log';

interface UIStore {
  selectedNodeId: string | 'authority' | null;
  setSelectedNodeId: (id: string | 'authority' | null) => void;

  hoveredNodeId: string | null;
  setHoveredNodeId: (id: string | null) => void;

  inspectorTab: InspectorTab;
  setInspectorTab: (tab: InspectorTab) => void;

  highlightedMessageId: string | null;
  setHighlightedMessageId: (id: string | null) => void;

  playing: boolean;
  setPlaying: (playing: boolean) => void;

  speed: 0.5 | 1 | 2 | 4;
  setSpeed: (speed: 0.5 | 1 | 2 | 4) => void;

  showRanges: boolean;
  setShowRanges: (show: boolean) => void;

  showTopologyPackets: boolean;
  setShowTopologyPackets: (show: boolean) => void;

  navOpen: boolean;
  setNavOpen: (open: boolean) => void;

  configDraft: Record<string, any>;
  setConfigDraft: (draft: Record<string, any>) => void;

  followLog: boolean;
  setFollowLog: (follow: boolean) => void;

  shortcutsModalOpen: boolean;
  setShortcutsModalOpen: (open: boolean) => void;

  fitToWorld: (() => void) | null;
  setFitToWorld: (fn: (() => void) | null) => void;

  focusNode: (() => void) | null;
  setFocusNode: (fn: (() => void) | null) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  selectedNodeId: null,
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),

  hoveredNodeId: null,
  setHoveredNodeId: (id) => set({ hoveredNodeId: id }),

  inspectorTab: 'inbox',
  setInspectorTab: (tab) => set({ inspectorTab: tab }),

  highlightedMessageId: null,
  setHighlightedMessageId: (id) => set({ highlightedMessageId: id }),

  playing: false,
  setPlaying: (playing) => set({ playing }),

  speed: 1,
  setSpeed: (speed) => set({ speed }),

  showRanges: false,
  setShowRanges: (show) => set({ showRanges: show }),

  showTopologyPackets: false,
  setShowTopologyPackets: (show) => set({ showTopologyPackets: show }),

  navOpen: true,
  setNavOpen: (open) => set({ navOpen: open }),

  configDraft: {},
  setConfigDraft: (draft) => set({ configDraft: draft }),

  followLog: true,
  setFollowLog: (follow) => set({ followLog: follow }),

  shortcutsModalOpen: false,
  setShortcutsModalOpen: (open) => set({ shortcutsModalOpen: open }),

  fitToWorld: null,
  setFitToWorld: (fn) => set({ fitToWorld: fn }),

  focusNode: null,
  setFocusNode: (fn) => set({ focusNode: fn }),
}));
