/**
 * Basic usage example for @rstmdb/client
 *
 * Demonstrates: connecting, creating machines, instances, and applying events
 */

import { Client } from '@rstmdb/client';

async function main() {
  // Connect using the static factory method (simplest approach)
  const client = await Client.connect('localhost', 7401, {
    auth: 'my-secret-token',
  });

  console.log('Connected to rstmdb');

  try {

    // Ping the server
    await client.ping();
    console.log('Ping successful');

    // Get server info
    const info = await client.info();
    console.log('Server version:', info.serverVersion);

    // Register a state machine
    const putResult = await client.putMachine('order_js', 1, {
      states: ['created', 'paid', 'shipped', 'delivered'],
      initial: 'created',
      transitions: [
        { from: 'created', event: 'PAY', to: 'paid' },
        { from: 'paid', event: 'SHIP', to: 'shipped' },
        { from: 'shipped', event: 'DELIVER', to: 'delivered' },
      ],
    });

    console.log('Machine created:', putResult.machine, 'v' + putResult.version);

    // Create an instance
    const instance = await client.createInstance('order_js', 1, {
      initialCtx: {
        customerId: 'customer-123',
        items: ['widget-a', 'widget-b'],
        total: 99.99,
      },
    });

    console.log('Instance created:', instance.instanceId);
    console.log('Initial state:', instance.state);

    // Apply events to transition through states
    let result = await client.applyEvent(instance.instanceId, 'PAY', {
      payload: { paymentMethod: 'credit_card', transactionId: 'txn-456' },
    });
    console.log(`Transition: ${result.fromState} -> ${result.toState}`);

    result = await client.applyEvent(instance.instanceId, 'SHIP', {
      payload: { carrier: 'FedEx', trackingNumber: 'FX123456' },
    });
    console.log(`Transition: ${result.fromState} -> ${result.toState}`);

    result = await client.applyEvent(instance.instanceId, 'DELIVER');
    console.log(`Transition: ${result.fromState} -> ${result.toState}`);

    // Get final instance state
    const finalState = await client.getInstance(instance.instanceId);
    console.log('Final state:', finalState.state);
    console.log('Context:', JSON.stringify(finalState.ctx, null, 2));

    // Clean up
    await client.deleteInstance(instance.instanceId);
    console.log('Instance deleted');
  } finally {
    await client.close();
    console.log('Connection closed');
  }
}

main().catch(console.error);
