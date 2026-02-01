import { describe, it, expect } from 'vitest';
import {
  ErrorCode,
  isRetryableCode,
  RstmdbError,
  ConnectionError,
  TimeoutError,
  ProtocolError,
  ServerError,
  NotFoundError,
  ConflictError,
  AuthenticationError,
  InvalidTransitionError,
  GuardFailedError,
} from '../../src/errors/index.js';

describe('ErrorCode', () => {
  it('has all expected error codes', () => {
    expect(ErrorCode.UNSUPPORTED_PROTOCOL).toBe('UNSUPPORTED_PROTOCOL');
    expect(ErrorCode.NOT_FOUND).toBe('NOT_FOUND');
    expect(ErrorCode.CONFLICT).toBe('CONFLICT');
    expect(ErrorCode.TIMEOUT).toBe('TIMEOUT');
    expect(ErrorCode.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
  });
});

describe('isRetryableCode', () => {
  it('returns true for retryable codes', () => {
    expect(isRetryableCode(ErrorCode.CONNECTION_FAILED)).toBe(true);
    expect(isRetryableCode(ErrorCode.CONNECTION_CLOSED)).toBe(true);
    expect(isRetryableCode(ErrorCode.TIMEOUT)).toBe(true);
    expect(isRetryableCode(ErrorCode.RATE_LIMITED)).toBe(true);
    expect(isRetryableCode(ErrorCode.WAL_IO_ERROR)).toBe(true);
    expect(isRetryableCode(ErrorCode.INTERNAL_ERROR)).toBe(true);
  });

  it('returns false for non-retryable codes', () => {
    expect(isRetryableCode(ErrorCode.NOT_FOUND)).toBe(false);
    expect(isRetryableCode(ErrorCode.CONFLICT)).toBe(false);
    expect(isRetryableCode(ErrorCode.UNAUTHORIZED)).toBe(false);
    expect(isRetryableCode(ErrorCode.INVALID_TRANSITION)).toBe(false);
    expect(isRetryableCode(ErrorCode.BAD_REQUEST)).toBe(false);
  });
});

describe('RstmdbError', () => {
  it('creates error with code and message', () => {
    const error = new RstmdbError('Test error', ErrorCode.NOT_FOUND);

    expect(error.message).toBe('Test error');
    expect(error.code).toBe(ErrorCode.NOT_FOUND);
    expect(error.name).toBe('RstmdbError');
    expect(error.retryable).toBe(false);
  });

  it('sets retryable based on code by default', () => {
    const retryable = new RstmdbError('Error', ErrorCode.TIMEOUT);
    const notRetryable = new RstmdbError('Error', ErrorCode.NOT_FOUND);

    expect(retryable.retryable).toBe(true);
    expect(notRetryable.retryable).toBe(false);
  });

  it('allows overriding retryable', () => {
    const error = new RstmdbError('Error', ErrorCode.NOT_FOUND, { retryable: true });
    expect(error.retryable).toBe(true);
  });

  it('includes details', () => {
    const details = { instanceId: 'i-123', state: 'active' };
    const error = new RstmdbError('Error', ErrorCode.CONFLICT, { details });

    expect(error.details).toEqual(details);
  });

  it('includes cause', () => {
    const cause = new Error('Original error');
    const error = new RstmdbError('Wrapped error', ErrorCode.INTERNAL_ERROR, { cause });

    expect(error.cause).toBe(cause);
  });

  it('creates from response', () => {
    const response = {
      code: 'NOT_FOUND',
      message: 'Instance not found',
      details: { instanceId: 'i-123' },
    };

    const error = RstmdbError.fromResponse(response);

    expect(error.code).toBe(ErrorCode.NOT_FOUND);
    expect(error.message).toBe('Instance not found');
    expect(error.details).toEqual({ instanceId: 'i-123' });
  });
});

describe('ConnectionError', () => {
  it('creates with correct defaults', () => {
    const error = new ConnectionError('Connection refused');

    expect(error.name).toBe('ConnectionError');
    expect(error.code).toBe(ErrorCode.CONNECTION_FAILED);
    expect(error.retryable).toBe(true);
  });

  it('is instance of RstmdbError', () => {
    const error = new ConnectionError('Failed');
    expect(error).toBeInstanceOf(RstmdbError);
  });
});

describe('TimeoutError', () => {
  it('creates with correct defaults', () => {
    const error = new TimeoutError('Request timed out');

    expect(error.name).toBe('TimeoutError');
    expect(error.code).toBe(ErrorCode.TIMEOUT);
    expect(error.retryable).toBe(true);
  });
});

describe('ProtocolError', () => {
  it('creates with correct defaults', () => {
    const error = new ProtocolError('Invalid frame');

    expect(error.name).toBe('ProtocolError');
    expect(error.code).toBe(ErrorCode.BAD_REQUEST);
    expect(error.retryable).toBe(false);
  });

  it('allows custom error code', () => {
    const error = new ProtocolError('Unsupported', ErrorCode.UNSUPPORTED_PROTOCOL);
    expect(error.code).toBe(ErrorCode.UNSUPPORTED_PROTOCOL);
  });
});

describe('ServerError', () => {
  it('creates from response with correct subclass', () => {
    const notFound = ServerError.fromResponse({
      code: 'NOT_FOUND',
      message: 'Resource not found',
    });
    expect(notFound).toBeInstanceOf(NotFoundError);

    const conflict = ServerError.fromResponse({
      code: 'CONFLICT',
      message: 'Version conflict',
    });
    expect(conflict).toBeInstanceOf(ConflictError);

    const authError = ServerError.fromResponse({
      code: 'UNAUTHORIZED',
      message: 'Invalid token',
    });
    expect(authError).toBeInstanceOf(AuthenticationError);

    const invalidTransition = ServerError.fromResponse({
      code: 'INVALID_TRANSITION',
      message: 'No valid transition',
    });
    expect(invalidTransition).toBeInstanceOf(InvalidTransitionError);

    const guardFailed = ServerError.fromResponse({
      code: 'GUARD_FAILED',
      message: 'Guard condition failed',
    });
    expect(guardFailed).toBeInstanceOf(GuardFailedError);
  });

  it('creates generic ServerError for unknown codes', () => {
    const error = ServerError.fromResponse({
      code: 'SOME_UNKNOWN_CODE',
      message: 'Unknown error',
    });

    expect(error).toBeInstanceOf(ServerError);
    expect(error.name).toBe('ServerError');
  });
});

describe('NotFoundError', () => {
  it('creates with correct defaults', () => {
    const error = new NotFoundError('Machine not found');

    expect(error.name).toBe('NotFoundError');
    expect(error.code).toBe(ErrorCode.NOT_FOUND);
    expect(error.retryable).toBe(false);
  });

  it('allows custom code', () => {
    const error = new NotFoundError('Instance not found', ErrorCode.INSTANCE_NOT_FOUND);
    expect(error.code).toBe(ErrorCode.INSTANCE_NOT_FOUND);
  });
});

describe('ConflictError', () => {
  it('creates with correct defaults', () => {
    const error = new ConflictError('Instance already exists');

    expect(error.name).toBe('ConflictError');
    expect(error.code).toBe(ErrorCode.CONFLICT);
    expect(error.retryable).toBe(false);
  });

  it('includes details', () => {
    const error = new ConflictError('State mismatch', ErrorCode.CONFLICT, {
      details: { expectedState: 'active', actualState: 'pending' },
    });

    expect(error.details).toEqual({
      expectedState: 'active',
      actualState: 'pending',
    });
  });
});

describe('AuthenticationError', () => {
  it('creates with correct defaults', () => {
    const error = new AuthenticationError('Invalid credentials');

    expect(error.name).toBe('AuthenticationError');
    expect(error.code).toBe(ErrorCode.UNAUTHORIZED);
    expect(error.retryable).toBe(false);
  });
});

describe('InvalidTransitionError', () => {
  it('creates with correct defaults', () => {
    const error = new InvalidTransitionError('Cannot transition from shipped to created');

    expect(error.name).toBe('InvalidTransitionError');
    expect(error.code).toBe(ErrorCode.INVALID_TRANSITION);
    expect(error.retryable).toBe(false);
  });
});

describe('GuardFailedError', () => {
  it('creates with correct defaults', () => {
    const error = new GuardFailedError('Guard "hasBalance" returned false');

    expect(error.name).toBe('GuardFailedError');
    expect(error.code).toBe(ErrorCode.GUARD_FAILED);
    expect(error.retryable).toBe(false);
  });
});
