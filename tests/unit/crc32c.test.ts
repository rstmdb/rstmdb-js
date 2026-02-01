import { describe, it, expect } from 'vitest';
import { crc32c, verifyCrc32c } from '../../src/protocol/crc32c.js';

describe('CRC32C', () => {
  it('computes correct CRC for empty buffer', () => {
    const result = crc32c(Buffer.alloc(0));
    expect(result).toBe(0x00000000);
  });

  it('computes correct CRC for "123456789"', () => {
    // Standard test vector for CRC32C
    const data = Buffer.from('123456789', 'utf8');
    const result = crc32c(data);
    expect(result).toBe(0xe3069283);
  });

  it('computes correct CRC for single byte', () => {
    const result = crc32c(Buffer.from([0x00]));
    expect(result).toBe(0x527d5351);
  });

  it('computes correct CRC for all zeros', () => {
    const data = Buffer.alloc(32, 0);
    const result = crc32c(data);
    expect(result).toBe(0x8a9136aa);
  });

  it('computes correct CRC for all ones', () => {
    const data = Buffer.alloc(32, 0xff);
    const result = crc32c(data);
    expect(result).toBe(0x62a8ab43);
  });

  it('verifyCrc32c returns true for correct CRC', () => {
    const data = Buffer.from('123456789', 'utf8');
    expect(verifyCrc32c(data, 0xe3069283)).toBe(true);
  });

  it('verifyCrc32c returns false for incorrect CRC', () => {
    const data = Buffer.from('123456789', 'utf8');
    expect(verifyCrc32c(data, 0x12345678)).toBe(false);
  });

  it('produces different CRCs for different data', () => {
    const data1 = Buffer.from('hello', 'utf8');
    const data2 = Buffer.from('world', 'utf8');
    expect(crc32c(data1)).not.toBe(crc32c(data2));
  });

  it('produces consistent CRCs for same data', () => {
    const data = Buffer.from('test data', 'utf8');
    const crc1 = crc32c(data);
    const crc2 = crc32c(data);
    expect(crc1).toBe(crc2);
  });
});
