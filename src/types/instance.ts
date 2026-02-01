/**
 * Options for CREATE_INSTANCE operation.
 */
export interface CreateInstanceOptions {
  /** Custom instance ID (server generates if omitted) */
  instanceId?: string;

  /** Initial context data */
  initialCtx?: Record<string, unknown>;

  /** Idempotency key for deduplication */
  idempotencyKey?: string;
}

/**
 * Result of CREATE_INSTANCE operation.
 */
export interface CreateInstanceResult {
  /** Generated or provided instance ID */
  instanceId: string;

  /** Initial state */
  state: string;

  /** WAL offset of the creation */
  walOffset: bigint;
}

/**
 * Result of GET_INSTANCE operation.
 */
export interface GetInstanceResult {
  /** Machine name */
  machine: string;

  /** Machine version */
  version: number;

  /** Current state */
  state: string;

  /** Current context */
  ctx: Record<string, unknown>;

  /** Last applied event ID */
  lastEventId?: string;

  /** Last WAL offset */
  lastWalOffset: bigint;
}

/**
 * Options for DELETE_INSTANCE operation.
 */
export interface DeleteInstanceOptions {
  /** Idempotency key for deduplication */
  idempotencyKey?: string;
}
