import { CfbError, CfbLimitError } from "./errors.js";
import type { CfbLimits } from "./limits.js";
import { SECTOR_END_OF_CHAIN, SECTOR_FREE } from "./header.js";
import type { CfbHeader } from "./header.js";
import { sectorOffset } from "./fat-offset.js";
import type { DirectoryEntry } from "./directory.js";
import { readFatChain } from "./fat.js";

export interface StreamResult {
  bytes: Uint8Array;
  offsets: number[];
}

/** Follow a FAT chain and return the list of sector ids. */
export function readRegularChain(
  fat: Uint32Array,
  startSector: number,
  limits: CfbLimits,
): number[] {
  return readFatChain(fat, startSector, limits);
}

/** Follow a mini-FAT chain and return the list of mini-sector ids. */
export function readMiniChain(
  miniFat: Uint32Array,
  startSector: number,
  limits: CfbLimits,
): number[] {
  const sectors: number[] = [];
  const visited = new Set<number>();
  let sector = startSector;
  let hops = 0;
  while (sector !== SECTOR_END_OF_CHAIN && sector !== SECTOR_FREE) {
    if (++hops > limits.maxChainHops) {
      throw new CfbLimitError(`Mini-stream chain exceeded ${limits.maxChainHops} hops`);
    }
    if (visited.has(sector)) {
      throw new CfbError(`Cyclic mini-stream chain at ${sector}`);
    }
    visited.add(sector);
    sectors.push(sector);
    const next = miniFat[sector];
    if (next === undefined) throw new CfbError(`Mini-stream sector ${sector} missing from mini-FAT`);
    sector = next;
  }
  return sectors;
}

/**
 * Read a stream's raw bytes.
 * Streams smaller than miniStreamCutoff live in the mini-stream (via mini-FAT);
 * larger streams live directly in regular sectors (via FAT).
 */
export function readStream(
  data: Uint8Array,
  header: CfbHeader,
  fat: Uint32Array,
  miniFat: Uint32Array,
  miniStreamChain: number[],
  entry: DirectoryEntry,
  limits: CfbLimits,
): StreamResult {
  if (entry.streamSize > limits.maxStreamSize) {
    throw new CfbLimitError(`Stream "${entry.name}" exceeds max stream size (${entry.streamSize})`);
  }
  if (entry.streamSize === 0) {
    return { bytes: new Uint8Array(0), offsets: [] };
  }
  if (entry.streamSize < header.miniStreamCutoff) {
    return readMiniStream(data, header, miniFat, miniStreamChain, entry, limits);
  }
  return readRegularStream(data, header, fat, entry, limits);
}

function readRegularStream(
  data: Uint8Array,
  header: CfbHeader,
  fat: Uint32Array,
  entry: DirectoryEntry,
  limits: CfbLimits,
): StreamResult {
  const sectors = readRegularChain(fat, entry.startSector, limits);
  const out = new Uint8Array(entry.streamSize);
  const offsets: number[] = [];
  let written = 0;
  for (const s of sectors) {
    const offset = sectorOffset(s, header.sectorSize);
    if (offset + header.sectorSize > data.length) {
      throw new CfbError(`Stream sector ${s} out of bounds`);
    }
    const take = Math.min(header.sectorSize, entry.streamSize - written);
    out.set(data.subarray(offset, offset + take), written);
    offsets.push(offset);
    written += take;
    if (written >= entry.streamSize) break;
  }
  if (written < entry.streamSize) {
    throw new CfbError(`Stream "${entry.name}" ended early (${written}/${entry.streamSize})`);
  }
  return { bytes: out, offsets };
}

function readMiniStream(
  data: Uint8Array,
  header: CfbHeader,
  miniFat: Uint32Array,
  miniStreamChain: number[],
  entry: DirectoryEntry,
  limits: CfbLimits,
): StreamResult {
  const miniSectors = readMiniChain(miniFat, entry.startSector, limits);
  const out = new Uint8Array(entry.streamSize);
  const offsets: number[] = [];
  let written = 0;

  for (const ms of miniSectors) {
    const containerByte = ms * header.miniSectorSize;
    const fileOffset = resolveMiniContainerOffset(
      miniStreamChain,
      containerByte,
      header.sectorSize,
    );
    if (fileOffset + header.miniSectorSize > data.length) {
      throw new CfbError(`Mini-stream sector ${ms} out of bounds`);
    }
    const take = Math.min(header.miniSectorSize, entry.streamSize - written);
    out.set(data.subarray(fileOffset, fileOffset + take), written);
    offsets.push(fileOffset);
    written += take;
    if (written >= entry.streamSize) break;
  }

  if (written < entry.streamSize) {
    throw new CfbError(`Mini-stream "${entry.name}" ended early (${written}/${entry.streamSize})`);
  }
  return { bytes: out, offsets };
}

function resolveMiniContainerOffset(
  containerChain: number[],
  containerByte: number,
  sectorSize: number,
): number {
  const sectorIndex = Math.floor(containerByte / sectorSize);
  const within = containerByte % sectorSize;
  const sector = containerChain[sectorIndex];
  if (sector === undefined) {
    throw new CfbError("Mini-stream container offset out of range");
  }
  return sectorOffset(sector, sectorSize) + within;
}
