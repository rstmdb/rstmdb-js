import { EventEmitter } from 'events';
import { Connection, ConnectionState } from './connection.js';
import { Operation } from './protocol/operations.js';
import { parseBigIntFields } from './protocol/messages.js';
import { SubscriptionManager, SubscriptionHandler } from './streaming/index.js';
import { ServerError } from './errors/classes.js';
import type { Subscription, WatchOptions, WatchAllOptions } from './streaming/subscription.js';
import { resolveConfig, type ClientConfig, type TlsConfig } from './types/config.js';
import type {
  MachineDefinition,
  PutMachineResult,
  GetMachineResult,
  ListMachinesOptions,
  ListMachinesResult,
} from './types/machine.js';
import type {
  CreateInstanceOptions,
  CreateInstanceResult,
  GetInstanceResult,
  DeleteInstanceOptions,
} from './types/instance.js';
import type {
  ApplyEventOptions,
  ApplyEventResult,
  BatchOperation,
  BatchOptions,
  BatchResult,
  ServerInfo,
  ListInstancesOptions,
  ListInstancesResult,
  WalReadOptions,
  WalReadResult,
  WalStatsResult,
  SnapshotResult,
  CompactOptions,
  CompactResult,
} from './types/results.js';

/**
 * Client events.
 */
export interface ClientEvents {
  connect: () => void;
  disconnect: (error?: Error) => void;
  error: (error: Error) => void;
  reconnect: (attempt: number) => void;
}

/**
 * The rstmdb client.
 *
 * @example
 * ```typescript
 * // Simple configuration
 * const client = Client.connect('localhost', 7401);
 *
 * // With authentication
 * const client = Client.connect('localhost', 7401, { auth: 'my-token' });
 *
 * // With full configuration object
 * const client = new Client({
 *   host: 'localhost',
 *   port: 7401,
 *   authToken: 'my-token',
 *   tls: true,
 * });
 *
 * // With builder pattern
 * const client = new Client(
 *   ClientOptions.create('localhost')
 *     .port(7401)
 *     .auth('my-token')
 *     .tls(true)
 *     .timeout({ connect: 5000, request: 15000 })
 *     .build()
 * );
 * ```
 */
export class Client extends EventEmitter {
  private readonly connection: Connection;
  private readonly subscriptions: SubscriptionManager;
  private readonly config: ClientConfig;

  constructor(config: ClientConfig) {
    super();
    this.config = config;
    const resolvedConfig = resolveConfig(config);
    this.subscriptions = new SubscriptionManager();
    this.connection = new Connection(resolvedConfig, this.subscriptions);

    // Forward connection events
    this.connection.on('connect', () => this.emit('connect'));
    this.connection.on('disconnect', (error) => this.emit('disconnect', error));
    this.connection.on('error', (error) => this.emit('error', error));
    this.connection.on('reconnect', (attempt) => this.emit('reconnect', attempt));
  }

  /**
   * Create a client and connect to the server.
   *
   * @param host - Server hostname
   * @param port - Server port (default: 7401)
   * @param options - Additional options
   * @returns Connected client instance
   *
   * @example
   * ```typescript
   * const client = await Client.connect('localhost');
   * const client = await Client.connect('localhost', 7401);
   * const client = await Client.connect('localhost', 7401, { auth: 'token' });
   * ```
   */
  static async connect(
    host: string,
    port: number = 7401,
    options?: {
      auth?: string;
      tls?: TlsConfig | boolean;
      clientName?: string;
    }
  ): Promise<Client> {
    const client = new Client({
      host,
      port,
      authToken: options?.auth,
      tls: options?.tls,
      clientName: options?.clientName,
    });
    await client.connect();
    return client;
  }

  /**
   * Get the current configuration.
   */
  getConfig(): Readonly<ClientConfig> {
    return this.config;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Connection Lifecycle
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Connect to the server.
   */
  async connect(): Promise<void> {
    await this.connection.connect();
  }

  /**
   * Close the connection.
   */
  async close(): Promise<void> {
    await this.connection.close();
  }

  /**
   * Check if connected to the server.
   */
  isConnected(): boolean {
    return this.connection.getState() === ConnectionState.CONNECTED;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // System Operations
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Ping the server.
   */
  async ping(): Promise<void> {
    await this.connection.request(Operation.PING);
  }

  /**
   * Get server information.
   */
  async info(): Promise<ServerInfo> {
    const result = await this.connection.request<{
      server_name: string;
      server_version: string;
      protocol_version: number;
      max_payload_bytes?: number;
      max_batch_ops?: number;
      wal_segment_size?: number;
      auth_required?: boolean;
      features?: string[];
    }>(Operation.INFO);

    return {
      serverName: result.server_name,
      serverVersion: result.server_version,
      protocolVersion: result.protocol_version,
      maxPayloadBytes: result.max_payload_bytes,
      maxBatchOps: result.max_batch_ops,
      walSegmentSize: result.wal_segment_size,
      authRequired: result.auth_required,
      features: result.features,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Machine Operations
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Create or update a state machine definition.
   */
  async putMachine(
    machine: string,
    version: number,
    definition: MachineDefinition
  ): Promise<PutMachineResult> {
    const result = await this.connection.request<{
      machine: string;
      version: number;
      stored_checksum: string;
      created: boolean;
    }>(Operation.PUT_MACHINE, {
      machine,
      version,
      definition,
    });
    return {
      machine: result.machine,
      version: result.version,
      storedChecksum: result.stored_checksum,
      created: result.created,
    };
  }

  /**
   * Get a state machine definition.
   */
  async getMachine(machine: string, version: number): Promise<GetMachineResult> {
    const result = await this.connection.request<GetMachineResult>(Operation.GET_MACHINE, {
      machine,
      version,
    });
    return result;
  }

  /**
   * List all state machines.
   */
  async listMachines(options?: ListMachinesOptions): Promise<ListMachinesResult> {
    const result = await this.connection.request<ListMachinesResult>(
      Operation.LIST_MACHINES,
      options
    );
    return result;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Instance Operations
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Create a new state machine instance.
   */
  async createInstance(
    machine: string,
    version: number,
    options?: CreateInstanceOptions
  ): Promise<CreateInstanceResult> {
    const params: Record<string, unknown> = { machine, version };
    if (options?.instanceId) params['instance_id'] = options.instanceId;
    if (options?.initialCtx) params['initial_ctx'] = options.initialCtx;
    if (options?.idempotencyKey) params['idempotency_key'] = options.idempotencyKey;

    const result = await this.connection.request<{
      instance_id: string;
      state: string;
      wal_offset: number;
    }>(Operation.CREATE_INSTANCE, params);

    return {
      instanceId: result.instance_id,
      state: result.state,
      walOffset: BigInt(result.wal_offset),
    };
  }

  /**
   * Get instance state and context.
   */
  async getInstance(instanceId: string): Promise<GetInstanceResult> {
    const result = await this.connection.request<{
      machine: string;
      version: number;
      state: string;
      ctx: Record<string, unknown>;
      last_event_id?: string;
      last_wal_offset: number;
    }>(Operation.GET_INSTANCE, { instance_id: instanceId });

    return {
      machine: result.machine,
      version: result.version,
      state: result.state,
      ctx: result.ctx,
      lastEventId: result.last_event_id,
      lastWalOffset: BigInt(result.last_wal_offset),
    };
  }

  /**
   * Delete an instance.
   */
  async deleteInstance(instanceId: string, options?: DeleteInstanceOptions): Promise<void> {
    const params: Record<string, unknown> = { instance_id: instanceId };
    if (options?.idempotencyKey) params['idempotency_key'] = options.idempotencyKey;

    await this.connection.request(Operation.DELETE_INSTANCE, params);
  }

  /**
   * List instances with optional filtering and pagination.
   */
  async listInstances(options?: ListInstancesOptions): Promise<ListInstancesResult> {
    const params: Record<string, unknown> = {};
    if (options?.machine) params['machine'] = options.machine;
    if (options?.state) params['state'] = options.state;
    if (options?.limit !== undefined) params['limit'] = options.limit;
    if (options?.offset !== undefined) params['offset'] = options.offset;

    const result = await this.connection.request<{
      instances: Array<{
        id: string;
        machine: string;
        version: number;
        state: string;
        created_at: number;
        updated_at: number;
        last_wal_offset: number;
      }>;
      total: number;
      has_more: boolean;
    }>(Operation.LIST_INSTANCES, params);

    return {
      instances: result.instances.map((inst) => ({
        id: inst.id,
        machine: inst.machine,
        version: inst.version,
        state: inst.state,
        createdAt: inst.created_at,
        updatedAt: inst.updated_at,
        lastWalOffset: BigInt(inst.last_wal_offset),
      })),
      total: result.total,
      hasMore: result.has_more,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Event Operations
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Apply an event to an instance.
   */
  async applyEvent(
    instanceId: string,
    event: string,
    options?: ApplyEventOptions
  ): Promise<ApplyEventResult> {
    const params: Record<string, unknown> = {
      instance_id: instanceId,
      event,
    };
    if (options?.payload) params['payload'] = options.payload;
    if (options?.expectedState) params['expected_state'] = options.expectedState;
    if (options?.expectedWalOffset !== undefined) {
      params['expected_wal_offset'] = Number(options.expectedWalOffset);
    }
    if (options?.eventId) params['event_id'] = options.eventId;
    if (options?.idempotencyKey) params['idempotency_key'] = options.idempotencyKey;

    const result = await this.connection.request<{
      from_state: string;
      to_state: string;
      ctx?: Record<string, unknown>;
      wal_offset: number;
      applied: boolean;
      event_id?: string;
    }>(Operation.APPLY_EVENT, params);

    return {
      fromState: result.from_state,
      toState: result.to_state,
      ctx: result.ctx,
      walOffset: BigInt(result.wal_offset),
      applied: result.applied,
      eventId: result.event_id,
    };
  }

  /**
   * Execute multiple operations in a batch.
   */
  async batch(operations: BatchOperation[], options?: BatchOptions): Promise<BatchResult> {
    // Convert params to snake_case for server
    const serializedOps = operations.map((op) => {
      const params: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(op.params)) {
        // Convert camelCase to snake_case
        const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        params[snakeKey] = value;
      }
      return { op: op.op, params };
    });

    const result = await this.connection.request<{
      results: Array<{
        status: 'ok' | 'error';
        result?: Record<string, unknown>;
        error?: { code: string; message: string; details?: Record<string, unknown> };
      }>;
      wal_offset?: string;
    }>(Operation.BATCH, {
      ops: serializedOps,
      ...options,
    });

    return {
      results: result.results.map((r) => ({
        status: r.status,
        result: r.result ? parseBigIntFields(r.result, ['wal_offset']) : undefined,
        error: r.error ? ServerError.fromResponse(r.error) : undefined,
      })),
      walOffset: result.wal_offset ? BigInt(result.wal_offset) : undefined,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // WAL Operations
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Read entries from the write-ahead log.
   */
  async walRead(fromOffset: bigint, options?: WalReadOptions): Promise<WalReadResult> {
    const result = await this.connection.request<{
      entries: Array<{
        offset: string;
        type: string;
        data: Record<string, unknown>;
        timestamp: number;
      }>;
      hasMore: boolean;
      nextOffset?: string;
    }>(Operation.WAL_READ, {
      fromOffset: fromOffset.toString(),
      ...options,
    });

    return {
      entries: result.entries.map((e) => ({
        ...e,
        offset: BigInt(e.offset),
      })),
      hasMore: result.hasMore,
      nextOffset: result.nextOffset ? BigInt(result.nextOffset) : undefined,
    };
  }

  /**
   * Get WAL statistics.
   */
  async walStats(): Promise<WalStatsResult> {
    const result = await this.connection.request<{
      entry_count: number;
      segment_count: number;
      total_size_bytes: number;
      latest_offset?: number;
      io_stats: {
        bytes_written: number;
        bytes_read: number;
        writes: number;
        reads: number;
        fsyncs: number;
      };
    }>(Operation.WAL_STATS);

    return {
      entryCount: result.entry_count,
      segmentCount: result.segment_count,
      totalSizeBytes: result.total_size_bytes,
      latestOffset: result.latest_offset !== undefined ? BigInt(result.latest_offset) : undefined,
      ioStats: {
        bytesWritten: result.io_stats.bytes_written,
        bytesRead: result.io_stats.bytes_read,
        writes: result.io_stats.writes,
        reads: result.io_stats.reads,
        fsyncs: result.io_stats.fsyncs,
      },
    };
  }

  /**
   * Create a snapshot of an instance.
   */
  async snapshotInstance(instanceId: string): Promise<SnapshotResult> {
    const result = await this.connection.request<{
      snapshot_id: string;
      wal_offset: number;
    }>(Operation.SNAPSHOT_INSTANCE, { instance_id: instanceId });

    return {
      instanceId: instanceId,
      walOffset: BigInt(result.wal_offset),
      sizeBytes: 0, // Not provided by server
    };
  }

  /**
   * Trigger WAL compaction.
   */
  async compact(options?: CompactOptions): Promise<CompactResult> {
    const params: Record<string, unknown> = {};
    if (options?.force) params['force_snapshot'] = options.force;

    const result = await this.connection.request<{
      snapshots_created: number;
      segments_deleted: number;
      bytes_reclaimed: number;
    }>(Operation.COMPACT, params);

    return {
      snapshotsCreated: result.snapshots_created,
      segmentsDeleted: result.segments_deleted,
      bytesReclaimed: BigInt(result.bytes_reclaimed),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Watch/Streaming Operations
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Watch a specific instance for state changes.
   */
  async watchInstance(instanceId: string, options?: WatchOptions): Promise<Subscription> {
    const params: Record<string, unknown> = {
      instance_id: instanceId,
    };
    if (options?.includeCtx !== undefined) params['include_ctx'] = options.includeCtx;
    if (options?.fromOffset !== undefined) params['from_offset'] = Number(options.fromOffset);

    const result = await this.connection.request<{ subscription_id: string }>(
      Operation.WATCH_INSTANCE,
      params
    );

    const handler = new SubscriptionHandler(result.subscription_id, () =>
      this.unwatch(result.subscription_id)
    );
    this.subscriptions.register(result.subscription_id, handler);

    return handler;
  }

  /**
   * Watch all instances matching the filter.
   */
  async watchAll(options?: WatchAllOptions): Promise<Subscription> {
    const params: Record<string, unknown> = {};
    if (options?.includeCtx !== undefined) params['include_ctx'] = options.includeCtx;
    if (options?.fromOffset !== undefined) params['from_offset'] = Number(options.fromOffset);
    if (options?.machines) params['machines'] = options.machines;
    if (options?.fromStates) params['from_states'] = options.fromStates;
    if (options?.toStates) params['to_states'] = options.toStates;
    if (options?.events) params['events'] = options.events;

    const result = await this.connection.request<{ subscription_id: string }>(
      Operation.WATCH_ALL,
      params
    );

    const handler = new SubscriptionHandler(result.subscription_id, () =>
      this.unwatch(result.subscription_id)
    );
    this.subscriptions.register(result.subscription_id, handler);

    return handler;
  }

  /**
   * Cancel a watch subscription.
   */
  async unwatch(subscriptionId: string): Promise<void> {
    await this.connection.request(Operation.UNWATCH, { subscription_id: subscriptionId });
    this.subscriptions.unregister(subscriptionId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Event Emitter Overrides (for type safety)
  // ─────────────────────────────────────────────────────────────────────────

  override on(event: 'connect', listener: () => void): this;
  override on(event: 'disconnect', listener: (error?: Error) => void): this;
  override on(event: 'error', listener: (error: Error) => void): this;
  override on(event: 'reconnect', listener: (attempt: number) => void): this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  override on(event: string, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }

  override once(event: 'connect', listener: () => void): this;
  override once(event: 'disconnect', listener: (error?: Error) => void): this;
  override once(event: 'error', listener: (error: Error) => void): this;
  override once(event: 'reconnect', listener: (attempt: number) => void): this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  override once(event: string, listener: (...args: any[]) => void): this {
    return super.once(event, listener);
  }

  override off(event: 'connect', listener: () => void): this;
  override off(event: 'disconnect', listener: (error?: Error) => void): this;
  override off(event: 'error', listener: (error: Error) => void): this;
  override off(event: 'reconnect', listener: (attempt: number) => void): this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  override off(event: string, listener: (...args: any[]) => void): this {
    return super.off(event, listener);
  }
}
