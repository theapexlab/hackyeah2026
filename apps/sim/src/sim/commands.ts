import {
  Command,
  CredentialKind,
  type MessageClass,
  Mode,
  messageIdFromString,
  type NodeId,
} from '@pomoc/core';
import { useSimStore } from './store';

export const simCommands = {
  resetWorld: (worldConfig: any) => {
    const engine = useSimStore.getState().engine;
    if (engine) engine.dispatch({ type: 'RESET_WORLD', world: worldConfig } as any);
  },

  setCellsUp: (up: boolean) => {
    const engine = useSimStore.getState().engine;
    if (engine) engine.dispatch({ type: 'SET_CELLS_UP', up } as any);
  },

  setGridUp: (up: boolean) => {
    const engine = useSimStore.getState().engine;
    if (engine) engine.dispatch({ type: 'SET_GRID_UP', up } as any);
  },

  setNodePowered: (nodeId: NodeId, powered: boolean | null) => {
    const engine = useSimStore.getState().engine;
    if (engine) engine.dispatch({ type: 'SET_NODE_POWERED', nodeId, powered } as any);
  },

  moveNode: (nodeId: NodeId, x: number, y: number) => {
    const engine = useSimStore.getState().engine;
    if (engine) engine.dispatch({ type: 'MOVE_NODE', nodeId, x, y } as any);
  },

  setMobility: (enabled: boolean, stepMetres?: number) => {
    const engine = useSimStore.getState().engine;
    if (engine) engine.dispatch({ type: 'SET_MOBILITY', enabled, stepMetres } as any);
  },

  setConfig: (patch: any) => {
    const engine = useSimStore.getState().engine;
    if (engine) engine.dispatch({ type: 'SET_CONFIG', patch } as any);
  },

  declareMode: (
    level: 'L1' | 'L2' | 'L3',
    region?: any,
    durationTicks?: number,
    forged?: boolean,
  ) => {
    const engine = useSimStore.getState().engine;
    if (engine)
      engine.dispatch({ type: 'DECLARE_MODE', level, region, durationTicks, forged } as any);
  },

  allClear: (region?: any, forged?: boolean) => {
    const engine = useSimStore.getState().engine;
    if (engine) engine.dispatch({ type: 'ALL_CLEAR', region, forged } as any);
  },

  broadcastAlert: (text: string, region?: any, forged?: boolean) => {
    const engine = useSimStore.getState().engine;
    if (engine) engine.dispatch({ type: 'BROADCAST_ALERT', text, region, forged } as any);
  },

  sendRequest: (
    from: NodeId,
    messageClass: MessageClass,
    payload: any,
    hopLimit?: number,
    forge?: any,
  ) => {
    const engine = useSimStore.getState().engine;
    if (engine)
      engine.dispatch({
        type: 'SEND_REQUEST',
        from,
        class: messageClass,
        payload,
        hopLimit,
        forge,
      } as any);
  },

  sendCheckIn: (from: NodeId, status: 'OK' | 'NEED_EVACUATION' | 'TRAPPED') => {
    const engine = useSimStore.getState().engine;
    if (engine) engine.dispatch({ type: 'SEND_CHECK_IN', from, status } as any);
  },

  sendRandomRequest: (from?: NodeId) => {
    const engine = useSimStore.getState().engine;
    if (engine) engine.dispatch({ type: 'SEND_RANDOM_REQUEST', from } as any);
  },

  accept: (nodeId: NodeId, requestId: string) => {
    const engine = useSimStore.getState().engine;
    if (engine)
      engine.dispatch({ type: 'ACCEPT', nodeId, requestId: messageIdFromString(requestId) } as any);
  },

  autoRespond: (requestId?: string, strategy?: 'nearest-hops' | 'random') => {
    const engine = useSimStore.getState().engine;
    if (engine)
      engine.dispatch({
        type: 'AUTO_RESPOND',
        requestId: requestId ? messageIdFromString(requestId) : undefined,
        strategy: strategy ?? 'nearest-hops',
      } as any);
  },

  close: (requestId: string) => {
    const engine = useSimStore.getState().engine;
    if (engine)
      engine.dispatch({ type: 'CLOSE', requestId: messageIdFromString(requestId) } as any);
  },
};
