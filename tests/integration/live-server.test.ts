import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import { Client } from '../../src/client.js';
import { ErrorCode } from '../../src/errors/codes.js';
import { ServerError } from '../../src/errors/classes.js';

const HOST = process.env['RSTMDB_HOST'];
const PORT = Number(process.env['RSTMDB_PORT'] ?? '7401');

describe.skipIf(!HOST)('Live Server Integration', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ host: HOST ?? '127.0.0.1', port: PORT, reconnect: false });
    await client.connect();
  });

  afterAll(async () => {
    if (client.isConnected()) {
      await client.close();
    }
  });

  it('exercises HELLO, idempotency, BAD_REQUEST, batch, watchAll, replicationStatus, and backup', async () => {
    const suffix = randomUUID().slice(0, 8);
    const machine = `order_${suffix}`;

    expect(client.getNegotiatedFeatures()).toContain('durable_idempotency');

    const put = await client.putMachine(machine, 1, {
      states: ['created', 'paid', 'shipped'],
      initial: 'created',
      transitions: [
        { from: 'created', event: 'PAY', to: 'paid' },
        { from: 'paid', event: 'SHIP', to: 'shipped' },
      ],
    });
    expect(put.machine).toBe(machine);

    // Non-object initial_ctx is rejected with BAD_REQUEST (non-retryable)
    try {
      await client.createInstance(machine, 1, {
        initialCtx: ['invalid'] as unknown as Record<string, unknown>,
      });
      expect.fail('Expected BAD_REQUEST error');
    } catch (err) {
      expect(err).toBeInstanceOf(ServerError);
      expect((err as ServerError).code).toBe(ErrorCode.BAD_REQUEST);
      expect((err as ServerError).retryable).toBe(false);
    }

    // CREATE_INSTANCE honors idempotencyKey
    const instanceId = `inst-${suffix}`;
    const createKey = `create-${suffix}`;
    const c1 = await client.createInstance(machine, 1, {
      instanceId,
      initialCtx: { amount: 10 },
      idempotencyKey: createKey,
    });
    const c2 = await client.createInstance(machine, 1, {
      instanceId,
      initialCtx: { amount: 10 },
      idempotencyKey: createKey,
    });
    expect(c1.instanceId).toBe(instanceId);
    expect(c2.walOffset).toBe(c1.walOffset);

    // Watch filtered events before applying transitions
    const sub = await client.watchAll({ machines: [machine], events: ['PAY'] });
    const seenEvent = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out waiting for stream event')), 5000);
      sub.on('event', (ev) => {
        if (ev.instanceId === instanceId && ev.event === 'PAY') {
          clearTimeout(timer);
          resolve(ev.toState);
        }
      });
    });

    // APPLY_EVENT retry returns applied: false
    const payKey = `pay-${suffix}`;
    const a1 = await client.applyEvent(instanceId, 'PAY', {
      payload: { paid: true },
      eventId: 'evt-1',
      idempotencyKey: payKey,
    });
    expect(a1.applied).toBe(true);

    const a2 = await client.applyEvent(instanceId, 'PAY', {
      payload: { paid: true },
      eventId: 'evt-1',
      idempotencyKey: payKey,
    });
    expect(a2.applied).toBe(false);
    expect(a2.walOffset).toBe(a1.walOffset);

    await expect(seenEvent).resolves.toBe('paid');
    await sub.unsubscribe();

    // BATCH operation
    const batchRes = await client.batch(
      [{ op: 'APPLY_EVENT', params: { instanceId, event: 'SHIP' } }],
      { mode: 'best_effort' }
    );
    expect(batchRes.results[0]?.status).toBe('ok');

    // REPLICATION_STATUS & hot BACKUP_*
    const status = await client.replicationStatus();
    expect(status.role).toBe('standalone');

    const beg = await client.backupBegin({ compression: 'gzip' });
    let offset = 0;
    let downloaded = 0;
    while (true) {
      const chk = await client.backupChunk(beg.backupId, { offset });
      downloaded += chk.bytes.length;
      if (chk.eof) break;
      offset += beg.chunkSize;
    }
    expect(downloaded).toBeGreaterThan(0);
    const end = await client.backupEnd(beg.backupId);
    expect(end.ok).toBe(true);
  });
});
