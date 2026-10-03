import { DEFAULT_WORLD_CONFIG, type WorldConfig } from '@pomoc/core';
import { create } from 'zustand';

export type InspectorTab = 'inbox' | 'store' | 'log';
export type Speed = 0.5 | 1 | 2 | 4;
export const SPEEDS: readonly Speed[] = [0.5, 1, 2, 4];
export const AUTHORITY = 'authority';

export interface ConfigDraft {
  seed: string;
  width: number;
  height: number;
  mobiles: number;
  routers: number;
  gateways: number;
  mobileRange: number;
  routerRange: number;
  gatewayRange: number;
  unregisteredFraction: number;
  mobility: boolean;
  tickMs: number;
}

/**
 * Demo preset. Core's DEFAULT_WORLD_CONFIG (40 phones, ranges 60/120/150) generates 40 islands and
 * ~10 % reachability at seed 42, which defeats the demo; this preset yields one connected mesh.
 */
export const DEFAULT_DRAFT: ConfigDraft = {
  seed: String(DEFAULT_WORLD_CONFIG.seed),
  width: DEFAULT_WORLD_CONFIG.width,
  height: DEFAULT_WORLD_CONFIG.height,
  mobiles: 100,
  routers: 30,
  gateways: DEFAULT_WORLD_CONFIG.gateways,
  mobileRange: 100,
  routerRange: 160,
  gatewayRange: 200,
  unregisteredFraction: DEFAULT_WORLD_CONFIG.unregisteredFraction,
  mobility: false,
  tickMs: 250,
};

export function worldFromDraft(d: ConfigDraft): WorldConfig {
  return {
    ...DEFAULT_WORLD_CONFIG,
    seed: /^\d+$/.test(d.seed) ? Number(d.seed) : d.seed,
    width: d.width,
    height: d.height,
    mobiles: d.mobiles,
    routers: d.routers,
    gateways: d.gateways,
    range: { mobile: d.mobileRange, router: d.routerRange, gateway: d.gatewayRange },
    unregisteredFraction: d.unregisteredFraction,
  };
}

interface UIStore {
  /** A node id or `'authority'`. */
  selectedNodeId: string | null;
  lastNodeId: string | null;
  hoveredNodeId: string | null;
  inspectorTab: InspectorTab;
  highlightedMessageId: string | null;
  playing: boolean;
  speed: Speed;
  showRanges: boolean;
  showTopologyPackets: boolean;
  navOpen: boolean;
  followLog: boolean;
  shortcutsOpen: boolean;
  authorityFlash: number;
  configDraft: ConfigDraft;

  select: (id: string | null) => void;
  setHovered: (id: string | null) => void;
  setInspectorTab: (tab: InspectorTab) => void;
  setHighlightedMessageId: (id: string | null) => void;
  setPlaying: (playing: boolean) => void;
  setSpeed: (speed: Speed) => void;
  setShowRanges: (show: boolean) => void;
  setShowTopologyPackets: (show: boolean) => void;
  setNavOpen: (open: boolean) => void;
  setFollowLog: (follow: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
  flashAuthority: () => void;
  patchConfigDraft: (patch: Partial<ConfigDraft>) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  selectedNodeId: null,
  lastNodeId: null,
  hoveredNodeId: null,
  inspectorTab: 'inbox',
  highlightedMessageId: null,
  playing: true,
  speed: 1,
  showRanges: false,
  showTopologyPackets: false,
  navOpen: true,
  followLog: true,
  shortcutsOpen: false,
  authorityFlash: 0,
  configDraft: DEFAULT_DRAFT,

  select: (id) =>
    set((s) => ({
      selectedNodeId: id,
      lastNodeId: id && id !== AUTHORITY ? id : s.lastNodeId,
    })),
  setHovered: (id) => set({ hoveredNodeId: id }),
  setInspectorTab: (inspectorTab) => set({ inspectorTab }),
  setHighlightedMessageId: (highlightedMessageId) => set({ highlightedMessageId }),
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed }),
  setShowRanges: (showRanges) => set({ showRanges }),
  setShowTopologyPackets: (showTopologyPackets) => set({ showTopologyPackets }),
  setNavOpen: (navOpen) => set({ navOpen }),
  setFollowLog: (followLog) => set({ followLog }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  flashAuthority: () => set((s) => ({ authorityFlash: s.authorityFlash + 1 })),
  patchConfigDraft: (patch) => set((s) => ({ configDraft: { ...s.configDraft, ...patch } })),
}));
