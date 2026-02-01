/**
 * CRC32C implementation using the Castagnoli polynomial.
 * This is a software fallback - Node.js doesn't have native CRC32C.
 */

// CRC32C lookup table (Castagnoli polynomial: 0x1EDC6F41)
const CRC32C_TABLE = new Uint32Array(256);

// Initialize the lookup table
(function initTable() {
  const POLYNOMIAL = 0x82f63b78; // Reversed Castagnoli polynomial

  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      if (crc & 1) {
        crc = (crc >>> 1) ^ POLYNOMIAL;
      } else {
        crc = crc >>> 1;
      }
    }
    CRC32C_TABLE[i] = crc >>> 0;
  }
})();

/**
 * Compute CRC32C checksum of data.
 */
export function crc32c(data: Buffer): number {
  let crc = 0xffffffff;

  for (let i = 0; i < data.length; i++) {
    const byte = data[i]!;
    const tableIndex = (crc ^ byte) & 0xff;
    crc = (crc >>> 8) ^ CRC32C_TABLE[tableIndex]!;
  }

  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Verify CRC32C checksum.
 */
export function verifyCrc32c(data: Buffer, expected: number): boolean {
  return crc32c(data) === expected;
}
