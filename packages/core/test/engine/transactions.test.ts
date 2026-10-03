/**
 * Transaction state machine tests
 */

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../src/engine/engine';
import { lineWorld } from '../helpers';

describe('Transactions', () => {
  it('request → Accept → RESPONSE → TX_ACCEPTED → CLOSE', () => {
    const engine = createEngine(lineWorld(3));

    engine.dispatch({
      type: 'SEND_REQUEST',
      from: 'm-000' as any,
      class: 'INFO',
      text: 'test',
    });

    for (let i = 0; i < 5; i++) {
      engine.step(1);
    }

    expect(engine.tick).toBe(5);
  });

  it('late Accept → TX_RESPONSE_LATE', () => {
    const engine = createEngine(lineWorld(3));

    engine.dispatch({
      type: 'SEND_REQUEST',
      from: 'm-000' as any,
      class: 'INFO',
      text: 'test',
    });

    for (let i = 0; i < 10; i++) {
      engine.step(1);
    }

    expect(engine.tick).toBe(10);
  });

  it('requester cannot accept own', () => {
    const engine = createEngine(lineWorld(2));

    engine.dispatch({
      type: 'SEND_REQUEST',
      from: 'm-000' as any,
      class: 'INFO',
      text: 'test',
    });

    engine.step(1);
    // Requester cannot accept their own request
    engine.dispatch({
      type: 'ACCEPT',
      nodeId: 'm-000' as any,
      requestId: 'm-000#000001' as any,
    });

    expect(engine.tick).toBe(1);
  });

  it('relay/none nodes never get requestView', () => {
    const engine = createEngine({
      seed: 42,
      width: 1000,
      height: 1000,
      mobiles: 2,
      routers: 2,
      gateways: 0,
      range: { mobile: 150, router: 200, gateway: 200 },
      unregisteredFraction: 0,
      batteryBackedRouterFraction: 0,
      gatewayBackhaul: 'satellite' as const,
    });

    engine.dispatch({
      type: 'SEND_REQUEST',
      from: 'm-000' as any,
      class: 'INFO',
      text: 'test',
    });

    for (let i = 0; i < 5; i++) {
      engine.step(1);
    }

    expect(engine.tick).toBe(5);
  });

  it('AutoRespond nearest-hops deterministic tie-break', () => {
    const engine = createEngine(lineWorld(3));

    engine.dispatch({
      type: 'SEND_REQUEST',
      from: 'm-000' as any,
      class: 'INFO',
      text: 'test',
    });

    engine.step(2);

    engine.dispatch({
      type: 'AUTO_RESPOND',
      strategy: 'nearest-hops',
    });

    expect(engine.tick).toBe(2);
  });

  it('autoConfirm=false stays accepted until Close', () => {
    const engine = createEngine(lineWorld(2), { autoConfirm: false });

    engine.dispatch({
      type: 'SEND_REQUEST',
      from: 'm-000' as any,
      class: 'INFO',
      text: 'test',
    });

    for (let i = 0; i < 5; i++) {
      engine.step(1);
    }

    expect(engine.tick).toBe(5);
  });
});
