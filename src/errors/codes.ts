/**
 * Error codes used by the rstmdb client.
 */
export enum ErrorCode {
  // Protocol errors
  UNSUPPORTED_PROTOCOL = 'UNSUPPORTED_PROTOCOL',
  BAD_REQUEST = 'BAD_REQUEST',

  // Authentication errors
  UNAUTHORIZED = 'UNAUTHORIZED',
  AUTH_FAILED = 'AUTH_FAILED',

  // Resource errors
  NOT_FOUND = 'NOT_FOUND',
  MACHINE_NOT_FOUND = 'MACHINE_NOT_FOUND',
  MACHINE_VERSION_EXISTS = 'MACHINE_VERSION_EXISTS',
  MACHINE_VERSION_LIMIT_EXCEEDED = 'MACHINE_VERSION_LIMIT_EXCEEDED',
  INSTANCE_NOT_FOUND = 'INSTANCE_NOT_FOUND',
  INSTANCE_EXISTS = 'INSTANCE_EXISTS',

  // State machine errors
  INVALID_TRANSITION = 'INVALID_TRANSITION',
  GUARD_FAILED = 'GUARD_FAILED',
  CONFLICT = 'CONFLICT',

  // System errors
  WAL_IO_ERROR = 'WAL_IO_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  RATE_LIMITED = 'RATE_LIMITED',

  // Client-side errors
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  CONNECTION_CLOSED = 'CONNECTION_CLOSED',
  TIMEOUT = 'TIMEOUT',
}

/**
 * Determine if an error code indicates a retryable error.
 */
export function isRetryableCode(code: ErrorCode): boolean {
  switch (code) {
    case ErrorCode.CONNECTION_FAILED:
    case ErrorCode.CONNECTION_CLOSED:
    case ErrorCode.TIMEOUT:
    case ErrorCode.RATE_LIMITED:
    case ErrorCode.WAL_IO_ERROR:
    case ErrorCode.INTERNAL_ERROR:
      return true;
    default:
      return false;
  }
}
