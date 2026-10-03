import type {
  AutoRespondStrategy,
  CheckInStatus,
  Circle,
  Command,
  CredentialKind,
  DeclaredLevel,
  EngineConfig,
  MessageClass,
  MessageId,
  NodeId,
  NodeKind,
  RequestPayload,
  WorldConfig,
} from '@pomoc/core';
import { useSimStore } from './store';

/** The only place that touches engine.dispatch. Everything else goes through the wrappers below. */
export function dispatch(command: Command): void {
  useSimStore.getState().engine.dispatch(command);
}

export function resetWorldCommand(world: WorldConfig): void {
  dispatch({ type: 'ResetWorld', world });
}

export function setCellsUp(up: boolean): void {
  dispatch({ type: 'SetCellsUp', up });
}

/** Flip the cellular network; returns the new state. */
export function toggleCells(): boolean {
  const up = !useSimStore.getState().snapshot.world.cellsUp;
  setCellsUp(up);
  return up;
}

export function setGridUp(up: boolean): void {
  dispatch({ type: 'SetGridUp', up });
}

/** Flip the power grid; returns the new state. */
export function toggleGrid(): boolean {
  const up = !useSimStore.getState().snapshot.world.gridUp;
  setGridUp(up);
  return up;
}

export function setNodePowered(nodeId: NodeId, powered: boolean | null): void {
  dispatch({ type: 'SetNodePowered', nodeId, powered });
}

export function moveNode(nodeId: NodeId, x: number, y: number): void {
  dispatch({ type: 'MoveNode', nodeId, x, y });
}

export function setMobility(enabled: boolean, stepMetres?: number): void {
  dispatch({ type: 'SetMobility', enabled, stepMetres });
}

export function setEngineConfig(patch: Partial<EngineConfig>): void {
  dispatch({ type: 'SetConfig', patch });
}

export function setRange(opts: { kind?: NodeKind; nodeId?: NodeId; range: number }): void {
  dispatch({ type: 'SetRange', ...opts });
}

export function setParticipation(fraction: number): void {
  dispatch({ type: 'SetParticipation', fraction });
}

export interface AuthorityOptions {
  readonly region?: Circle;
  readonly forged?: boolean;
}

export function declareMode(
  level: DeclaredLevel,
  opts: AuthorityOptions & { readonly durationTicks?: number } = {},
): void {
  dispatch({ type: 'DeclareMode', level, ...opts });
}

export function allClear(opts: AuthorityOptions = {}): void {
  dispatch({ type: 'AllClear', ...opts });
}

export function broadcastAlert(text: string, opts: AuthorityOptions = {}): void {
  dispatch({ type: 'BroadcastAlert', text, ...opts });
}

export interface SendRequestOptions {
  readonly hopLimit?: number;
  readonly forge?: { readonly claimKind: CredentialKind };
}

export function sendRequest(
  from: NodeId,
  cls: MessageClass,
  payload: RequestPayload,
  opts: SendRequestOptions = {},
): void {
  dispatch({ type: 'SendRequest', from, class: cls, payload, ...opts });
}

export function sendCheckIn(from: NodeId, status: CheckInStatus, text?: string): void {
  dispatch({ type: 'SendCheckIn', from, status, text });
}

export function sendRandomRequest(from?: NodeId): void {
  dispatch({ type: 'SendRandomRequest', from });
}

export function acceptRequest(nodeId: NodeId, requestId: MessageId): void {
  dispatch({ type: 'Accept', nodeId, requestId });
}

export function autoRespond(
  opts: { readonly requestId?: MessageId; readonly strategy?: AutoRespondStrategy } = {},
): void {
  dispatch({ type: 'AutoRespond', strategy: 'nearest-hops', ...opts });
}

export function closeRequest(requestId: MessageId): void {
  dispatch({ type: 'Close', requestId });
}
