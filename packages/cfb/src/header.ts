import { CfbError, CfbSecurityError, CfbLimitError } from "./errors.js";
import type { CfbLimits } from "./limits.js";

export const CFB_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

export const SECTOR_FREE = 0xffffffff;
export const SECTOR_END_OF_CHAIN = 0xfffffffe;
export const SECTOR_FAT = 0xfffffffd;
export const SECTOR_DIFAT = 0xfffffffc;

export type SectorId = number;

export interface CfbHeader {
  majorVersion: number;
  minorVersion: number;
  byteOrder: number;
  sectorShift: number;
  miniSectorShift: number;
  sectorSize: number;
  miniSectorSize: number;
  numFatSectors: number;
  firstDirectorySector: SectorId;
  miniStreamCutoff: number;
  firstMiniFatSector: SectorId;
  numMiniFatSectors: number;
  firstDifatSector: SectorId;
  numDifatSectors: number;
  difat: number[];
}

/**
 * Parse the 512-byte CFB header from `data` and return the parsed header.
 * `data` is validated for magic and minimum size by the caller (Reader).
 */
export function parseHeader(data: Uint8Array, limits: CfbLimits): CfbHeader {
  if (data.length < 512) {
    throw new CfbError(`CFB file too small (${data.length} bytes, minimum 512)`);
  }
  for (let i = 0; i < CFB_MAGIC.length; i++) {
    if (data[i] !== CFB_MAGIC[i]) {
      throw new CfbSecurityError("Not a valid OLE2/CFB file (bad magic signature)");
    }
  }

  const byteOrder = readU16(data, 0x1c);
  const sectorShift = readU16(data, 0x1e);
  const miniSectorShift = readU16(data, 0x20);

  // A valid CFB has sector shift 9 (512) or 12 (4096), mini 6 (64).
  if (sectorShift !== 9 && sectorShift !== 12) {
    throw new CfbError(`Invalid sector shift ${sectorShift}`);
  }
  if (miniSectorShift !== 6) {
    throw new CfbError(`Invalid mini-sector shift ${miniSectorShift}`);
  }

  const sectorSize = 1 << sectorShift;
  const miniSectorSize = 1 << miniSectorShift;

  const numFatSectors = readU32(data, 0x2c);
  const firstDirectorySector = readU32(data, 0x30);
  const miniStreamCutoff = readU32(data, 0x38);
  const firstMiniFatSector = readU32(data, 0x3c);
  const numMiniFatSectors = readU32(data, 0x40);
  const firstDifatSector = readU32(data, 0x44);
  const numDifatSectors = readU32(data, 0x48);

  const numDifatEntries = 109 + numDifatSectors * (sectorSize / 4 - 1);
  if (numDifatEntries > limits.maxDirectoryEntries) {
    throw new CfbLimitError(`DIFAT has too many entries (${numDifatEntries})`);
  }

  // Read the first 109 DIFAT entries from the header.
  const difat: number[] = [];
  for (let i = 0; i < 109; i++) {
    const entry = readU32(data, 0x4c + i * 4);
    if (entry !== SECTOR_FREE) difat.push(entry);
  }

  return {
    majorVersion: readU16(data, 0x1a),
    minorVersion: byteOrder,
    byteOrder,
    sectorShift,
    miniSectorShift,
    sectorSize,
    miniSectorSize,
    numFatSectors,
    firstDirectorySector,
    miniStreamCutoff,
    firstMiniFatSector,
    numMiniFatSectors,
    firstDifatSector,
    numDifatSectors,
    difat,
  };
}

function readU16(data: Uint8Array, offset: number): number {
  return data[offset]! | (data[offset + 1]! << 8);
}

function readU32(data: Uint8Array, offset: number): number {
  return (
    data[offset]! |
    (data[offset + 1]! << 8) |
    (data[offset + 2]! << 16) |
    (data[offset + 3]! << 24)
  ) >>> 0;
}
