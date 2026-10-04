import type { EngineConfig, WorldConfig } from './config';
import type { MessageId, NodeId } from './ids';
import type { CheckInStatus, Circle, MessageClass, RequestPayload } from './message';
import type { CredentialKind, DeclaredLevel, NodeKind } from './node';

/** Strategy for the "act upon requests" command. */
export type AutoRespondStrategy = 'nearest-hops' | 'random';

/** Every command the UI (or a script) can dispatch to the engine, discriminated on `type`. */
export type Command =
  | { readonly type: 'ResetWorld'; readonly world: WorldConfig }
  | { readonly type: 'SetCellsUp'; readonly up: boolean }
  | { readonly type: 'SetGridUp'; readonly up: boolean }
  | { readonly type: 'SetNodePowered'; readonly nodeId: NodeId; readonly powered: boolean | null }
  | { readonly type: 'MoveNode'; readonly nodeId: NodeId; readonly x: number; readonly y: number }
  | {
      readonly type: 'SetMobility';
      readonly enabled: boolean;
      readonly stepMetres?: number;
      /** Takes effect when the next world is built (ResetWorld / Generate). */
      readonly walkerFraction?: number;
    }
  | { readonly type: 'SetConfig'; readonly patch: Partial<EngineConfig> }
  | {
      readonly type: 'SetRange';
      readonly kind?: NodeKind;
      readonly nodeId?: NodeId;
      readonly range: number;
    }
  | { readonly type: 'SetParticipation'; readonly fraction: number }
  | {
      readonly type: 'DeclareMode';
      readonly level: DeclaredLevel;
      readonly region?: Circle;
      readonly durationTicks?: number;
      readonly forged?: boolean;
    }
  | { readonly type: 'AllClear'; readonly region?: Circle; readonly forged?: boolean }
  | {
      readonly type: 'BroadcastAlert';
      readonly text: string;
      readonly region?: Circle;
      readonly forged?: boolean;
    }
  | {
      readonly type: 'SendRequest';
      readonly from: NodeId;
      readonly class: MessageClass;
      readonly payload: RequestPayload;
      readonly hopLimit?: number;
      /** Forge a signature claiming another credential kind; always fails verification. */
      readonly forge?: { readonly claimKind: CredentialKind };
    }
  | {
      readonly type: 'SendCheckIn';
      readonly from: NodeId;
      readonly status: CheckInStatus;
      readonly text?: string;
    }
  | { readonly type: 'SendRandomRequest'; readonly from?: NodeId }
  | { readonly type: 'Accept'; readonly nodeId: NodeId; readonly requestId: MessageId }
  | {
      readonly type: 'AutoRespond';
      readonly requestId?: MessageId;
      readonly strategy?: AutoRespondStrategy;
    }
  | { readonly type: 'Close'; readonly requestId: MessageId };

export type CommandType = Command['type'];
