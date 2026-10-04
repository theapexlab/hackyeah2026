import type { Command } from '../domain/commands';
import type { EngineConfigPatch } from '../domain/config';
import { patchEngineConfig, resolveWorldConfig } from '../domain/config';
import type { DropReason } from '../domain/events';
import type { MessageId, NodeId } from '../domain/ids';
import type { Message, MessageClass, Payload, RequestPayload } from '../domain/message';
import { isEmergency, MODE_POLICIES, type ModePolicy } from '../domain/mode';
import type { CredentialKind, Node } from '../domain/node';
import { insideCircle } from '../graph/distance';
import {
  CITIZEN_REQUEST_CLASSES,
  COMMERCE_CLASSES,
  classAllowedToOriginate,
  isPriced,
  isRelayOnlyClass,
  requestRadiusM,
} from '../policies/classes';
import { canOriginate } from '../policies/trust';
import { placeNode } from '../terrain/placement';
import { createAuthorityMessage, inject } from './authority';
import { resetTrip, secondsToTicks } from './mobility';
import { createMessage, queueOrigination } from './originate';
import type { EngineState } from './state';
import { logEvent, recordDrop, resetWorld } from './state';
import { refreshTopology } from './tick';
import {
  accept,
  acceptEligibility,
  closeTransaction,
  openTransactionsOldestFirst,
  pickResponder,
} from './transactions';

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function assertNever(x: never): never {
  throw new Error(`unhandled command ${String((x as { type?: string }).type)}`);
}

/**
 * Plain-data deep clone: arrays and plain objects are copied recursively, primitives
 * (including Number.POSITIVE_INFINITY) are kept. Commands are JSON-shaped, so this is all
 * they need; structuredClone is not typed under this package's lib (ES2022, no DOM).
 */
function clonePlain(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items: readonly unknown[] = value;
    return items.map(clonePlain);
  }
  if (value !== null && typeof value === 'object') {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(src)) out[key] = clonePlain(src[key]);
    return out;
  }
  return value;
}

/** The engine keeps its own copy of every command: a caller mutating its draft afterwards changes nothing. */
function cloneCommand(cmd: Command): Command {
  return clonePlain(cmd) as Command;
}

/**
 * Why a node may not originate `cls` with `payload` right now, mirroring decide()'s
 * order for the origin side: RELAY_CANNOT_ACT (relay credential, non-relay class),
 * UNVERIFIABLE (credential without the right), CLASS_NOT_ALLOWED (mode policy),
 * PRICED_IN_EMERGENCY, CLASS_NOT_ALLOWED (a fee on anything but a loan). Null when allowed.
 */
export function originRejection(
  node: Node,
  policy: ModePolicy,
  cls: MessageClass,
  payload: Payload,
): DropReason | null {
  if (node.credential.kind === 'relay' && !isRelayOnlyClass(cls)) return 'RELAY_CANNOT_ACT';
  if (!canOriginate(node.credential.kind, cls)) return 'UNVERIFIABLE';
  if (!classAllowedToOriginate(policy, cls)) return 'CLASS_NOT_ALLOWED';
  if (isPriced({ payload }) && !policy.paymentsAllowed) return 'PRICED_IN_EMERGENCY';
  if (isPriced({ payload }) && !COMMERCE_CLASSES.includes(cls)) return 'CLASS_NOT_ALLOWED';
  return null;
}

interface OriginateFromNodeOptions {
  readonly hopLimit?: number;
  readonly forge?: { readonly claimKind: CredentialKind };
}

/**
 * Validate and queue a node-originated message. A forgery skips validation and is
 * stamped signer { credentialKind: claimKind, valid: false }. A REQUEST gets a region
 * centred on the node (requestRadiusM). A rejected message is
 * still registered (so the event can be looked up) but logged as DROPPED at the origin
 * instead of being queued. Returns the queued message or null.
 */
function originateFromNode(
  state: EngineState,
  node: Node,
  cls: MessageClass,
  payload: Payload,
  opts: OriginateFromNodeOptions,
): Message | null {
  const policy = MODE_POLICIES[node.mode];
  const baseOpts = {
    ...(opts.hopLimit === undefined ? {} : { hopLimit: opts.hopLimit }),
    ...(payload.kind === 'REQUEST'
      ? { region: { x: node.x, y: node.y, r: requestRadiusM(cls) } }
      : {}),
  };
  if (opts.forge !== undefined) {
    const msg = createMessage(state, node, cls, payload, {
      ...baseOpts,
      signer: { nodeId: node.id, credentialKind: opts.forge.claimKind, valid: false },
    });
    queueOrigination(node, msg);
    return msg;
  }
  const reason = originRejection(node, policy, cls, payload);
  const msg = createMessage(state, node, cls, payload, baseOpts);
  if (reason !== null) {
    recordDrop(state, node.id, msg, reason);
    return null;
  }
  queueOrigination(node, msg);
  return msg;
}

/** Canned request texts for SendRandomRequest, per class. */
export const CANNED_REQUESTS: Readonly<Record<MessageClass, readonly string[]>> = {
  LEND: ['lending a ladder for the afternoon', 'spare drill to lend', 'lending a bike pump'],
  BORROW: ['need a ladder for an hour', 'anyone have a drill?', 'looking to borrow a bike pump'],
  GIVE: ['giving away a stroller', 'spare blankets to give', 'bottled water to share'],
  INFO: ['is the pharmacy on Długa open?', 'which roads are flooded?', 'is the tram running?'],
  LIFE_CRITICAL: [
    'AED needed at the tram stop',
    'insulin needed urgently',
    'someone collapsed, need CPR help',
  ],
  SAFETY: [
    'smoke from the basement at no. 12',
    'water rising on the ground floor',
    'gas smell in the stairwell',
  ],
  CHECK_IN: ['check-in'],
  OFFICIAL_ALERT: ['alert'],
  MODE_DECLARATION: ['declaration'],
  TOPOLOGY: ['topology'],
  PORTAL_SUMMARY: ['portal summary'],
};

/** Request category per class, shown by the UI. */
export const REQUEST_CATEGORY: Readonly<Record<MessageClass, string>> = {
  LEND: 'tools',
  BORROW: 'tools',
  GIVE: 'supplies',
  INFO: 'question',
  LIFE_CRITICAL: 'medical',
  SAFETY: 'hazard',
  CHECK_IN: 'check-in',
  OFFICIAL_ALERT: 'alert',
  MODE_DECLARATION: 'declaration',
  TOPOLOGY: 'topology',
  PORTAL_SUMMARY: 'portal',
};

function patchConfig(state: EngineState, patch: EngineConfigPatch): void {
  state.config = patchEngineConfig(state.config, patch);
}

function sendRandomRequest(state: EngineState, from: NodeId | undefined): void {
  let node: Node | undefined;
  if (from !== undefined) {
    node = state.byId.get(from);
  } else {
    // only someone standing still: a requester stays put until the request is settled
    const candidates = state.nodes.filter(
      (n) =>
        n.alive &&
        n.kind === 'mobile' &&
        n.credential.kind === 'citizen' &&
        n.walk?.phase !== 'moving',
    );
    if (candidates.length > 0) node = state.prng.pick(candidates);
  }
  if (node === undefined) return;
  const policy = MODE_POLICIES[node.mode];
  let pool: MessageClass[] = policy.originClasses.filter((c) =>
    CITIZEN_REQUEST_CLASSES.includes(c),
  );
  if (pool.length === 0) return;
  if (isEmergency(node.mode) && pool.includes('LIFE_CRITICAL')) {
    pool = [...pool, 'LIFE_CRITICAL', 'LIFE_CRITICAL'];
  }
  const cls = state.prng.pick(pool);
  const text = state.prng.pick(CANNED_REQUESTS[cls]);
  const payload: RequestPayload = { kind: 'REQUEST', text, category: REQUEST_CATEGORY[cls] };
  originateFromNode(state, node, cls, payload, {});
}

function autoRespond(state: EngineState, cmd: Extract<Command, { type: 'AutoRespond' }>): void {
  const strategy = cmd.strategy ?? 'nearest-hops';
  const candidates: MessageId[] =
    cmd.requestId === undefined
      ? openTransactionsOldestFirst(state).map((tx) => tx.requestId)
      : [cmd.requestId];
  for (const requestId of candidates) {
    const responder = pickResponder(state, requestId, strategy);
    if (responder === null) continue;
    const e = acceptEligibility(state, responder.id, requestId);
    if (!e.ok) continue;
    accept(state, e.node, e.entry, e.request);
    return;
  }
  logEvent(state, {
    type: 'AUTO_RESPOND_NONE',
    tick: state.tick,
    requestId: cmd.requestId ?? null,
  });
}

/**
 * Apply one command now (plan A4). The command is deep-copied first: the copy goes to
 * the command log, the COMMAND event and every message or listing built from it, so a
 * UI that mutates its region/payload draft after dispatching cannot change the engine
 * (or make replay() diverge). World-affecting commands recompute liveness and adjacency
 * eagerly so the next snapshot already reflects them. Authority commands create the
 * message and inject it immediately (it travels from the next step). Node sends are
 * validated here and logged DROPPED at the origin when refused; an unknown node id is a
 * no-op. Accept/Close that are not applicable are no-ops (the COMMAND event remains).
 */
export function applyCommand(state: EngineState, input: Command): void {
  const cmd = cloneCommand(input);
  state.commandLog.push({ tick: state.tick, command: cmd });
  if (cmd.type === 'ResetWorld') {
    resetWorld(state, resolveWorldConfig(cmd.world));
    refreshTopology(state);
    logEvent(state, { type: 'COMMAND', tick: state.tick, command: cmd });
    return;
  }
  logEvent(state, { type: 'COMMAND', tick: state.tick, command: cmd });
  const cfg = state.config;
  switch (cmd.type) {
    case 'SetCellsUp':
      state.cellsUp = cmd.up;
      state.adjacency.dirty = true;
      refreshTopology(state);
      return;
    case 'SetGridUp':
      state.gridUp = cmd.up;
      state.adjacency.dirty = true;
      refreshTopology(state);
      return;
    case 'SetNodePowered': {
      const node = state.byId.get(cmd.nodeId);
      if (node === undefined) return;
      node.poweredOverride = cmd.powered;
      state.adjacency.dirty = true;
      refreshTopology(state);
      return;
    }
    case 'MoveNode': {
      const node = state.byId.get(cmd.nodeId);
      if (node === undefined) return;
      // Never into the river (routers not into parks either): see placeNode.
      const at = placeNode(state.terrain, node.kind, {
        x: clamp(cmd.x, 0, state.world.width),
        y: clamp(cmd.y, 0, state.world.height),
      });
      node.x = at.x;
      node.y = at.y;
      resetTrip(state.terrain, node);
      state.adjacency.dirty = true;
      refreshTopology(state);
      return;
    }
    case 'SetRange': {
      const range = Math.max(0, cmd.range);
      if (cmd.nodeId !== undefined) {
        const node = state.byId.get(cmd.nodeId);
        if (node !== undefined) node.range = range;
      } else {
        for (const node of state.nodes) {
          if (cmd.kind === undefined || node.kind === cmd.kind) node.range = range;
        }
      }
      state.adjacency.dirty = true;
      refreshTopology(state);
      return;
    }
    case 'SetParticipation':
      state.participation = clamp(cmd.fraction, 0, 1);
      state.adjacency.dirty = true;
      refreshTopology(state);
      return;
    case 'SetMobility':
      patchConfig(state, {
        mobility: {
          enabled: cmd.enabled,
          ...(cmd.shares === undefined ? {} : { shares: cmd.shares }),
          ...(cmd.speedKmh === undefined ? {} : { speedKmh: cmd.speedKmh }),
        },
      });
      return;
    case 'SetConfig':
      patchConfig(state, cmd.patch);
      return;
    case 'DeclareMode': {
      const duration =
        cmd.durationTicks ?? secondsToTicks(cfg.declarationDurationSeconds, cfg.tickSeconds);
      const untilTick = state.tick + duration;
      const regionOpt = cmd.region === undefined ? {} : { region: cmd.region };
      const msg = createAuthorityMessage(
        state,
        'MODE_DECLARATION',
        { kind: 'MODE_DECLARATION', level: cmd.level, untilTick },
        { ...regionOpt, forged: cmd.forged ?? false, ttl: duration },
      );
      if (!cmd.forged) {
        state.declarations.push({
          id: msg.id,
          level: cmd.level,
          region: cmd.region ?? null,
          fromTick: state.tick,
          untilTick,
        });
      }
      inject(state, msg, state.pendingTransits);
      return;
    }
    case 'AllClear': {
      const regionOpt = cmd.region === undefined ? {} : { region: cmd.region };
      const msg = createAuthorityMessage(
        state,
        'MODE_DECLARATION',
        { kind: 'MODE_DECLARATION', level: 'ALL_CLEAR', untilTick: state.tick },
        { ...regionOpt, forged: cmd.forged ?? false },
      );
      if (!cmd.forged) {
        // Display list only; node modes are the truth. A city-wide all-clear retires
        // every listing. A regional one retires only the regional listings whose centre
        // it covers: city-wide listings survive because nodes outside the circle stay
        // declared (decide() delivers a regional ALL_CLEAR inside the circle only).
        const region = cmd.region;
        state.declarations = state.declarations.filter((d) => {
          if (region === undefined) return false;
          if (d.region === null) return true;
          return !insideCircle(d.region.x, d.region.y, region);
        });
      }
      inject(state, msg, state.pendingTransits);
      return;
    }
    case 'BroadcastAlert': {
      const regionOpt = cmd.region === undefined ? {} : { region: cmd.region };
      const msg = createAuthorityMessage(
        state,
        'OFFICIAL_ALERT',
        { kind: 'ALERT', text: cmd.text },
        { ...regionOpt, forged: cmd.forged ?? false },
      );
      inject(state, msg, state.pendingTransits);
      return;
    }
    case 'SendRequest': {
      const node = state.byId.get(cmd.from);
      if (node === undefined) return;
      const opts: OriginateFromNodeOptions = {
        ...(cmd.hopLimit === undefined ? {} : { hopLimit: cmd.hopLimit }),
        ...(cmd.forge === undefined ? {} : { forge: cmd.forge }),
      };
      originateFromNode(state, node, cmd.class, cmd.payload, opts);
      return;
    }
    case 'SendCheckIn': {
      const node = state.byId.get(cmd.from);
      if (node === undefined) return;
      const payload: Payload =
        cmd.text === undefined
          ? { kind: 'CHECK_IN', status: cmd.status }
          : { kind: 'CHECK_IN', status: cmd.status, text: cmd.text };
      originateFromNode(state, node, 'CHECK_IN', payload, {});
      return;
    }
    case 'SendRandomRequest':
      sendRandomRequest(state, cmd.from);
      return;
    case 'Accept': {
      const e = acceptEligibility(state, cmd.nodeId, cmd.requestId);
      if (!e.ok) return;
      accept(state, e.node, e.entry, e.request);
      return;
    }
    case 'AutoRespond':
      autoRespond(state, cmd);
      return;
    case 'Close': {
      const tx = state.transactions.get(cmd.requestId);
      if (tx === undefined || tx.status === 'closed') return;
      closeTransaction(state, tx);
      return;
    }
    default:
      assertNever(cmd);
  }
}
