import { describe, it, expect, vi } from 'vitest';
import { SubscriptionHandler, type StreamEvent } from '../../src/streaming/subscription.js';
import { SubscriptionManager } from '../../src/streaming/manager.js';
import type { StreamEventMessage } from '../../src/protocol/messages.js';

describe('SubscriptionHandler', () => {
  const createEvent = (id: string): StreamEvent => ({
    subscriptionId: 'sub-1',
    instanceId: `instance-${id}`,
    machine: 'order',
    version: 1,
    walOffset: BigInt(100),
    fromState: 'created',
    toState: 'paid',
    event: 'PAY',
  });

  it('delivers events via push', () => {
    const unsubscribe = vi.fn().mockResolvedValue(undefined);
    const handler = new SubscriptionHandler('sub-1', unsubscribe);

    const listener = vi.fn();
    handler.on('event', listener);

    const event = createEvent('1');
    handler.push(event);

    expect(listener).toHaveBeenCalledWith(event);
  });

  it('implements async iterator', async () => {
    const unsubscribe = vi.fn().mockResolvedValue(undefined);
    const handler = new SubscriptionHandler('sub-1', unsubscribe);

    // Push events before iterating
    handler.push(createEvent('1'));
    handler.push(createEvent('2'));
    handler.push(createEvent('3'));

    const events: StreamEvent[] = [];
    let count = 0;

    for await (const event of handler) {
      events.push(event);
      count++;
      if (count >= 3) {
        await handler.unsubscribe();
        break;
      }
    }

    expect(events).toHaveLength(3);
    expect(events[0]?.instanceId).toBe('instance-1');
    expect(events[1]?.instanceId).toBe('instance-2');
    expect(events[2]?.instanceId).toBe('instance-3');
  });

  it('waits for events when buffer is empty', async () => {
    const unsubscribe = vi.fn().mockResolvedValue(undefined);
    const handler = new SubscriptionHandler('sub-1', unsubscribe);

    const eventPromise = (async () => {
      for await (const event of handler) {
        return event;
      }
    })();

    // Push event after starting iteration
    await new Promise((r) => setTimeout(r, 10));
    const event = createEvent('delayed');
    handler.push(event);

    // Close to end iteration
    await new Promise((r) => setTimeout(r, 10));
    handler.close();

    const received = await eventPromise;
    expect(received?.instanceId).toBe('instance-delayed');
  });

  it('emits end event when closed', () => {
    const unsubscribe = vi.fn().mockResolvedValue(undefined);
    const handler = new SubscriptionHandler('sub-1', unsubscribe);

    const endListener = vi.fn();
    handler.on('end', endListener);

    handler.close();

    expect(endListener).toHaveBeenCalled();
  });

  it('emits error event when closed with error', () => {
    const unsubscribe = vi.fn().mockResolvedValue(undefined);
    const handler = new SubscriptionHandler('sub-1', unsubscribe);

    const errorListener = vi.fn();
    handler.on('error', errorListener);

    const error = new Error('Connection lost');
    handler.close(error);

    expect(errorListener).toHaveBeenCalledWith(error);
  });

  it('unsubscribe calls the unsubscribe function', async () => {
    const unsubscribe = vi.fn().mockResolvedValue(undefined);
    const handler = new SubscriptionHandler('sub-1', unsubscribe);

    await handler.unsubscribe();

    expect(unsubscribe).toHaveBeenCalled();
    expect(handler.isClosed).toBe(true);
  });

  it('does not push events after close', () => {
    const unsubscribe = vi.fn().mockResolvedValue(undefined);
    const handler = new SubscriptionHandler('sub-1', unsubscribe);

    const listener = vi.fn();
    handler.on('event', listener);

    handler.close();
    handler.push(createEvent('1'));

    expect(listener).not.toHaveBeenCalled();
  });

  it('ignores multiple close calls', () => {
    const unsubscribe = vi.fn().mockResolvedValue(undefined);
    const handler = new SubscriptionHandler('sub-1', unsubscribe);

    const endListener = vi.fn();
    handler.on('end', endListener);

    handler.close();
    handler.close();
    handler.close();

    expect(endListener).toHaveBeenCalledTimes(1);
  });
});

describe('SubscriptionManager', () => {
  const createStreamMessage = (subscriptionId: string): StreamEventMessage => ({
    subscription_id: subscriptionId,
    type: 'event',
    instance_id: 'i-123',
    machine: 'order',
    version: 1,
    wal_offset: '100',
    from_state: 'created',
    to_state: 'paid',
    event: 'PAY',
  });

  it('registers and retrieves subscriptions', () => {
    const manager = new SubscriptionManager();
    const handler = new SubscriptionHandler('sub-1', () => Promise.resolve());

    manager.register('sub-1', handler);

    expect(manager.has('sub-1')).toBe(true);
    expect(manager.get('sub-1')).toBe(handler);
    expect(manager.size).toBe(1);
  });

  it('unregisters subscriptions', () => {
    const manager = new SubscriptionManager();
    const handler = new SubscriptionHandler('sub-1', () => Promise.resolve());

    manager.register('sub-1', handler);
    manager.unregister('sub-1');

    expect(manager.has('sub-1')).toBe(false);
    expect(manager.get('sub-1')).toBeUndefined();
    expect(manager.size).toBe(0);
  });

  it('dispatches events to correct subscription', () => {
    const manager = new SubscriptionManager();

    const handler1 = new SubscriptionHandler('sub-1', () => Promise.resolve());
    const handler2 = new SubscriptionHandler('sub-2', () => Promise.resolve());

    const listener1 = vi.fn();
    const listener2 = vi.fn();
    handler1.on('event', listener1);
    handler2.on('event', listener2);

    manager.register('sub-1', handler1);
    manager.register('sub-2', handler2);

    manager.dispatch(createStreamMessage('sub-1'));

    expect(listener1).toHaveBeenCalled();
    expect(listener2).not.toHaveBeenCalled();
  });

  it('ignores events for unknown subscriptions', () => {
    const manager = new SubscriptionManager();

    // Should not throw
    manager.dispatch(createStreamMessage('unknown'));
  });

  it('ends specific subscription', () => {
    const manager = new SubscriptionManager();
    const handler = new SubscriptionHandler('sub-1', () => Promise.resolve());

    const endListener = vi.fn();
    handler.on('end', endListener);

    manager.register('sub-1', handler);
    manager.end('sub-1');

    expect(endListener).toHaveBeenCalled();
    expect(manager.has('sub-1')).toBe(false);
  });

  it('ends subscription with error', () => {
    const manager = new SubscriptionManager();
    const handler = new SubscriptionHandler('sub-1', () => Promise.resolve());

    const errorListener = vi.fn();
    handler.on('error', errorListener);

    manager.register('sub-1', handler);

    const error = new Error('Server error');
    manager.end('sub-1', error);

    expect(errorListener).toHaveBeenCalledWith(error);
  });

  it('closes all subscriptions', () => {
    const manager = new SubscriptionManager();

    const handler1 = new SubscriptionHandler('sub-1', () => Promise.resolve());
    const handler2 = new SubscriptionHandler('sub-2', () => Promise.resolve());

    const endListener1 = vi.fn();
    const endListener2 = vi.fn();
    handler1.on('end', endListener1);
    handler2.on('end', endListener2);

    manager.register('sub-1', handler1);
    manager.register('sub-2', handler2);

    manager.closeAll();

    expect(endListener1).toHaveBeenCalled();
    expect(endListener2).toHaveBeenCalled();
    expect(manager.size).toBe(0);
  });

  it('closes all with error', () => {
    const manager = new SubscriptionManager();
    const handler = new SubscriptionHandler('sub-1', () => Promise.resolve());

    const errorListener = vi.fn();
    handler.on('error', errorListener);

    manager.register('sub-1', handler);

    const error = new Error('Connection lost');
    manager.closeAll(error);

    expect(errorListener).toHaveBeenCalledWith(error);
  });

  it('converts walOffset string to bigint in dispatch', () => {
    const manager = new SubscriptionManager();
    const handler = new SubscriptionHandler('sub-1', () => Promise.resolve());

    const listener = vi.fn();
    handler.on('event', listener);

    manager.register('sub-1', handler);

    manager.dispatch({
      ...createStreamMessage('sub-1'),
      wal_offset: '9007199254740993', // Larger than MAX_SAFE_INTEGER
    });

    expect(listener).toHaveBeenCalled();
    const calls = listener.mock.calls as [[StreamEvent]];
    const event = calls[0][0];
    expect(event.walOffset).toBe(9007199254740993n);
  });
});
