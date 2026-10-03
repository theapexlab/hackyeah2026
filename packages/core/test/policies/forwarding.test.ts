/**
 * Forwarding decision tests
 */

import { describe, expect, it } from 'vitest';
import { formatMessageId, formatNodeId } from '../../src/domain/ids';
import type { Message, Packet } from '../../src/domain/message';
import { decide } from '../../src/policies/forwarding';

describe('Forwarding', () => {
  it('decision order: unverifiable beats duplicate', () => {
    const msg: Message = {
      id: formatMessageId(formatNodeId('mobile', 0), 1),
      seq: 1,
      class: 'INFO',
      payload: { kind: 'REQUEST', text: 'test' },
      originId: formatNodeId('mobile', 0),
      signer: { nodeId: formatNodeId('mobile', 0), credentialKind: 'citizen', valid: false },
      createdTick: 0,
      ttlTicks: 60,
      hopLimit: 3,
    };

    const packet: Packet = {
      msgId: msg.id,
      hop: 0,
      path: [],
      lastHop: null,
      seq: 1,
    };

    const mockNode = {
      id: formatNodeId('mobile', 1),
      x: 0,
      y: 0,
      seen: new Set<any>([msg.id]), // Already seen
      credential: { kind: 'citizen' as const },
    } as any;

    const result = decide(msg, packet, {
      receiverNode: mockNode,
      receiverMode: 'PEACE',
    });

    expect(result.dropReason).toBe('UNVERIFIABLE'); // Unverifiable comes first
  });

  it('each DropReason case', () => {
    // UNVERIFIABLE
    expect(
      decide(
        {
          id: formatMessageId(formatNodeId('mobile', 0), 1),
          seq: 1,
          class: 'INFO',
          payload: { kind: 'REQUEST', text: 'test' },
          originId: formatNodeId('mobile', 0),
          signer: { nodeId: formatNodeId('mobile', 0), credentialKind: 'citizen', valid: false },
          createdTick: 0,
          ttlTicks: 60,
          hopLimit: 3,
        } as Message,
        {
          msgId: formatMessageId(formatNodeId('mobile', 0), 1),
          hop: 0,
          path: [],
          lastHop: null,
          seq: 1,
        } as Packet,
        {
          receiverNode: {
            id: formatNodeId('mobile', 1),
            x: 0,
            y: 0,
            seen: new Set(),
            credential: { kind: 'citizen' as const },
          } as any,
          receiverMode: 'PEACE',
        },
      ).dropReason,
    ).toBe('UNVERIFIABLE');
  });

  it('CLASS_NOT_ALLOWED in wrong mode', () => {
    const msg: Message = {
      id: formatMessageId(formatNodeId('mobile', 0), 1),
      seq: 1,
      class: 'SELL',
      payload: { kind: 'REQUEST', text: 'test' },
      originId: formatNodeId('mobile', 0),
      signer: { nodeId: formatNodeId('mobile', 0), credentialKind: 'citizen', valid: true },
      createdTick: 0,
      ttlTicks: 60,
      hopLimit: 3,
    };

    const result = decide(
      msg,
      { msgId: msg.id, hop: 0, path: [], lastHop: null, seq: 1 } as Packet,
      {
        receiverNode: {
          id: formatNodeId('mobile', 1),
          x: 0,
          y: 0,
          seen: new Set(),
          credential: { kind: 'citizen' as const },
        } as any,
        receiverMode: 'L1',
      },
    );

    expect(result.dropReason).toBe('CLASS_NOT_ALLOWED');
  });
});
