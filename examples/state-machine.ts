/**
 * State machine definition example for @rstmdb/client
 *
 * Demonstrates: complex state machines with guards and multiple transitions
 */

import { Client, ClientOptions, type MachineDefinition } from '@rstmdb/client';

// Define a payment processing state machine
const paymentMachine: MachineDefinition = {
  states: ['pending', 'validating', 'authorized', 'captured', 'refunded', 'failed', 'cancelled'],
  initial: 'pending',
  transitions: [
    // Start validation
    { from: 'pending', event: 'VALIDATE', to: 'validating' },

    // Validation outcomes
    { from: 'validating', event: 'AUTHORIZE', to: 'authorized' },
    { from: 'validating', event: 'REJECT', to: 'failed' },

    // Authorization outcomes
    { from: 'authorized', event: 'CAPTURE', to: 'captured' },
    { from: 'authorized', event: 'VOID', to: 'cancelled' },
    { from: 'authorized', event: 'TIMEOUT', to: 'failed' },

    // Refund from captured
    { from: 'captured', event: 'REFUND', to: 'refunded' },

    // Cancel from pending
    { from: 'pending', event: 'CANCEL', to: 'cancelled' },
  ],
  meta: {
    description: 'Payment processing workflow',
    version: '1.0.0',
    author: 'payments-team',
  },
};

// Define an order_state fulfillment state machine with parallel states
const order_stateFulfillmentMachine: MachineDefinition = {
  states: [
    'received',
    'picking',
    'packing',
    'awaiting_carrier',
    'shipped',
    'out_for_delivery',
    'delivered',
    'exception',
    'returned',
  ],
  initial: 'received',
  transitions: [
    // Normal flow
    { from: 'received', event: 'START_PICK', to: 'picking' },
    { from: 'picking', event: 'COMPLETE_PICK', to: 'packing' },
    { from: 'packing', event: 'COMPLETE_PACK', to: 'awaiting_carrier' },
    { from: 'awaiting_carrier', event: 'CARRIER_PICKUP', to: 'shipped' },
    { from: 'shipped', event: 'OUT_FOR_DELIVERY', to: 'out_for_delivery' },
    { from: 'out_for_delivery', event: 'DELIVER', to: 'delivered' },

    // Exception handling from multiple states
    {
      from: ['picking', 'packing', 'awaiting_carrier'],
      event: 'EXCEPTION',
      to: 'exception',
    },

    // Return from delivered
    { from: 'delivered', event: 'INITIATE_RETURN', to: 'returned' },

    // Resume from exception
    { from: 'exception', event: 'RESOLVE', to: 'received' },
  ],
};

async function main() {
  // Using the ClientOptions builder pattern
  const config = ClientOptions.create('localhost')
    .port(7401)
    .auth('my-secret-token')
    .timeout({ connect: 5000, request: 30000 })
    .reconnect({ enabled: true, maxAttempts: 5 })
    .build();

  const client = new Client(config);

  try {
    await client.connect();

    // Register both machines
    await client.putMachine('payment', 1, paymentMachine);
    console.log('Payment machine registered');

    await client.putMachine('order_state-fulfillment', 1, order_stateFulfillmentMachine);
    console.log('order_state fulfillment machine registered');

    // Get and display a machine definition
    const retrieved = await client.getMachine('payment', 1);
    console.log('\nPayment machine definition:');
    console.log('States:', retrieved.definition.states.join(', '));
    console.log('Initial:', retrieved.definition.initial);
    console.log('Transitions:', retrieved.definition.transitions.length);
    console.log('Checksum:', retrieved.checksum);

    // List all machines
    const list = await client.listMachines();
    console.log('\nRegistered machines:');
    for (const item of list.items) {
      console.log(`  ${item.machine}: versions ${item.versions.join(', ')}`);
    }

    // Create and process a payment
    const payment = await client.createInstance('payment', 1, {
      initialCtx: {
        amount: 150.0,
        currency: 'USD',
        merchantId: 'merchant-789',
      },
    });

    console.log('\nProcessing payment:', payment.instanceId);

    await client.applyEvent(payment.instanceId, 'VALIDATE');
    await client.applyEvent(payment.instanceId, 'AUTHORIZE', {
      payload: { authCode: 'AUTH-12345' },
    });
    await client.applyEvent(payment.instanceId, 'CAPTURE', {
      payload: { captureAmount: 150.0 },
    });

    const finalPayment = await client.getInstance(payment.instanceId);
    console.log('Payment final state:', finalPayment.state);
  } finally {
    await client.close();
  }
}

main().catch(console.error);
