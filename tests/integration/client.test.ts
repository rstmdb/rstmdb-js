import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Client } from '../../src/client.js';
import { Operation } from '../../src/protocol/operations.js';
import { NotFoundError, ConflictError } from '../../src/errors/classes.js';
import { MockServer } from '../fixtures/mock-server.js';

describe('Client Integration', () => {
  let server: MockServer;
  let client: Client;

  beforeEach(async () => {
    server = new MockServer();
    await server.start();

    client = new Client({
      host: '127.0.0.1',
      port: server.port,
      reconnect: false,
    });
  });

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  describe('connection lifecycle', () => {
    it('connects to server', async () => {
      expect(client.isConnected()).toBe(false);

      await client.connect();

      expect(client.isConnected()).toBe(true);
    });

    it('closes connection', async () => {
      await client.connect();
      expect(client.isConnected()).toBe(true);

      await client.close();

      expect(client.isConnected()).toBe(false);
    });

    it('emits connect event', async () => {
      let connected = false;
      client.on('connect', () => {
        connected = true;
      });

      await client.connect();

      expect(connected).toBe(true);
    });

    it('throws when connecting to invalid host', async () => {
      const badClient = new Client({
        host: '192.0.2.1', // TEST-NET, should fail
        port: 12345,
        connectTimeout: 100,
        reconnect: false,
      });

      await expect(badClient.connect()).rejects.toThrow();
    });
  });

  describe('system operations', () => {
    beforeEach(async () => {
      await client.connect();
    });

    it('ping succeeds', async () => {
      await expect(client.ping()).resolves.toBeUndefined();
    });

    it('info returns server info', async () => {
      const info = await client.info();

      expect(info.serverVersion).toBe('1.0.0');
      expect(info.protocolVersion).toBe(1);
    });
  });

  describe('machine operations', () => {
    beforeEach(async () => {
      await client.connect();
    });

    it('putMachine creates a machine', async () => {
      server.expectRequest(Operation.PUT_MACHINE).respondWith({
        machine: 'order',
        version: 1,
        stored_checksum: 'abc123',
        created: true,
      });

      const result = await client.putMachine('order', 1, {
        states: ['created', 'paid'],
        initial: 'created',
        transitions: [{ from: 'created', event: 'PAY', to: 'paid' }],
      });

      expect(result.machine).toBe('order');
      expect(result.version).toBe(1);
      expect(result.created).toBe(true);
    });

    it('getMachine retrieves a machine', async () => {
      server.expectRequest(Operation.GET_MACHINE).respondWith({
        definition: {
          states: ['created', 'paid'],
          initial: 'created',
          transitions: [{ from: 'created', event: 'PAY', to: 'paid' }],
        },
        checksum: 'abc123',
      });

      const result = await client.getMachine('order', 1);

      expect(result.definition.states).toEqual(['created', 'paid']);
      expect(result.checksum).toBe('abc123');
    });

    it('getMachine throws NotFoundError for missing machine', async () => {
      server
        .expectRequest(Operation.GET_MACHINE)
        .respondWithError('MACHINE_NOT_FOUND', 'Machine not found');

      await expect(client.getMachine('nonexistent', 1)).rejects.toThrow(NotFoundError);
    });

    it('listMachines returns machine list', async () => {
      server.expectRequest(Operation.LIST_MACHINES).respondWith({
        items: [
          { machine: 'order', versions: [1, 2] },
          { machine: 'payment', versions: [1] },
        ],
        nextCursor: undefined,
      });

      const result = await client.listMachines();

      expect(result.items).toHaveLength(2);
      expect(result.items[0]?.machine).toBe('order');
    });
  });

  describe('instance operations', () => {
    beforeEach(async () => {
      await client.connect();
    });

    it('createInstance creates an instance', async () => {
      server.expectRequest(Operation.CREATE_INSTANCE).respondWith({
        instance_id: 'i-123',
        state: 'created',
        wal_offset: 100,
      });

      const result = await client.createInstance('order', 1);

      expect(result.instanceId).toBe('i-123');
      expect(result.state).toBe('created');
      expect(result.walOffset).toBe(100n);
    });

    it('createInstance with options', async () => {
      server.expectRequest(Operation.CREATE_INSTANCE).respondWith({
        instance_id: 'custom-id',
        state: 'created',
        wal_offset: 100,
      });

      const result = await client.createInstance('order', 1, {
        instanceId: 'custom-id',
        initialCtx: { customerId: 'c-123' },
      });

      expect(result.instanceId).toBe('custom-id');
    });

    it('getInstance retrieves an instance', async () => {
      server.expectRequest(Operation.GET_INSTANCE).respondWith({
        machine: 'order',
        version: 1,
        state: 'paid',
        ctx: { amount: 99.99 },
        last_wal_offset: 150,
      });

      const result = await client.getInstance('i-123');

      expect(result.machine).toBe('order');
      expect(result.state).toBe('paid');
      expect(result.ctx).toEqual({ amount: 99.99 });
      expect(result.lastWalOffset).toBe(150n);
    });

    it('deleteInstance deletes an instance', async () => {
      server.expectRequest(Operation.DELETE_INSTANCE).respondWith({});

      await expect(client.deleteInstance('i-123')).resolves.toBeUndefined();
    });
  });

  describe('event operations', () => {
    beforeEach(async () => {
      await client.connect();
    });

    it('applyEvent applies an event', async () => {
      server.expectRequest(Operation.APPLY_EVENT).respondWith({
        from_state: 'created',
        to_state: 'paid',
        wal_offset: 200,
        applied: true,
        event_id: 'e-123',
      });

      const result = await client.applyEvent('i-123', 'PAY');

      expect(result.fromState).toBe('created');
      expect(result.toState).toBe('paid');
      expect(result.applied).toBe(true);
      expect(result.walOffset).toBe(200n);
    });

    it('applyEvent with options', async () => {
      server.expectRequest(Operation.APPLY_EVENT).respondWith({
        from_state: 'created',
        to_state: 'paid',
        ctx: { amount: 99.99 },
        wal_offset: 200,
        applied: true,
      });

      const result = await client.applyEvent('i-123', 'PAY', {
        payload: { amount: 99.99 },
        expectedState: 'created',
      });

      expect(result.ctx).toEqual({ amount: 99.99 });
    });

    it('applyEvent throws ConflictError on state mismatch', async () => {
      server
        .expectRequest(Operation.APPLY_EVENT)
        .respondWithError('CONFLICT', 'State mismatch', {
          expectedState: 'created',
          actualState: 'paid',
        });

      await expect(client.applyEvent('i-123', 'PAY', { expectedState: 'created' })).rejects.toThrow(
        ConflictError
      );
    });

    it('batch executes multiple operations', async () => {
      server.expectRequest(Operation.BATCH).respondWith({
        results: [
          { status: 'ok', result: { instance_id: 'i-1', state: 'created', wal_offset: 100 } },
          { status: 'ok', result: { from_state: 'created', to_state: 'paid', wal_offset: 101 } },
        ],
        wal_offset: '101',
      });

      const result = await client.batch(
        [
          { op: 'CREATE_INSTANCE', params: { machine: 'order', version: 1 } },
          { op: 'APPLY_EVENT', params: { instanceId: 'i-1', event: 'PAY' } },
        ],
        { mode: 'atomic' }
      );

      expect(result.results).toHaveLength(2);
      expect(result.results[0]?.status).toBe('ok');
      expect(result.walOffset).toBe(101n);
    });
  });

  describe('WAL operations', () => {
    beforeEach(async () => {
      await client.connect();
    });

    it('walRead reads WAL entries', async () => {
      server.expectRequest(Operation.WAL_READ).respondWith({
        entries: [
          { offset: '100', type: 'CREATE_INSTANCE', data: {}, timestamp: 1700000000 },
          { offset: '101', type: 'APPLY_EVENT', data: {}, timestamp: 1700000001 },
        ],
        hasMore: true,
        nextOffset: '102',
      });

      const result = await client.walRead(0n);

      expect(result.entries).toHaveLength(2);
      expect(result.entries[0]?.offset).toBe(100n);
      expect(result.hasMore).toBe(true);
      expect(result.nextOffset).toBe(102n);
    });

    it('snapshotInstance creates a snapshot', async () => {
      server.expectRequest(Operation.SNAPSHOT_INSTANCE).respondWith({
        snapshot_id: 'snap-123',
        wal_offset: 500,
      });

      const result = await client.snapshotInstance('i-123');

      expect(result.instanceId).toBe('i-123');
      expect(result.walOffset).toBe(500n);
    });

    it('compact triggers compaction', async () => {
      server.expectRequest(Operation.COMPACT).respondWith({
        snapshots_created: 5,
        segments_deleted: 3,
        bytes_reclaimed: 1048576,
      });

      const result = await client.compact();

      expect(result.snapshotsCreated).toBe(5);
      expect(result.segmentsDeleted).toBe(3);
      expect(result.bytesReclaimed).toBe(1048576n);
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      await client.connect();
    });

    it('handles server errors correctly', async () => {
      server
        .expectRequest(Operation.GET_INSTANCE)
        .respondWithError('INSTANCE_NOT_FOUND', 'Instance not found', { instanceId: 'i-unknown' });

      try {
        await client.getInstance('i-unknown');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundError);
        expect((error as NotFoundError).details).toEqual({ instanceId: 'i-unknown' });
      }
    });
  });
});
