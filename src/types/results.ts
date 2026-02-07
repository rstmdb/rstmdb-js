import type { RstmdbError } from '../errors/base.js';

/**
 * Options for APPLY_EVENT operation.
 */
export interface ApplyEventOptions {
  /** Event payload data */
  payload?: Record<string, unknown>;

  /** Expected current state (optimistic concurrency) */
  expectedState?: string;

  /** Expected WAL offset (stronger concurrency check) */
  expectedWalOffset?: bigint;

  /** Custom event ID */
  eventId?: string;

  /** Idempotency key for deduplication */
  idempotencyKey?: string;
}

/**
 * Result of APPLY_EVENT operation.
 */
export interface ApplyEventResult {
  /** State before transition */
  fromState: string;

  /** State after transition */
  toState: string;

  /** Updated context (if changed) */
  ctx?: Record<string, unknown>;

  /** WAL offset of the event */
  walOffset: bigint;

  /** Whether the event was applied */
  applied: boolean;

  /** Event ID */
  eventId?: string;
}

/**
 * A batch operation definition.
 */
export interface BatchOperation {
  /** Operation type */
  op: 'CREATE_INSTANCE' | 'APPLY_EVENT' | 'DELETE_INSTANCE';

  /** Operation parameters */
  params: Record<string, unknown>;
}

/**
 * Options for BATCH operation.
 */
export interface BatchOptions {
  /** Execution mode */
  mode: 'atomic' | 'best_effort';
}

/**
 * A single result within a batch.
 */
export interface BatchResultItem {
  /** Result status */
  status: 'ok' | 'error';

  /** Operation result (if successful) */
  result?: unknown;

  /** Error (if failed) */
  error?: RstmdbError;
}

/**
 * Result of BATCH operation.
 */
export interface BatchResult {
  /** Individual operation results */
  results: BatchResultItem[];

  /** WAL offset (for atomic batches) */
  walOffset?: bigint;
}

/**
 * Server information from INFO operation.
 */
export interface ServerInfo {
  /** Server name */
  serverName: string;

  /** Server version */
  serverVersion: string;

  /** Protocol version */
  protocolVersion: number;

  /** Maximum payload size in bytes */
  maxPayloadBytes?: number;

  /** Maximum batch operations */
  maxBatchOps?: number;

  /** WAL segment size */
  walSegmentSize?: number;

  /** Whether authentication is required */
  authRequired?: boolean;

  /** Server features */
  features?: string[];
}

/**
 * Options for WAL_READ operation.
 */
export interface WalReadOptions {
  /** Maximum entries to read */
  limit?: number;
}

/**
 * A WAL entry.
 */
export interface WalEntry {
  /** WAL offset */
  offset: bigint;

  /** Entry type */
  type: string;

  /** Entry data */
  data: Record<string, unknown>;

  /** Timestamp */
  timestamp: number;
}

/**
 * Result of WAL_READ operation.
 */
export interface WalReadResult {
  /** WAL entries */
  entries: WalEntry[];

  /** Whether more entries exist */
  hasMore: boolean;

  /** Next offset for pagination */
  nextOffset?: bigint;
}

/**
 * Result of SNAPSHOT_INSTANCE operation.
 */
export interface SnapshotResult {
  /** Instance ID */
  instanceId: string;

  /** WAL offset of snapshot */
  walOffset: bigint;

  /** Snapshot size in bytes */
  sizeBytes: number;
}

/**
 * Options for COMPACT operation.
 */
export interface CompactOptions {
  /** Force compaction even if not needed */
  force?: boolean;
}

/**
 * Result of COMPACT operation.
 */
export interface CompactResult {
  /** Number of snapshots created */
  snapshotsCreated: number;

  /** Number of WAL segments deleted */
  segmentsDeleted: number;

  /** Bytes reclaimed */
  bytesReclaimed: bigint;
}

/**
 * Options for LIST_INSTANCES operation.
 */
export interface ListInstancesOptions {
  /** Filter by machine name */
  machine?: string;

  /** Filter by current state */
  state?: string;

  /** Maximum number of instances to return */
  limit?: number;

  /** Number of instances to skip (for pagination) */
  offset?: number;
}

/**
 * Instance summary for list responses (excludes ctx for efficiency).
 */
export interface InstanceSummary {
  /** Instance ID */
  id: string;

  /** Machine name */
  machine: string;

  /** Machine version */
  version: number;

  /** Current state */
  state: string;

  /** Creation timestamp (Unix ms) */
  createdAt: number;

  /** Last update timestamp (Unix ms) */
  updatedAt: number;

  /** Last WAL offset */
  lastWalOffset: bigint;
}

/**
 * Result of LIST_INSTANCES operation.
 */
export interface ListInstancesResult {
  /** List of instance summaries */
  instances: InstanceSummary[];

  /** Total number of matching instances */
  total: number;

  /** Whether more instances exist beyond the limit */
  hasMore: boolean;
}

/**
 * WAL I/O statistics.
 */
export interface WalIoStats {
  /** Total bytes written */
  bytesWritten: number;

  /** Total bytes read */
  bytesRead: number;

  /** Number of write operations */
  writes: number;

  /** Number of read operations */
  reads: number;

  /** Number of fsync calls */
  fsyncs: number;
}

/**
 * Result of WAL_STATS operation.
 */
export interface WalStatsResult {
  /** Total number of entries in WAL */
  entryCount: number;

  /** Number of WAL segments */
  segmentCount: number;

  /** Total size of WAL in bytes */
  totalSizeBytes: number;

  /** Latest WAL offset */
  latestOffset?: bigint;

  /** I/O statistics */
  ioStats: WalIoStats;
}
