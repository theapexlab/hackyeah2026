import { type NodeView, Prng, type Snapshot } from '@pomoc/core';
import {
  allClear,
  autoRespond,
  broadcastAlert,
  declareMode,
  sendRandomRequest,
  sendRequest,
  toggleCells,
  toggleGrid,
} from './commands';

export type EventGroup = 'infrastructure' | 'authority' | 'citizens' | 'playback' | 'view';

/** UI-side actions an event may trigger; provided by ui/eventContext.ts. */
export interface EventViewActions {
  togglePlaying(): void;
  step(): void;
  speedUp(): void;
  speedDown(): void;
  toggleRanges(): void;
  toggleTopologyPackets(): void;
  fitView(): void;
  toggleColorScheme(): void;
  deselect(): void;
}

export interface EventContext {
  readonly snapshot: Snapshot;
  readonly view: EventViewActions;
}

export interface DemoEvent {
  /** Stable identifier, e.g. 'toggle-cells'. */
  readonly key: string;
  readonly label: string;
  readonly hint: string;
  /** Key as shown in <Kbd>. */
  readonly hotkey: string;
  /** Bindings in @mantine/hooks useHotkeys syntax (aliases allowed). */
  readonly hotkeys: readonly string[];
  readonly group: EventGroup;
  readonly run: (ctx: EventContext) => void;
}

export const CANNED_ALERT_TEXT =
  'OFFICIAL ALERT: river flooding reported in the east district. Avoid low-lying streets. Shelters open at schools 3 and 7.';

export const FORGED_REQUEST_TEXT = 'URGENT: need rescue at the old bridge (forged credential)';

/**
 * A random alive unregistered phone, else a random alive phone; null when the world has none.
 * The pick is seeded by `salt` (world seed and tick at the call site), so it varies between
 * presses yet a reset world replays the same forger.
 */
export function pickForgerySource(nodes: readonly NodeView[], salt = 0): NodeView | null {
  const phones = nodes.filter((n) => n.kind === 'mobile' && n.alive);
  const unregistered = phones.filter((n) => n.credentialKind === 'none');
  const pool = unregistered.length > 0 ? unregistered : phones;
  return pool.length > 0 ? new Prng(salt).pick(pool) : null;
}

export const DEMO_EVENTS: readonly DemoEvent[] = [
  {
    key: 'toggle-cells',
    label: 'Cells up / down',
    hint: 'Cellular outage: phones lose WAN and fall into L1 after a few ticks.',
    hotkey: 'c',
    hotkeys: ['c'],
    group: 'infrastructure',
    run: () => {
      toggleCells();
    },
  },
  {
    key: 'toggle-grid',
    label: 'Switch grid off / on',
    hint: 'Power grid outage: routers without battery go dark; islands form.',
    hotkey: 'g',
    hotkeys: ['g'],
    group: 'infrastructure',
    run: () => {
      toggleGrid();
    },
  },
  {
    key: 'declare-l1',
    label: 'Declare L1 Disruption',
    hint: 'Authority declares L1 for the whole area.',
    hotkey: '1',
    hotkeys: ['1'],
    group: 'authority',
    run: () => {
      declareMode('L1');
    },
  },
  {
    key: 'declare-l2',
    label: 'Declare L2 Disaster',
    hint: 'Authority declares L2 for the whole area.',
    hotkey: '2',
    hotkeys: ['2'],
    group: 'authority',
    run: () => {
      declareMode('L2');
    },
  },
  {
    key: 'declare-l3',
    label: 'Declare L3 Security',
    hint: 'Authority declares L3 for the whole area: reduced emission, 6-hop cap.',
    hotkey: '3',
    hotkeys: ['3'],
    group: 'authority',
    run: () => {
      declareMode('L3');
    },
  },
  {
    key: 'all-clear',
    label: 'All-clear',
    hint: 'Authority lifts the declaration; L3 steps down through L1.',
    hotkey: '0',
    hotkeys: ['0'],
    group: 'authority',
    run: () => {
      allClear();
    },
  },
  {
    key: 'broadcast-alert',
    label: 'Distribute emergency message',
    hint: 'Official alert injected at every node with a backhaul, then flooded.',
    hotkey: 'a',
    hotkeys: ['a'],
    group: 'authority',
    run: () => {
      broadcastAlert(CANNED_ALERT_TEXT);
    },
  },
  {
    key: 'random-request',
    label: 'Random request',
    hint: 'A random citizen phone sends a request allowed in its current mode.',
    hotkey: 'r',
    hotkeys: ['r'],
    group: 'citizens',
    run: () => {
      sendRandomRequest();
    },
  },
  {
    key: 'auto-respond',
    label: 'Act upon requests',
    hint: 'The nearest eligible phone accepts the oldest open request.',
    hotkey: 'x',
    hotkeys: ['x'],
    group: 'citizens',
    run: () => {
      autoRespond({ strategy: 'nearest-hops' });
    },
  },
  {
    key: 'forged-request',
    label: 'Forged request',
    hint: 'An unregistered phone forges a citizen credential; every neighbour drops it.',
    hotkey: 'f',
    hotkeys: ['f'],
    group: 'citizens',
    run: ({ snapshot }) => {
      const source = pickForgerySource(
        snapshot.nodes,
        Math.imul(snapshot.world.seed, 31) + snapshot.tick,
      );
      if (!source) return;
      sendRequest(
        source.id,
        'LIFE_CRITICAL',
        { kind: 'REQUEST', text: FORGED_REQUEST_TEXT },
        { forge: { claimKind: 'citizen' } },
      );
    },
  },
  {
    key: 'play-pause',
    label: 'Play / pause',
    hint: 'Run or stop the tick clock.',
    hotkey: 'space',
    hotkeys: ['space'],
    group: 'playback',
    run: ({ view }) => view.togglePlaying(),
  },
  {
    key: 'step',
    label: 'Step one tick',
    hint: 'Advance exactly one tick.',
    hotkey: '.',
    hotkeys: ['.'],
    group: 'playback',
    run: ({ view }) => view.step(),
  },
  {
    key: 'speed-up',
    label: 'Faster',
    hint: 'Next playback speed.',
    hotkey: '+',
    hotkeys: ['[plus]', 'shift+[plus]', '='],
    group: 'playback',
    run: ({ view }) => view.speedUp(),
  },
  {
    key: 'speed-down',
    label: 'Slower',
    hint: 'Previous playback speed.',
    hotkey: '-',
    hotkeys: ['-'],
    group: 'playback',
    run: ({ view }) => view.speedDown(),
  },
  {
    key: 'toggle-ranges',
    label: 'Range circles',
    hint: 'Show each node radio range.',
    hotkey: 'v',
    hotkeys: ['v'],
    group: 'view',
    run: ({ view }) => view.toggleRanges(),
  },
  {
    key: 'toggle-topology',
    label: 'Topology packets',
    hint: 'Show gossip traffic (hidden by default).',
    hotkey: 't',
    hotkeys: ['t'],
    group: 'view',
    run: ({ view }) => view.toggleTopologyPackets(),
  },
  {
    key: 'fit-view',
    label: 'Fit view',
    hint: 'Frame the whole area.',
    hotkey: 'h',
    hotkeys: ['h'],
    group: 'view',
    run: ({ view }) => view.fitView(),
  },
  {
    key: 'toggle-scheme',
    label: 'Dark / light',
    hint: 'Toggle colour scheme.',
    hotkey: 'd',
    hotkeys: ['d'],
    group: 'view',
    run: ({ view }) => view.toggleColorScheme(),
  },
  {
    key: 'deselect',
    label: 'Deselect',
    hint: 'Close the inspector.',
    hotkey: 'Esc',
    hotkeys: ['escape'],
    group: 'view',
    run: ({ view }) => view.deselect(),
  },
];

export function findEvent(key: string): DemoEvent | undefined {
  return DEMO_EVENTS.find((event) => event.key === key);
}

export function eventsInGroup(group: EventGroup): readonly DemoEvent[] {
  return DEMO_EVENTS.filter((event) => event.group === group);
}
