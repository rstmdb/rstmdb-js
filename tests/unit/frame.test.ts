import { describe, it, expect } from 'vitest';
import {
  FrameEncoder,
  FrameDecoder,
  FRAME_MAGIC,
  PROTOCOL_VERSION,
  HEADER_SIZE,
  FrameFlags,
} from '../../src/protocol/frame.js';
import { ProtocolError } from '../../src/errors/classes.js';

// New frame format offsets:
// 0-3: magic (4 bytes)
// 4-5: version (2 bytes)
// 6-7: flags (2 bytes)
// 8-9: header_ext_len (2 bytes)
// 10-13: payload_len (4 bytes)
// 14-17: crc (4 bytes)

describe('FrameEncoder', () => {
  it('encodes a simple message', () => {
    const encoder = new FrameEncoder();
    const payload = { op: 'PING', id: '1' };
    const frame = encoder.encode(payload);

    // Check header
    expect(frame.length).toBeGreaterThan(HEADER_SIZE);
    expect(frame.readUInt32BE(0)).toBe(FRAME_MAGIC);
    expect(frame.readUInt16BE(4)).toBe(PROTOCOL_VERSION);
    expect(frame.readUInt16BE(6)).toBe(FrameFlags.CRC_PRESENT);
    expect(frame.readUInt16BE(8)).toBe(0); // header_ext_len

    // Check payload
    const payloadLen = frame.readUInt32BE(10);
    const payloadJson = frame.subarray(HEADER_SIZE, HEADER_SIZE + payloadLen).toString('utf8');
    expect(JSON.parse(payloadJson)).toEqual(payload);
  });

  it('encodes without CRC when disabled', () => {
    const encoder = new FrameEncoder({ useCrc: false });
    const frame = encoder.encode({ test: 'data' });

    expect(frame.readUInt16BE(6)).toBe(FrameFlags.NONE);
    expect(frame.readUInt32BE(14)).toBe(0); // CRC field should be 0
  });

  it('encodes stream frames with STREAM flag', () => {
    const encoder = new FrameEncoder();
    const frame = encoder.encodeStream({ data: 'test' });

    const flags = frame.readUInt16BE(6);
    expect(flags & FrameFlags.STREAM).toBeTruthy();
    expect(flags & FrameFlags.END_STREAM).toBeFalsy();
  });

  it('encodes end stream frames with END_STREAM flag', () => {
    const encoder = new FrameEncoder();
    const frame = encoder.encodeStream({ data: 'test' }, true);

    const flags = frame.readUInt16BE(6);
    expect(flags & FrameFlags.STREAM).toBeTruthy();
    expect(flags & FrameFlags.END_STREAM).toBeTruthy();
  });

  it('handles unicode in payload', () => {
    const encoder = new FrameEncoder();
    const payload = { message: '你好世界 🌍' };
    const frame = encoder.encode(payload);

    const payloadLen = frame.readUInt32BE(10);
    const payloadJson = frame.subarray(HEADER_SIZE, HEADER_SIZE + payloadLen).toString('utf8');
    expect(JSON.parse(payloadJson)).toEqual(payload);
  });
});

describe('FrameDecoder', () => {
  it('decodes a valid frame', () => {
    const encoder = new FrameEncoder();
    const decoder = new FrameDecoder();

    const originalPayload = { op: 'PING', id: '1' };
    const frame = encoder.encode(originalPayload);

    decoder.append(frame);
    const decoded = decoder.decode();

    expect(decoded).not.toBeNull();
    expect(decoded!.flags).toBe(FrameFlags.CRC_PRESENT);

    const payload = JSON.parse(decoded!.payload.toString('utf8')) as typeof originalPayload;
    expect(payload).toEqual(originalPayload);
  });

  it('returns null for incomplete header', () => {
    const decoder = new FrameDecoder();
    decoder.append(Buffer.alloc(8)); // Less than HEADER_SIZE

    expect(decoder.decode()).toBeNull();
  });

  it('returns null for incomplete payload', () => {
    const encoder = new FrameEncoder();
    const decoder = new FrameDecoder();

    const frame = encoder.encode({ data: 'test' });
    // Send only partial frame
    decoder.append(frame.subarray(0, HEADER_SIZE + 2));

    expect(decoder.decode()).toBeNull();
  });

  it('decodes multiple frames from single buffer', () => {
    const encoder = new FrameEncoder();
    const decoder = new FrameDecoder();

    const frame1 = encoder.encode({ id: '1' });
    const frame2 = encoder.encode({ id: '2' });

    decoder.append(Buffer.concat([frame1, frame2]));

    const decoded1 = decoder.decode();
    const decoded2 = decoder.decode();
    const decoded3 = decoder.decode();

    expect(decoded1).not.toBeNull();
    expect(decoded2).not.toBeNull();
    expect(decoded3).toBeNull();

    expect(JSON.parse(decoded1!.payload.toString('utf8'))).toEqual({ id: '1' });
    expect(JSON.parse(decoded2!.payload.toString('utf8'))).toEqual({ id: '2' });
  });

  it('decodes frames split across multiple appends', () => {
    const encoder = new FrameEncoder();
    const decoder = new FrameDecoder();

    const frame = encoder.encode({ message: 'hello' });
    const mid = Math.floor(frame.length / 2);

    decoder.append(frame.subarray(0, mid));
    expect(decoder.decode()).toBeNull();

    decoder.append(frame.subarray(mid));
    const decoded = decoder.decode();

    expect(decoded).not.toBeNull();
    expect(JSON.parse(decoded!.payload.toString('utf8'))).toEqual({ message: 'hello' });
  });

  it('throws on invalid magic bytes', () => {
    const decoder = new FrameDecoder();

    const badFrame = Buffer.alloc(HEADER_SIZE + 10);
    badFrame.writeUInt32BE(0x12345678, 0); // Wrong magic
    badFrame.writeUInt16BE(PROTOCOL_VERSION, 4); // version
    badFrame.writeUInt16BE(0, 6); // flags
    badFrame.writeUInt16BE(0, 8); // header_ext_len
    badFrame.writeUInt32BE(10, 10); // payload_len

    decoder.append(badFrame);
    expect(() => decoder.decode()).toThrow(ProtocolError);
  });

  it('throws on CRC mismatch when verification enabled', () => {
    const encoder = new FrameEncoder();
    const decoder = new FrameDecoder({ verifyCrc: true });

    const frame = encoder.encode({ data: 'test' });
    // Corrupt the payload
    frame[HEADER_SIZE] = frame[HEADER_SIZE]! ^ 0xff;

    decoder.append(frame);
    expect(() => decoder.decode()).toThrow(ProtocolError);
  });

  it('ignores CRC when verification disabled', () => {
    const encoder = new FrameEncoder();
    const decoder = new FrameDecoder({ verifyCrc: false });

    const frame = encoder.encode({ data: 'test' });
    // Corrupt the payload
    frame[HEADER_SIZE] = frame[HEADER_SIZE]! ^ 0xff;

    decoder.append(frame);
    const decoded = decoder.decode();
    expect(decoded).not.toBeNull();
  });

  it('reset clears the buffer', () => {
    const decoder = new FrameDecoder();
    decoder.append(Buffer.alloc(100));
    expect(decoder.bufferedLength).toBe(100);

    decoder.reset();
    expect(decoder.bufferedLength).toBe(0);
  });
});

describe('FrameEncoder + FrameDecoder roundtrip', () => {
  it('handles large payloads', () => {
    const encoder = new FrameEncoder();
    const decoder = new FrameDecoder();

    const largeData = { data: 'x'.repeat(100000) };
    const frame = encoder.encode(largeData);

    decoder.append(frame);
    const decoded = decoder.decode();

    expect(decoded).not.toBeNull();
    expect(JSON.parse(decoded!.payload.toString('utf8'))).toEqual(largeData);
  });

  it('handles empty object payload', () => {
    const encoder = new FrameEncoder();
    const decoder = new FrameDecoder();

    const frame = encoder.encode({});
    decoder.append(frame);
    const decoded = decoder.decode();

    expect(decoded).not.toBeNull();
    expect(JSON.parse(decoded!.payload.toString('utf8'))).toEqual({});
  });

  it('handles complex nested payload', () => {
    const encoder = new FrameEncoder();
    const decoder = new FrameDecoder();

    const payload = {
      nested: {
        deep: {
          value: [1, 2, 3],
          more: { a: 'b' },
        },
      },
      array: [{ x: 1 }, { y: 2 }],
      nullValue: null,
      boolTrue: true,
      boolFalse: false,
    };

    const frame = encoder.encode(payload);
    decoder.append(frame);
    const decoded = decoder.decode();

    expect(decoded).not.toBeNull();
    expect(JSON.parse(decoded!.payload.toString('utf8'))).toEqual(payload);
  });
});
