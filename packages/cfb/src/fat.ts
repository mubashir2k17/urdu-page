import { CfbError, CfbLimitError } from "./errors.js";
import type { CfbLimits } from "./limits.js";
import {
  SECTOR_DIFAT,
  SECTOR_END_OF_CHAIN,
  SECTOR_FAT,
  SECTOR_FREE,
} from "./header.js";
import type { CfbHeader } from "./header.js";
import { sectorOffset } from "./fat-offset.js";

/**
 * Read the File Allocation Table. The FAT is a fixed array of `numFatSectors`
 * sectors whose IDs are listed (in order) by the DIFAT. Each entry maps a
 * sector id to the next sector id (or a special marker).
 */
export function readFat(
  data: Uint8Array,
  header: CfbHeader,
  difat: number[],
  limits: CfbLimits,
): Uint32Array {
  if (difat.length < header.numFatSectors) {
    throw new CfbError(
      `DIFAT lists ${difat.length} FAT sectors but header declares ${header.numFatSectors}`,
    );
  }

  const entriesPerSector = header.sectorSize / 4;
  const total = header.numFatSectors * entriesPerSector;
  if (total > limits.maxChainHops) {
    throw new CfbLimitError(`FAT too large (${total} entries)`);
  }

  const out = new Uint32Array(total);
  let written = 0;
  for (let i = 0; i < header.numFatSectors; i++) {
    const sector = difat[i]!;
    const offset = sectorOffset(sector, header.sectorSize);
    if (offset + header.sectorSize > data.length) {
      throw new CfbError(`FAT sector ${sector} out of bounds`);
    }
    for (let j = 0; j < entriesPerSector; j++) {
      out[written + j] = readU32(data, offset + j * 4);
    }
    written += entriesPerSector;
  }
  return out;
}

/**
 * Read the mini-FAT. It is stored as a regular stream in the FAT chain.
 */
export function readMiniFat(
  data: Uint8Array,
  header: CfbHeader,
  fat: Uint32Array,
  limits: CfbLimits,
): Uint32Array {
  if (
    header.firstMiniFatSector === SECTOR_END_OF_CHAIN ||
    header.firstMiniFatSector === SECTOR_FREE
  ) {
    return new Uint32Array(0);
  }

  const sectors = readFatChain(fat, header.firstMiniFatSector, limits);
  const entriesPerSector = header.sectorSize / 4;
  const out = new Uint32Array(sectors.length * entriesPerSector);
  let written = 0;
  for (const s of sectors) {
    const offset = sectorOffset(s, header.sectorSize);
    if (offset + header.sectorSize > data.length) {
      throw new CfbError(`Mini-FAT sector ${s} out of bounds`);
    }
    for (let i = 0; i < entriesPerSector; i++) {
      out[written + i] = readU32(data, offset + i * 4);
    }
    written += entriesPerSector;
  }
  return out;
}

/**
 * Read the DIFAT: the 109 header entries plus any chained DIFAT sectors.
 * Returns the ordered list of FAT sector ids.
 */
export function readDifat(
  data: Uint8Array,
  header: CfbHeader,
  limits: CfbLimits,
): number[] {
  const entries: number[] = header.difat.slice();

  if (header.numDifatSectors > 0) {
    const entriesPerSector = header.sectorSize / 4;
    let sector = header.firstDifatSector;
    const visited = new Set<number>();
    let hops = 0;

    while (sector !== SECTOR_END_OF_CHAIN && sector !== SECTOR_FREE) {
      if (++hops > limits.maxChainHops) {
        throw new CfbLimitError(`DIFAT chain exceeded ${limits.maxChainHops} hops`);
      }
      if (visited.has(sector)) {
        throw new CfbError(`Cyclic DIFAT chain at sector ${sector}`);
      }
      visited.add(sector);

      const offset = sectorOffset(sector, header.sectorSize);
      if (offset + header.sectorSize > data.length) {
        throw new CfbError(`DIFAT sector ${sector} out of bounds`);
      }

      for (let i = 0; i < entriesPerSector - 1; i++) {
        const e = readU32(data, offset + i * 4);
        if (e !== SECTOR_FREE) entries.push(e);
      }
      const next = readU32(data, offset + (entriesPerSector - 1) * 4);
      sector = next;
    }
  }

  return entries;
}

/** Follow a chain encoded in the FAT starting at `startSector`. */
export function readFatChain(
  fat: Uint32Array,
  startSector: number,
  limits: CfbLimits,
): number[] {
  const sectors: number[] = [];
  const visited = new Set<number>();
  let sector = startSector;
  let hops = 0;
  while (sector !== SECTOR_END_OF_CHAIN && sector !== SECTOR_FREE) {
    if (++hops > limits.maxChainHops) {
      throw new CfbLimitError(`Chain exceeded ${limits.maxChainHops} hops`);
    }
    if (visited.has(sector)) {
      throw new CfbError(`Cyclic chain at sector ${sector}`);
    }
    visited.add(sector);
    sectors.push(sector);
    const next = fat[sector];
    if (next === undefined) throw new CfbError(`Sector ${sector} missing from FAT`);
    sector = next;
  }
  return sectors;
}

function readU32(data: Uint8Array, offset: number): number {
  return (
    data[offset]! |
    (data[offset + 1]! << 8) |
    (data[offset + 2]! << 16) |
    (data[offset + 3]! << 24)
  ) >>> 0;
}
