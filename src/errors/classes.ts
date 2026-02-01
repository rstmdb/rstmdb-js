import { ErrorCode } from './codes.js';
import { RstmdbError } from './base.js';

/**
 * Connection-related errors.
 */
export class ConnectionError extends RstmdbError {
  constructor(message: string, options?: { cause?: Error; details?: Record<string, unknown> }) {
    super(message, ErrorCode.CONNECTION_FAILED, {
      retryable: true,
      ...options,
    });
    this.name = 'ConnectionError';
  }
}

/**
 * Timeout errors.
 */
export class TimeoutError extends RstmdbError {
  constructor(message: string, options?: { cause?: Error; details?: Record<string, unknown> }) {
    super(message, ErrorCode.TIMEOUT, {
      retryable: true,
      ...options,
    });
    this.name = 'TimeoutError';
  }
}

/**
 * Protocol-level errors.
 */
export class ProtocolError extends RstmdbError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.BAD_REQUEST,
    options?: { cause?: Error; details?: Record<string, unknown> }
  ) {
    super(message, code, {
      retryable: false,
      ...options,
    });
    this.name = 'ProtocolError';
  }
}

/**
 * Server-returned errors.
 */
export class ServerError extends RstmdbError {
  constructor(
    message: string,
    code: ErrorCode,
    options?: { retryable?: boolean; details?: Record<string, unknown>; cause?: Error }
  ) {
    super(message, code, options);
    this.name = 'ServerError';
  }

  /**
   * Create a ServerError from a server response.
   */
  static fromResponse(response: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  }): ServerError {
    const code = (response.code as ErrorCode) || ErrorCode.INTERNAL_ERROR;
    const message = response.message || 'Unknown server error';

    // Map to specific error classes
    switch (code) {
      case ErrorCode.NOT_FOUND:
      case ErrorCode.MACHINE_NOT_FOUND:
      case ErrorCode.INSTANCE_NOT_FOUND:
        return new NotFoundError(message, code, { details: response.details });

      case ErrorCode.CONFLICT:
      case ErrorCode.INSTANCE_EXISTS:
      case ErrorCode.MACHINE_VERSION_EXISTS:
        return new ConflictError(message, code, { details: response.details });

      case ErrorCode.UNAUTHORIZED:
      case ErrorCode.AUTH_FAILED:
        return new AuthenticationError(message, code, { details: response.details });

      case ErrorCode.INVALID_TRANSITION:
        return new InvalidTransitionError(message, { details: response.details });

      case ErrorCode.GUARD_FAILED:
        return new GuardFailedError(message, { details: response.details });

      default:
        return new ServerError(message, code, { details: response.details });
    }
  }
}

/**
 * Resource not found errors.
 */
export class NotFoundError extends ServerError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.NOT_FOUND,
    options?: { details?: Record<string, unknown>; cause?: Error }
  ) {
    super(message, code, { retryable: false, ...options });
    this.name = 'NotFoundError';
  }
}

/**
 * Conflict errors (resource already exists, version mismatch, etc.).
 */
export class ConflictError extends ServerError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.CONFLICT,
    options?: { details?: Record<string, unknown>; cause?: Error }
  ) {
    super(message, code, { retryable: false, ...options });
    this.name = 'ConflictError';
  }
}

/**
 * Authentication errors.
 */
export class AuthenticationError extends ServerError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.UNAUTHORIZED,
    options?: { details?: Record<string, unknown>; cause?: Error }
  ) {
    super(message, code, { retryable: false, ...options });
    this.name = 'AuthenticationError';
  }
}

/**
 * Invalid state transition errors.
 */
export class InvalidTransitionError extends ServerError {
  constructor(message: string, options?: { details?: Record<string, unknown>; cause?: Error }) {
    super(message, ErrorCode.INVALID_TRANSITION, { retryable: false, ...options });
    this.name = 'InvalidTransitionError';
  }
}

/**
 * Guard condition failed errors.
 */
export class GuardFailedError extends ServerError {
  constructor(message: string, options?: { details?: Record<string, unknown>; cause?: Error }) {
    super(message, ErrorCode.GUARD_FAILED, { retryable: false, ...options });
    this.name = 'GuardFailedError';
  }
}
