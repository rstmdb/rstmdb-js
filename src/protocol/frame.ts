import { crc32c, verifyCrc32c } from './crc32c.js';
import { ProtocolError } from '../errors/classes.js';
import { ErrorCode } from '../errors/codes.js';

/**
 * RCP frame magic bytes: "RCPX"
 */
export const FRAME_MAGIC = 0x52435058; // "RCPX"

/**
 * Protocol version.
 */
export const PROTOCOL_VERSION = 1;

/**
 * Frame header size in bytes (4 magic + 2 version + 2 flags + 2 header_len + 4 payload_len + 4 crc).
 */
export const HEADER_SIZE = 18;

/**
 * Frame flags.
 */
export enum FrameFlags {
  NONE = 0,
  CRC_PRESENT = 1 << 0,
  COMPRESSED = 1 << 1,
  STREAM = 1 << 2,
  END_STREAM = 1 << 3,
}

/**
 * A decoded RCP frame.
 */
export interface Frame {
  flags: number;
  payload: Buffer;
}

/**
 * Encodes a payload into an RCP frame.
 */
export class FrameEncoder {
  private readonly useCrc: boolean;

  constructor(options?: { useCrc?: boolean }) {
    this.useCrc = options?.useCrc ?? true;
  }

  /**
   * Encode an object into an RCP frame.
   */
  encode(payload: object): Buffer {
    const payloadJson = JSON.stringify(payload);
    const payloadBuffer = Buffer.from(payloadJson, 'utf8');

    const flags = this.useCrc ? FrameFlags.CRC_PRESENT : FrameFlags.NONE;
    const crcValue = this.useCrc ? crc32c(payloadBuffer) : 0;

    return this.encodeRaw(payloadBuffer, flags, crcValue);
  }

  /**
   * Encode a stream frame.
   */
  encodeStream(payload: object, endStream: boolean = false): Buffer {
    const payloadJson = JSON.stringify(payload);
    const payloadBuffer = Buffer.from(payloadJson, 'utf8');

    let flags = FrameFlags.STREAM;
    if (this.useCrc) flags |= FrameFlags.CRC_PRESENT;
    if (endStream) flags |= FrameFlags.END_STREAM;

    const crcValue = this.useCrc ? crc32c(payloadBuffer) : 0;

    return this.encodeRaw(payloadBuffer, flags, crcValue);
  }

  /**
   * Encode raw payload with specified flags.
   */
  private encodeRaw(payload: Buffer, flags: number, crcValue: number): Buffer {
    const headerExtLen = 0; // No header extension
    const payloadLen = payload.length;
    const frame = Buffer.allocUnsafe(HEADER_SIZE + headerExtLen + payloadLen);

    // Write header (18 bytes)
    frame.writeUInt32BE(FRAME_MAGIC, 0); // magic (4 bytes) - "RCPX"
    frame.writeUInt16BE(PROTOCOL_VERSION, 4); // version (2 bytes)
    frame.writeUInt16BE(flags, 6); // flags (2 bytes)
    frame.writeUInt16BE(headerExtLen, 8); // header_ext_len (2 bytes) - 0 = no extension
    frame.writeUInt32BE(payloadLen, 10); // payload_len (4 bytes)
    frame.writeUInt32BE(crcValue, 14); // crc32c (4 bytes)

    // Copy payload (no header extension)
    payload.copy(frame, HEADER_SIZE);

    return frame;
  }
}

/**
 * Decodes RCP frames from a byte stream.
 */
export class FrameDecoder {
  private buffer: Buffer = Buffer.alloc(0);
  private readonly verifyCrc: boolean;

  constructor(options?: { verifyCrc?: boolean }) {
    this.verifyCrc = options?.verifyCrc ?? true;
  }

  /**
   * Append data to the internal buffer.
   */
  append(data: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, data]);
  }

  /**
   * Try to decode a frame from the buffer.
   * Returns null if not enough data is available.
   */
  decode(): Frame | null {
    // Need at least a header
    if (this.buffer.length < HEADER_SIZE) {
      return null;
    }

    // Read header fields (18 bytes)
    const magic = this.buffer.readUInt32BE(0);
    if (magic !== FRAME_MAGIC) {
      throw new ProtocolError(
        `Invalid frame magic: expected 0x${FRAME_MAGIC.toString(16)} (RCPX), got 0x${magic.toString(16)}`,
        ErrorCode.BAD_REQUEST
      );
    }

    const version = this.buffer.readUInt16BE(4);
    if (version !== PROTOCOL_VERSION) {
      throw new ProtocolError(
        `Unsupported protocol version: ${version}`,
        ErrorCode.UNSUPPORTED_PROTOCOL
      );
    }

    const flags = this.buffer.readUInt16BE(6);
    const headerExtLen = this.buffer.readUInt16BE(8);
    const payloadLen = this.buffer.readUInt32BE(10);
    const crcValue = this.buffer.readUInt32BE(14);

    // Check if we have the full frame
    const totalLen = HEADER_SIZE + headerExtLen + payloadLen;
    if (this.buffer.length < totalLen) {
      return null;
    }

    // Skip header extension (if any)
    const payloadStart = HEADER_SIZE + headerExtLen;

    // Extract payload
    const payload = this.buffer.subarray(payloadStart, payloadStart + payloadLen);

    // Verify CRC if present
    if (this.verifyCrc && flags & FrameFlags.CRC_PRESENT) {
      if (!verifyCrc32c(payload, crcValue)) {
        throw new ProtocolError('CRC32C checksum mismatch', ErrorCode.BAD_REQUEST);
      }
    }

    // Consume the frame from buffer
    this.buffer = this.buffer.subarray(totalLen);

    return { flags, payload: Buffer.from(payload) };
  }

  /**
   * Reset the decoder state.
   */
  reset(): void {
    this.buffer = Buffer.alloc(0);
  }

  /**
   * Get the current buffer length.
   */
  get bufferedLength(): number {
    return this.buffer.length;
  }
}
