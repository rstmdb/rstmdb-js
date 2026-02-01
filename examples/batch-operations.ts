/**
 * Batch operations example for @rstmdb/client
 *
 * Demonstrates: atomic and best-effort batch operations
 */

import { Client } from '@rstmdb/client';

async function main() {
  // Connect using the static factory method
  const client = await Client.connect('localhost', 7401, {
    auth: 'my-secret-token',
  });
  console.log('Connected to rstmdb\n');

  try {
    // Set up machines
    await client.putMachine('order_batch', 1, {
      states: ['created', 'paid', 'shipped'],
      initial: 'created',
      transitions: [
        { from: 'created', event: 'PAY', to: 'paid' },
        { from: 'paid', event: 'SHIP', to: 'shipped' },
      ],
    });

    await client.putMachine('inventory', 1, {
      states: ['available', 'reserved', 'sold'],
      initial: 'available',
      transitions: [
        { from: 'available', event: 'RESERVE', to: 'reserved' },
        { from: 'reserved', event: 'SELL', to: 'sold' },
        { from: 'reserved', event: 'RELEASE', to: 'available' },
      ],
    });

    // Example 1: Atomic batch - all or nothing
    console.log('--- Example 1: Atomic Batch ---');
    {
      // Create order_batch and reserve inventory atomically
      const result = await client.batch(
        [
          {
            op: 'CREATE_INSTANCE',
            params: {
              machine: 'order_batch',
              version: 1,
              initialCtx: { items: ['widget-1', 'widget-2'] },
            },
          },
          {
            op: 'CREATE_INSTANCE',
            params: {
              machine: 'inventory',
              version: 1,
              instanceId: 'inv-widget-1',
              initialCtx: { sku: 'widget-1', quantity: 10 },
            },
          },
          {
            op: 'CREATE_INSTANCE',
            params: {
              machine: 'inventory',
              version: 1,
              instanceId: 'inv-widget-2',
              initialCtx: { sku: 'widget-2', quantity: 5 },
            },
          },
        ],
        { mode: 'atomic' }
      );

      console.log('Atomic batch result:');
      console.log('  All operations at WAL offset:', result.walOffset);
      result.results.forEach((r, i) => {
        console.log(`  Operation ${i + 1}: ${r.status}`);
      });
    }

    // Example 2: Atomic batch with events
    console.log('\n--- Example 2: Atomic Events ---');
    {
      // Reserve both inventory items atomically
      const result = await client.batch(
        [
          {
            op: 'APPLY_EVENT',
            params: {
              instanceId: 'inv-widget-1',
              event: 'RESERVE',
              payload: { order_batchId: 'order_batch-123' },
            },
          },
          {
            op: 'APPLY_EVENT',
            params: {
              instanceId: 'inv-widget-2',
              event: 'RESERVE',
              payload: { order_batchId: 'order_batch-123' },
            },
          },
        ],
        { mode: 'atomic' }
      );

      console.log('Both inventory items reserved atomically');
      console.log('WAL offset:', result.walOffset);
    }

    // Example 3: Best-effort batch - continue on error
    console.log('\n--- Example 3: Best-Effort Batch ---');
    {
      const result = await client.batch(
        [
          // This will succeed
          {
            op: 'APPLY_EVENT',
            params: {
              instanceId: 'inv-widget-1',
              event: 'SELL',
            },
          },
          // This will fail (invalid transition: can't RESERVE again)
          {
            op: 'APPLY_EVENT',
            params: {
              instanceId: 'inv-widget-1',
              event: 'RESERVE',
            },
          },
          // This will succeed (processed despite previous error)
          {
            op: 'APPLY_EVENT',
            params: {
              instanceId: 'inv-widget-2',
              event: 'SELL',
            },
          },
        ],
        { mode: 'best_effort' }
      );

      console.log('Best-effort batch results:');
      result.results.forEach((r, i) => {
        if (r.status === 'ok') {
          console.log(`  Operation ${i + 1}: SUCCESS`);
        } else {
          console.log(`  Operation ${i + 1}: FAILED - ${r.error?.message}`);
        }
      });
    }

    // Example 4: Complex order_batch fulfillment saga
    console.log('\n--- Example 4: order_batch Fulfillment Saga ---');
    {
      // Create a new order_batch
      const order_batch = await client.createInstance('order_batch', 1, {
        initialCtx: { customerId: 'cust-456', total: 199.99 },
      });

      // Create inventory items
      await client.batch(
        [
          {
            op: 'CREATE_INSTANCE',
            params: {
              machine: 'inventory',
              version: 1,
              instanceId: 'inv-item-a',
            },
          },
          {
            op: 'CREATE_INSTANCE',
            params: {
              machine: 'inventory',
              version: 1,
              instanceId: 'inv-item-b',
            },
          },
        ],
        { mode: 'atomic' }
      );

      // Execute the saga: pay order_batch + reserve inventory atomically
      const sagaResult = await client.batch(
        [
          {
            op: 'APPLY_EVENT',
            params: {
              instanceId: order_batch.instanceId,
              event: 'PAY',
              payload: { paymentId: 'pay-789' },
            },
          },
          {
            op: 'APPLY_EVENT',
            params: {
              instanceId: 'inv-item-a',
              event: 'RESERVE',
            },
          },
          {
            op: 'APPLY_EVENT',
            params: {
              instanceId: 'inv-item-b',
              event: 'RESERVE',
            },
          },
        ],
        { mode: 'atomic' }
      );

      const allSucceeded = sagaResult.results.every((r) => r.status === 'ok');
      if (allSucceeded) {
        console.log('Saga completed successfully');
        console.log('order_batch paid and inventory reserved at WAL offset:', sagaResult.walOffset);

        // Complete the saga
        await client.batch(
          [
            {
              op: 'APPLY_EVENT',
              params: { instanceId: order_batch.instanceId, event: 'SHIP' },
            },
            {
              op: 'APPLY_EVENT',
              params: { instanceId: 'inv-item-a', event: 'SELL' },
            },
            {
              op: 'APPLY_EVENT',
              params: { instanceId: 'inv-item-b', event: 'SELL' },
            },
          ],
          { mode: 'atomic' }
        );

        console.log('order_batch shipped and inventory marked as sold');
      } else {
        console.log('Saga failed - need to compensate');
        // In a real system, you would implement compensating transactions here
      }
    }
  } finally {
    await client.close();
    console.log('\nConnection closed');
  }
}

main().catch(console.error);
