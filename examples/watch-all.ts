/**
 * Watch all instances example for @rstmdb/client
 *
 * Demonstrates: WATCH_ALL with various filters
 */

import { Client } from '@rstmdb/client';

async function main() {
  const client = await Client.connect('localhost', 7401, {
    auth: 'my-secret-token',
  });

  console.log('Connected, starting watch...\n');

  try {
    // Watch all state changes with optional filters
    const subscription = await client.watchAll({
      // machines: ['order', 'payment'],  // Filter by machine names
      // events: ['PAY', 'SHIP'],          // Filter by event names
      // fromStates: ['created'],          // Filter by source state
      // toStates: ['paid', 'shipped'],    // Filter by target state
      // includeCtx: true,                 // Include context in events
    });

    console.log('Watching all instances. Press Ctrl+C to stop.\n');

    for await (const event of subscription) {
      console.log(`[${new Date().toISOString()}] ${event.instanceId}`);
      console.log(`  ${event.fromState} -> ${event.toState} (event: ${event.event})`);
      if (event.ctx) {
        console.log(`  ctx: ${JSON.stringify(event.ctx)}`);
      }
      console.log();
    }
  } finally {
    await client.close();
  }
}

main().catch(console.error);
