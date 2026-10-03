import { MODE_POLICIES } from '@pomoc/core';
import { simCommands } from './commands';
import { useSimStore } from './store';

export interface SimEventDef {
  key: string;
  label: string;
  hint: string;
  run: () => void;
}

const snapshot = () => useSimStore.getState().snapshot;

/** The B4 event table: one entry per hotkey that dispatches an engine command. */
export const simEvents: readonly SimEventDef[] = [
  {
    key: 'c',
    label: 'Cells up / down',
    hint: 'Toggle the cellular network',
    run: () => simCommands.setCellsUp(!(snapshot()?.world.cellsUp ?? true)),
  },
  {
    key: 'g',
    label: 'Grid off / on',
    hint: 'Toggle the power grid (routers go dark)',
    run: () => simCommands.setGridUp(!(snapshot()?.world.gridUp ?? true)),
  },
  {
    key: '1',
    label: 'Emergency L1',
    hint: 'Declare L1 Disruption for the whole area',
    run: () => simCommands.declareMode('L1'),
  },
  {
    key: '2',
    label: 'Emergency L2',
    hint: 'Declare L2 Disaster for the whole area',
    run: () => simCommands.declareMode('L2'),
  },
  {
    key: '3',
    label: 'Emergency L3',
    hint: 'Declare L3 Security for the whole area',
    run: () => simCommands.declareMode('L3'),
  },
  {
    key: '0',
    label: 'All-clear',
    hint: 'Authority lifts the emergency',
    run: () => simCommands.allClear(),
  },
  {
    key: 'a',
    label: 'Emergency message',
    hint: 'Distribute an official alert',
    run: () =>
      simCommands.broadcastAlert('Official alert: follow instructions from the Authority.'),
  },
  {
    key: 'r',
    label: 'Random request',
    hint: 'A random citizen sends a request (class drawn from its mode)',
    run: () => simCommands.sendRandomRequest(),
  },
  {
    key: 'x',
    label: 'Act upon requests',
    hint: 'Nearest eligible node accepts the oldest open request',
    run: () => simCommands.autoRespond('nearest-hops'),
  },
  {
    key: 'f',
    label: 'Forged request',
    hint: 'Unregistered phone claims a citizen credential',
    run: () => {
      const unregistered = (snapshot()?.nodes ?? []).filter(
        (n) => n.kind === 'mobile' && n.alive && n.credentialKind === 'none',
      );
      const from = unregistered[(snapshot()?.tick ?? 0) % Math.max(1, unregistered.length)];
      if (!from) return;
      const cls = MODE_POLICIES[from.mode].originClasses[0] ?? 'LIFE_CRITICAL';
      simCommands.sendRequest(from.id, cls, 'Forged request', {
        forge: { claimKind: 'citizen' },
      });
    },
  },
];
