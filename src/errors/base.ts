import { ErrorCode, isRetryableCode } from './codes.js';

/**
 * Base error class for all rstmdb errors.
 */
export class RstmdbError extends Error {
  /** Error code */
  readonly code: ErrorCode;

  /** Whether the operation can be retried */
  readonly retryable: boolean;

  /** Additional error details */
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: ErrorCode,
    options?: {
      retryable?: boolean;
      details?: Record<string, unknown>;
      cause?: Error;
    }
  ) {
    super(message, { cause: options?.cause });
    this.name = 'RstmdbError';
    this.code = code;
    this.retryable = options?.retryable ?? isRetryableCode(code);
    this.details = options?.details;

    // Maintain proper prototype chain
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Create an error from a server response.
   */
  static fromResponse(response: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  }): RstmdbError {
    const code = (response.code as ErrorCode) || ErrorCode.INTERNAL_ERROR;
    return new RstmdbError(response.message, code, {
      details: response.details,
    });
  }
}
