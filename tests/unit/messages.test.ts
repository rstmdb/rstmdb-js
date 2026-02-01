import { describe, it, expect } from 'vitest';
import {
  isResponseMessage,
  isStreamEventMessage,
  isStreamEndMessage,
  parseBigIntFields,
  serializeBigIntFields,
  type ResponseMessage,
  type StreamEventMessage,
  type StreamEndMessage,
} from '../../src/protocol/messages.js';

describe('message type guards', () => {
  it('isResponseMessage identifies response messages', () => {
    const response: ResponseMessage = {
      id: '1',
      type: 'response',
      ok: true,
      result: { data: 'test' },
    };

    expect(isResponseMessage(response)).toBe(true);
    expect(isStreamEventMessage(response)).toBe(false);
    expect(isStreamEndMessage(response)).toBe(false);
  });

  it('isStreamEventMessage identifies stream events', () => {
    const event: StreamEventMessage = {
      subscriptionId: 'sub-1',
      type: 'event',
      instanceId: 'i-123',
      machine: 'order',
      version: 1,
      walOffset: '100',
      fromState: 'created',
      toState: 'paid',
      event: 'PAY',
    };

    expect(isStreamEventMessage(event)).toBe(true);
    expect(isResponseMessage(event)).toBe(false);
    expect(isStreamEndMessage(event)).toBe(false);
  });

  it('isStreamEndMessage identifies stream end messages', () => {
    const end: StreamEndMessage = {
      subscriptionId: 'sub-1',
      type: 'end',
      reason: 'completed',
    };

    expect(isStreamEndMessage(end)).toBe(true);
    expect(isResponseMessage(end)).toBe(false);
    expect(isStreamEventMessage(end)).toBe(false);
  });
});

describe('parseBigIntFields', () => {
  it('parses string fields to bigint', () => {
    const obj = {
      walOffset: '9007199254740993',
      other: 'value',
    };

    const result = parseBigIntFields(obj, ['walOffset']);

    expect(result.walOffset).toBe(9007199254740993n);
    expect(result.other).toBe('value');
  });

  it('handles multiple fields', () => {
    const obj = {
      offset1: '100',
      offset2: '200',
      name: 'test',
    };

    const result = parseBigIntFields(obj, ['offset1', 'offset2']);

    expect(result.offset1).toBe(100n);
    expect(result.offset2).toBe(200n);
    expect(result.name).toBe('test');
  });

  it('ignores missing fields', () => {
    const obj = {
      data: 'value',
    };

    const result = parseBigIntFields(obj, ['walOffset']);

    expect(result).toEqual({ data: 'value' });
  });

  it('ignores non-string fields', () => {
    const obj = {
      walOffset: 123,
      other: 'value',
    };

    const result = parseBigIntFields(obj, ['walOffset']);

    expect(result.walOffset).toBe(123);
  });

  it('does not mutate original object', () => {
    const obj = {
      walOffset: '100',
    };

    parseBigIntFields(obj, ['walOffset']);

    expect(obj.walOffset).toBe('100');
  });
});

describe('serializeBigIntFields', () => {
  it('serializes bigint fields to string', () => {
    const obj = {
      walOffset: 9007199254740993n,
      other: 'value',
    };

    const result = serializeBigIntFields(obj, ['walOffset']);

    expect(result.walOffset).toBe('9007199254740993');
    expect(result.other).toBe('value');
  });

  it('handles multiple fields', () => {
    const obj = {
      offset1: 100n,
      offset2: 200n,
      name: 'test',
    };

    const result = serializeBigIntFields(obj, ['offset1', 'offset2']);

    expect(result.offset1).toBe('100');
    expect(result.offset2).toBe('200');
    expect(result.name).toBe('test');
  });

  it('ignores missing fields', () => {
    const obj = {
      data: 'value',
    };

    const result = serializeBigIntFields(obj, ['walOffset']);

    expect(result).toEqual({ data: 'value' });
  });

  it('ignores non-bigint fields', () => {
    const obj = {
      walOffset: 'already-string',
      other: 123,
    };

    const result = serializeBigIntFields(obj, ['walOffset', 'other']);

    expect(result.walOffset).toBe('already-string');
    expect(result.other).toBe(123);
  });

  it('does not mutate original object', () => {
    const obj = {
      walOffset: 100n,
    };

    serializeBigIntFields(obj, ['walOffset']);

    expect(obj.walOffset).toBe(100n);
  });
});
