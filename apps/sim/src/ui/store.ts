import type { MessageId, NodeId, WorldConfig } from '@pomoc/core';
import { DEFAULT_WORLD_CONFIG } from '@pomoc/core';
import { create } from 'zustand';
import {
  SPEEDS,
  type Speed,
  setPlaybackSpeed,
  startPlayback,
  stepPlayback,
  stopPlayback,
} from '../sim/playback';
import { DEFAULT_TICK_MS } from '../sim/store';

export type { Speed } from '../sim/playback';
export { SPEEDS } from '../sim/playback';

/** The virtual Authority is selectable like a node. */
export type SelectionId = NodeId | 'authority';
export type InspectorTab = 'inbox' | 'store' | 'log';

/** World config plus the two UI-owned knobs that are not part of WorldConfig. */
export interface ConfigDraft extends WorldConfig {
  readonly tickMs: number;
  readonly mobility: boolean;
}

export type ViewRequest =
  | { readonly seq: number; readonly kind: 'fit' }
  | { readonly seq: number; readonly kind: 'focus'; readonly nodeId: NodeId };

export const DEFAULT_CONFIG_DRAFT: ConfigDraft = {
  ...DEFAULT_WORLD_CONFIG,
  tickMs: DEFAULT_TICK_MS,
  // A tenth of the phones walk the streets from the first frame.
  mobility: true,
};

/** Strip the UI-only fields so the engine gets exactly a WorldConfig. */
export function draftToWorldConfig(draft: ConfigDraft): WorldConfig {
  const { tickMs: _tickMs, mobility: _mobility, ...world } = draft;
  return world;
}

export interface UiState {
  readonly selectedNodeId: SelectionId | null;
  /** Last real node that was selected; the Authority console uses it for "around a node". */
  readonly lastSelectedNodeId: NodeId | null;
  readonly hoveredNodeId: NodeId | null;
  readonly inspectorTab: InspectorTab;
  readonly highlightedMessageId: MessageId | null;
  /** Recorded hop chain of the highlighted message when the inspector knows it (inbox path). */
  readonly highlightedPath: readonly NodeId[] | null;
  readonly playing: boolean;
  readonly speed: Speed;
  readonly showRanges: boolean;
  readonly showTopologyPackets: boolean;
  readonly navOpen: boolean;
  readonly configDraft: ConfigDraft;
  readonly followLog: boolean;
  readonly shortcutsOpen: boolean;
  /** One-shot camera request consumed by MapView (seq makes repeats distinct). */
  readonly viewRequest: ViewRequest | null;

  select(id: SelectionId | null): void;
  deselect(): void;
  hover(id: NodeId | null): void;
  setInspectorTab(tab: InspectorTab): void;
  highlightMessage(id: MessageId | null, path?: readonly NodeId[] | null): void;
  setPlaying(playing: boolean): void;
  togglePlaying(): void;
  step(n?: number): void;
  setSpeed(speed: Speed): void;
  speedUp(): void;
  speedDown(): void;
  toggleRanges(): void;
  toggleTopologyPackets(): void;
  setNavOpen(open: boolean): void;
  toggleNav(): void;
  patchConfigDraft(patch: Partial<ConfigDraft>): void;
  setConfigDraft(draft: ConfigDraft): void;
  setFollowLog(follow: boolean): void;
  setShortcutsOpen(open: boolean): void;
  toggleShortcuts(): void;
  requestFit(): void;
  requestFocus(nodeId: NodeId): void;
}

let viewSeq = 0;

export const useUiStore = create<UiState>()((set, get) => ({
  selectedNodeId: null,
  lastSelectedNodeId: null,
  hoveredNodeId: null,
  inspectorTab: 'inbox',
  highlightedMessageId: null,
  highlightedPath: null,
  playing: false,
  speed: 1,
  showRanges: false,
  showTopologyPackets: false,
  navOpen: true,
  configDraft: DEFAULT_CONFIG_DRAFT,
  followLog: true,
  shortcutsOpen: false,
  viewRequest: null,

  select: (id) =>
    set((s) => ({
      selectedNodeId: id,
      lastSelectedNodeId: id !== null && id !== 'authority' ? id : s.lastSelectedNodeId,
    })),
  deselect: () =>
    set({
      selectedNodeId: null,
      highlightedMessageId: null,
      highlightedPath: null,
      shortcutsOpen: false,
    }),
  hover: (id) => {
    if (get().hoveredNodeId !== id) set({ hoveredNodeId: id });
  },
  setInspectorTab: (tab) => set({ inspectorTab: tab }),
  highlightMessage: (id, path = null) =>
    set({ highlightedMessageId: id, highlightedPath: id === null ? null : path }),
  setPlaying: (playing) => {
    if (playing) startPlayback(get().speed);
    else stopPlayback();
    set({ playing });
  },
  togglePlaying: () => get().setPlaying(!get().playing),
  step: (n = 1) => stepPlayback(n),
  setSpeed: (speed) => {
    setPlaybackSpeed(speed);
    set({ speed });
  },
  speedUp: () => {
    const i = SPEEDS.indexOf(get().speed);
    const next = SPEEDS[Math.min(SPEEDS.length - 1, i + 1)];
    if (next !== undefined) get().setSpeed(next);
  },
  speedDown: () => {
    const i = SPEEDS.indexOf(get().speed);
    const next = SPEEDS[Math.max(0, i - 1)];
    if (next !== undefined) get().setSpeed(next);
  },
  toggleRanges: () => set((s) => ({ showRanges: !s.showRanges })),
  toggleTopologyPackets: () => set((s) => ({ showTopologyPackets: !s.showTopologyPackets })),
  setNavOpen: (open) => set({ navOpen: open }),
  toggleNav: () => set((s) => ({ navOpen: !s.navOpen })),
  patchConfigDraft: (patch) => set((s) => ({ configDraft: { ...s.configDraft, ...patch } })),
  setConfigDraft: (draft) => set({ configDraft: draft }),
  setFollowLog: (follow) => set({ followLog: follow }),
  setShortcutsOpen: (open) => set({ shortcutsOpen: open }),
  toggleShortcuts: () => set((s) => ({ shortcutsOpen: !s.shortcutsOpen })),
  requestFit: () => set({ viewRequest: { seq: ++viewSeq, kind: 'fit' } }),
  requestFocus: (nodeId) => set({ viewRequest: { seq: ++viewSeq, kind: 'focus', nodeId } }),
}));
