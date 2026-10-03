import {
  type Circle,
  type Command,
  type MessageClass,
  type Mode,
  messageIdFromString,
  type NodeId,
  nodeIdFromString,
} from '@pomoc/core';
import { useSimStore } from './store';

/** The only place the UI mutates the engine. */
const dispatch = (cmd: Command): void => useSimStore.getState().engine?.dispatch(cmd);

export const simCommands = {
  setCellsUp: (up: boolean) => dispatch({ type: 'SET_CELLS_UP', up }),
  setGridUp: (up: boolean) => dispatch({ type: 'SET_GRID_UP', up }),
  setNodePowered: (nodeId: string, powered: boolean | null) =>
    dispatch({ type: 'SET_NODE_POWERED', nodeId: nodeIdFromString(nodeId), powered }),
  moveNode: (nodeId: NodeId, x: number, y: number) => dispatch({ type: 'MOVE_NODE', nodeId, x, y }),
  setMobility: (enabled: boolean, stepMetres?: number) =>
    dispatch({ type: 'SET_MOBILITY', enabled, stepMetres }),
  declareMode: (level: Exclude<Mode, 'PEACE'>, region?: Circle, durationTicks?: number) =>
    dispatch({ type: 'DECLARE_MODE', level, region, durationTicks }),
  allClear: (region?: Circle) => dispatch({ type: 'ALL_CLEAR', region }),
  broadcastAlert: (text: string, region?: Circle) =>
    dispatch({ type: 'BROADCAST_ALERT', text, region }),
  sendRequest: (
    from: string,
    messageClass: MessageClass,
    text: string,
    opts: { hopLimit?: number; price?: number; forge?: { claimKind: string } } = {},
  ) =>
    dispatch({
      type: 'SEND_REQUEST',
      from: nodeIdFromString(from),
      class: messageClass,
      text,
      ...opts,
    }),
  sendCheckIn: (from: string, status: 'OK' | 'NEED_EVACUATION' | 'TRAPPED') =>
    dispatch({ type: 'SEND_CHECK_IN', from: nodeIdFromString(from), status }),
  sendRandomRequest: (from?: string) =>
    dispatch({ type: 'SEND_RANDOM_REQUEST', from: from ? nodeIdFromString(from) : undefined }),
  accept: (nodeId: string, requestId: string) =>
    dispatch({
      type: 'ACCEPT',
      nodeId: nodeIdFromString(nodeId),
      requestId: messageIdFromString(requestId),
    }),
  autoRespond: (strategy: 'nearest-hops' | 'random' = 'nearest-hops') =>
    dispatch({ type: 'AUTO_RESPOND', strategy }),
  close: (requestId: string) =>
    dispatch({ type: 'CLOSE', requestId: messageIdFromString(requestId) }),
};
