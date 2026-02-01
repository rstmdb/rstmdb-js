/**
 * Streaming/watch example for @rstmdb/client
 *
 * Demonstrates: watching instances for state changes using AsyncIterator and events
 */

import { Client, type StreamEvent } from '@rstmdb/client';

async function main() {
  // Connect using the static factory method
  const client = await Client.connect('localhost', 7401, {
    auth: 'my-secret-token',
  });
  console.log('Connected to rstmdb');

  try {
    // Set up a machine
    await client.putMachine('order_js_stream', 1, {
      states: ['created', 'processing', 'shipped', 'delivered'],
      initial: 'created',
      transitions: [
        { from: 'created', event: 'PROCESS', to: 'processing' },
        { from: 'processing', event: 'SHIP', to: 'shipped' },
        { from: 'shipped', event: 'DELIVER', to: 'delivered' },
      ],
    });

    // Create an instance to watch
    const instance = await client.createInstance('order_js_stream', 1);
    console.log('Created instance:', instance.instanceId);

    // Example 1: Watch using AsyncIterator
    console.log('\n--- Example 1: AsyncIterator Pattern ---');

    const subscription1 = await client.watchInstance(instance.instanceId);

    // Start a background task to apply events
    setTimeout(async () => {
      await client.applyEvent(instance.instanceId, 'PROCESS');
      await client.applyEvent(instance.instanceId, 'SHIP');
      await client.applyEvent(instance.instanceId, 'DELIVER');
    }, 100);

    // Consume events with for-await-of
    for await (const event of subscription1) {
      console.log(`[AsyncIterator] ${event.fromState} -> ${event.toState} (event: ${event.event})`);

      if (event.toState === 'delivered') {
        await subscription1.unsubscribe();
        break;
      }
    }

    // Example 2: Watch using Event Emitter
    console.log('\n--- Example 2: Event Emitter Pattern ---');

    // Create a new instance
    const instance2 = await client.createInstance('order_js_stream', 1);
    console.log('Created instance:', instance2.instanceId);

    const subscription2 = await client.watchInstance(instance2.instanceId);

    // Set up event handlers
    subscription2.on('event', (event: StreamEvent) => {
      console.log(`[EventEmitter] ${event.fromState} -> ${event.toState} (event: ${event.event})`);
    });

    subscription2.on('error', (error: Error) => {
      console.error('[EventEmitter] Error:', error.message);
    });

    subscription2.on('end', () => {
      console.log('[EventEmitter] Subscription ended');
    });

    // Apply events
    await client.applyEvent(instance2.instanceId, 'PROCESS');
    await client.applyEvent(instance2.instanceId, 'SHIP');
    await client.applyEvent(instance2.instanceId, 'DELIVER');

    // Give time for events to be received
    await new Promise((resolve) => setTimeout(resolve, 100));
    await subscription2.unsubscribe();

    // Example 3: Watch all instances with filters
    console.log('\n--- Example 3: Watch All with Filters ---');

    const subscription3 = await client.watchAll({
      machines: ['order_js_stream'],
      toStates: ['shipped', 'delivered'],
    });

    // Create multiple instances
    const instances = await Promise.all([
      client.createInstance('order_js_stream', 1),
      client.createInstance('order_js_stream', 1),
      client.createInstance('order_js_stream', 1),
    ]);

    console.log('Created', instances.length, 'instances');

    // Background task to transition instances
    setTimeout(async () => {
      for (const inst of instances) {
        await client.applyEvent(inst.instanceId, 'PROCESS');
        await client.applyEvent(inst.instanceId, 'SHIP');
        await client.applyEvent(inst.instanceId, 'DELIVER');
      }
    }, 100);

    // Watch for filtered events
    let eventCount = 0;
    for await (const event of subscription3) {
      console.log(
        `[WatchAll] Instance ${event.instanceId}: ` + `${event.fromState} -> ${event.toState}`
      );
      eventCount++;

      // Expect 2 events per instance (shipped and delivered)
      if (eventCount >= instances.length * 2) {
        await subscription3.unsubscribe();
        break;
      }
    }

    console.log(`\nReceived ${eventCount} filtered events`);
  } finally {
    await client.close();
    console.log('Connection closed');
  }
}

main().catch(console.error);
