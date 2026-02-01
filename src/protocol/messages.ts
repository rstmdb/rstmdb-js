import type { Operation } from './operations.js';

/**
 * Base request message.
 */
export interface RequestMessage {
  /** Message type - always "request" */
  type: 'request';

  /** Request ID for correlation */
  id: string;

  /** Operation type */
  op: Operation;

  /** Operation parameters */
  params?: object;
}

/**
 * Base response message.
 */
export interface ResponseMessage {
  /** Request ID this responds to */
  id: string;

  /** Message type */
  type: 'response';

  /** Response status */
  status: 'ok' | 'error';

  /** Result data (if successful) */
  result?: Record<string, unknown>;

  /** Error information (if failed) */
  error?: {
    code: string;
    message: string;
    retryable?: boolean;
    details?: Record<string, unknown>;
  };

  /** Response metadata */
  meta?: {
    server_time?: string;
    wal_offset?: number;
    leader?: boolean;
    trace_id?: string;
  };
}

/**
 * Stream event message (wire format - snake_case from server).
 */
export interface StreamEventMessage {
  /** Subscription ID */
  subscription_id: string;

  /** Message type */
  type: 'event';

  /** Instance ID */
  instance_id: string;

  /** Machine name */
  machine: string;

  /** Machine version */
  version: number;

  /** WAL offset */
  wal_offset: string; // bigint serialized as string

  /** Source state */
  from_state: string;

  /** Target state */
  to_state: string;

  /** Event name */
  event: string;

  /** Event payload */
  payload?: Record<string, unknown>;

  /** Instance context */
  ctx?: Record<string, unknown>;
}

/**
 * Stream end message (wire format - snake_case from server).
 */
export interface StreamEndMessage {
  /** Subscription ID */
  subscription_id: string;

  /** Message type */
  type: 'end';

  /** Reason for ending */
  reason?: string;
}

/**
 * Any message from the server.
 */
export type ServerMessage = ResponseMessage | StreamEventMessage | StreamEndMessage;

/**
 * Check if a message is a response.
 */
export function isResponseMessage(msg: ServerMessage): msg is ResponseMessage {
  return msg.type === 'response';
}

/**
 * Check if a message is a stream event.
 */
export function isStreamEventMessage(msg: ServerMessage): msg is StreamEventMessage {
  return msg.type === 'event';
}

/**
 * Check if a message is a stream end.
 */
export function isStreamEndMessage(msg: ServerMessage): msg is StreamEndMessage {
  return msg.type === 'end';
}

/**
 * Parse bigint fields from server response.
 * Server sends bigints as strings.
 */
export function parseBigIntFields<T extends Record<string, unknown>>(
  obj: T,
  fields: string[]
): T {
  const result: Record<string, unknown> = { ...obj };
  for (const field of fields) {
    const value = result[field];
    if (typeof value === 'string') {
      result[field] = BigInt(value);
    }
  }
  return result as T;
}

/**
 * Serialize bigint fields for requests.
 */
export function serializeBigIntFields<T extends Record<string, unknown>>(
  obj: T,
  fields: string[]
): T {
  const result: Record<string, unknown> = { ...obj };
  for (const field of fields) {
    const value = result[field];
    if (typeof value === 'bigint') {
      result[field] = value.toString();
    }
  }
  return result as T;
}
