/**
 * Example demonstrating listInstances and walStats functionality.
 */

import { Client } from '../src/index.js';

async function main() {
  const runId = Math.random().toString(36).substring(2, 10);
  const machineName = `order-${runId}`;

  const client = await Client.connect('localhost', 7401, { auth: 'my-secret-token' });

  try {
    console.log('Connected to server\n');

    // Create a state machine definition
    await client.putMachine(machineName, 1, {
      states: ['pending', 'processing', 'completed', 'failed'],
      initial: 'pending',
      transitions: [
        { from: 'pending', event: 'START', to: 'processing' },
        { from: 'processing', event: 'COMPLETE', to: 'completed' },
        { from: 'processing', event: 'FAIL', to: 'failed' },
      ],
    });
    console.log(`Created machine: ${machineName}\n`);

    // Create multiple instances in different states
    const instanceIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const instance = await client.createInstance(machineName, 1, {
        instanceId: `${machineName}-${i.toString().padStart(3, '0')}`,
        initialCtx: { orderNumber: i + 1000 },
      });
      instanceIds.push(instance.instanceId);
    }

    // Transition some instances to different states
    await client.applyEvent(instanceIds[0], 'START');
    await client.applyEvent(instanceIds[1], 'START');
    await client.applyEvent(instanceIds[0], 'COMPLETE');
    await client.applyEvent(instanceIds[1], 'FAIL');
    await client.applyEvent(instanceIds[2], 'START');

    console.log('Created 5 instances in various states\n');

    // =========================================================================
    // List all instances (no filters)
    // =========================================================================
    console.log('='.repeat(60));
    console.log('LIST ALL INSTANCES');
    console.log('='.repeat(60));

    let result = await client.listInstances();
    console.log(`Total instances: ${result.total}`);
    console.log(`Has more: ${result.hasMore}\n`);

    for (const inst of result.instances) {
      console.log(`  ${inst.id}: state=${inst.state}, machine=${inst.machine}`);
    }

    // =========================================================================
    // List instances filtered by machine
    // =========================================================================
    console.log('\n' + '='.repeat(60));
    console.log(`LIST INSTANCES FOR MACHINE '${machineName}'`);
    console.log('='.repeat(60));

    result = await client.listInstances({ machine: machineName });
    console.log(`Found ${result.total} instances\n`);

    for (const inst of result.instances) {
      console.log(`  ${inst.id}: state=${inst.state}`);
    }

    // =========================================================================
    // List instances filtered by state
    // =========================================================================
    console.log('\n' + '='.repeat(60));
    console.log("LIST INSTANCES IN 'pending' STATE");
    console.log('='.repeat(60));

    result = await client.listInstances({
      machine: machineName,
      state: 'pending',
    });
    console.log(`Found ${result.total} pending instances\n`);

    for (const inst of result.instances) {
      console.log(`  ${inst.id}: state=${inst.state}`);
    }

    // =========================================================================
    // List instances with pagination
    // =========================================================================
    console.log('\n' + '='.repeat(60));
    console.log('LIST INSTANCES WITH PAGINATION (limit=2)');
    console.log('='.repeat(60));

    // First page
    result = await client.listInstances({
      machine: machineName,
      limit: 2,
      offset: 0,
    });
    console.log(
      `Page 1 (offset=0, limit=2): ${result.instances.length} items, hasMore=${result.hasMore}`
    );
    for (const inst of result.instances) {
      console.log(`  ${inst.id}: state=${inst.state}`);
    }

    // Second page
    result = await client.listInstances({
      machine: machineName,
      limit: 2,
      offset: 2,
    });
    console.log(
      `\nPage 2 (offset=2, limit=2): ${result.instances.length} items, hasMore=${result.hasMore}`
    );
    for (const inst of result.instances) {
      console.log(`  ${inst.id}: state=${inst.state}`);
    }

    // Third page
    result = await client.listInstances({
      machine: machineName,
      limit: 2,
      offset: 4,
    });
    console.log(
      `\nPage 3 (offset=4, limit=2): ${result.instances.length} items, hasMore=${result.hasMore}`
    );
    for (const inst of result.instances) {
      console.log(`  ${inst.id}: state=${inst.state}`);
    }

    // =========================================================================
    // WAL Statistics
    // =========================================================================
    console.log('\n' + '='.repeat(60));
    console.log('WAL STATISTICS');
    console.log('='.repeat(60));

    const stats = await client.walStats();
    console.log(`Entry count:      ${stats.entryCount}`);
    console.log(`Segment count:    ${stats.segmentCount}`);
    console.log(`Total size:       ${stats.totalSizeBytes.toLocaleString()} bytes`);
    console.log(`Latest offset:    ${stats.latestOffset}`);
    console.log('\nI/O Statistics:');
    console.log(`  Bytes written:  ${stats.ioStats.bytesWritten.toLocaleString()}`);
    console.log(`  Bytes read:     ${stats.ioStats.bytesRead.toLocaleString()}`);
    console.log(`  Write ops:      ${stats.ioStats.writes}`);
    console.log(`  Read ops:       ${stats.ioStats.reads}`);
    console.log(`  Fsync calls:    ${stats.ioStats.fsyncs}`);

    // =========================================================================
    // Cleanup
    // =========================================================================
    console.log('\n' + '='.repeat(60));
    console.log('CLEANUP');
    console.log('='.repeat(60));

    for (const instanceId of instanceIds) {
      await client.deleteInstance(instanceId);
    }
    console.log(`Deleted ${instanceIds.length} instances`);
  } finally {
    await client.close();
  }
}

main().catch(console.error);
