import { simCommands } from './commands';
import { useSimStore } from './store';

export interface SimEventDef {
  key: string;
  label: string;
  hint: string;
  run: () => void;
}

export const simEvents: SimEventDef[] = [
  {
    key: 'c',
    label: 'Cells up/down',
    hint: 'Toggle cellular uplink',
    run: () => {
      const snapshot = useSimStore.getState().snapshot;
      if (snapshot) simCommands.setCellsUp(!snapshot.world.cellsUp);
    },
  },
  {
    key: 'g',
    label: 'Grid on/off',
    hint: 'Toggle grid backbone',
    run: () => {
      const snapshot = useSimStore.getState().snapshot;
      if (snapshot) simCommands.setGridUp(!snapshot.world.gridUp);
    },
  },
  {
    key: '1',
    label: 'Trigger L1',
    hint: 'Declare emergency level 1',
    run: () => {
      simCommands.declareMode('L1', undefined, 300);
    },
  },
  {
    key: '2',
    label: 'Trigger L2',
    hint: 'Declare emergency level 2',
    run: () => {
      simCommands.declareMode('L2', undefined, 300);
    },
  },
  {
    key: '3',
    label: 'Trigger L3',
    hint: 'Declare emergency level 3',
    run: () => {
      simCommands.declareMode('L3', undefined, 300);
    },
  },
  {
    key: '0',
    label: 'All clear',
    hint: 'Cancel emergency declaration',
    run: () => {
      simCommands.allClear();
    },
  },
  {
    key: 'a',
    label: 'Broadcast alert',
    hint: 'Send official alert',
    run: () => {
      simCommands.broadcastAlert(
        'ALERT: Critical infrastructure damage. Activate emergency protocols.',
      );
    },
  },
  {
    key: 'r',
    label: 'Random request',
    hint: 'Send request from random node',
    run: () => {
      simCommands.sendRandomRequest();
    },
  },
  {
    key: 'x',
    label: 'Auto respond',
    hint: 'Accept oldest open request',
    run: () => {
      simCommands.autoRespond(undefined, 'nearest-hops');
    },
  },
  {
    key: 'f',
    label: 'Forged request',
    hint: 'Send request from unregistered node',
    run: () => {
      const snapshot = useSimStore.getState().snapshot;
      if (snapshot && snapshot.nodes.length > 0) {
        const randomNode = snapshot.nodes[Math.floor(Math.random() * snapshot.nodes.length)]!;
        simCommands.sendRequest(
          randomNode.id,
          'LEND',
          { kind: 'REQUEST', text: 'Forged message', category: 'SUPPLIES' },
          3,
          { claimKind: 'citizen' },
        );
      }
    },
  },
];
