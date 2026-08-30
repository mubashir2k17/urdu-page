import { CfbError, CfbLimitError } from "./errors.js";
import type { CfbLimits } from "./limits.js";
import { SECTOR_END_OF_CHAIN, SECTOR_FREE } from "./header.js";
import type { CfbHeader } from "./header.js";
import { sectorOffset } from "./fat-offset.js";

export const DIRECTORY_ENTRY_SIZE = 128;

export type ObjectType = "unknown" | "storage" | "stream" | "root";

export interface DirectoryEntry {
  name: string;
  nameLength: number;
  objectType: ObjectType;
  colorFlag: number;
  leftSiblingId: number;
  rightSiblingId: number;
  childId: number;
  clsid: Uint8Array;
  stateBits: number;
  creationTime: bigint;
  modifiedTime: bigint;
  startSector: number;
  streamSize: number;
  /** Byte offset of this directory entry in the file. */
  entryOffset: number;
}

export interface DirectoryTree {
  root: DirectoryEntry;
  entries: DirectoryEntry[];
  /** Map from normalized path (no leading slash, no trailing slash) to entry. */
  byPath: Map<string, DirectoryEntry>;
  /** Map from child ID to parent path. */
  children: Map<string, string[]>;
}

export function parseDirectory(
  data: Uint8Array,
  header: CfbHeader,
  fat: Uint32Array,
  limits: CfbLimits,
): DirectoryTree {
  const entries: DirectoryEntry[] = [];
  const visited = new Set<number>();
  let sector = header.firstDirectorySector;
  let hops = 0;

  while (sector !== SECTOR_END_OF_CHAIN && sector !== SECTOR_FREE) {
    if (++hops > limits.maxChainHops) {
      throw new CfbLimitError(`Directory chain exceeded ${limits.maxChainHops} hops`);
    }
    if (visited.has(sector)) {
      throw new CfbError(`Cyclic directory chain at sector ${sector}`);
    }
    visited.add(sector);

    const offset = sectorOffset(sector, header.sectorSize);
    const count = header.sectorSize / DIRECTORY_ENTRY_SIZE;
    if (offset + header.sectorSize > data.length) {
      throw new CfbError(`Directory sector ${sector} out of bounds`);
    }

    for (let i = 0; i < count; i++) {
      const eo = offset + i * DIRECTORY_ENTRY_SIZE;
      const nameLength = readU16(data, eo + 64);
      if (nameLength === 0) continue;
      if (entries.length >= limits.maxDirectoryEntries) {
        throw new CfbLimitError(`Too many directory entries (${entries.length})`);
      }
      entries.push(readEntry(data, eo));
    }

    sector = fat[sector] ?? SECTOR_END_OF_CHAIN;
  }

  if (entries.length === 0) {
    throw new CfbError("No directory entries found");
  }

  // The first entry is the root storage.
  const root = entries[0]!;
  if (root.objectType !== "root") {
    throw new CfbError("First directory entry is not the root storage");
  }

  const byPath = new Map<string, DirectoryEntry>();
  const children = new Map<string, string[]>();

  // Build a tree via red-black sibling/child pointers starting at root.childId.
  function visit(childId: number, parentPath: string): void {
    if (childId === SECTOR_FREE || childId === SECTOR_END_OF_CHAIN) return;
    if (childId < 0 || childId >= entries.length) {
      throw new CfbError(`Directory child id ${childId} out of range`);
    }
    const entry = entries[childId];
    if (!entry) return;

    const path = parentPath === "" ? entry.name : `${parentPath}/${entry.name}`;
    byPath.set(path, entry);

    const siblings = children.get(parentPath) ?? [];
    siblings.push(entry.name);
    children.set(parentPath, siblings);

    // Visit siblings and child.
    if (entry.leftSiblingId !== SECTOR_FREE && entry.leftSiblingId !== SECTOR_END_OF_CHAIN) {
      // Red-black tree: siblings are reached via left/right pointers of the parent's child chain.
    }
    if (entry.rightSiblingId !== SECTOR_FREE && entry.rightSiblingId !== SECTOR_END_OF_CHAIN) {
      // handled by recursive walk below
    }
    if (entry.childId !== SECTOR_FREE && entry.childId !== SECTOR_END_OF_CHAIN) {
      visit(entry.childId, path);
    }
  }

  // The red-black tree: siblings are linked via left/right sibling pointers on
  // each node. We walk the whole `entries` list instead, reconstructing paths
  // via childId only (which is sufficient for CFB streams we need), plus
  // sibling chains.
  byPath.set("", root);
  // Rebuild path map by walking childId from root.
  walkChildren(root.childId, "", entries, byPath, children, limits, 0);

  return { root, entries, byPath, children };
}

function walkChildren(
  childId: number,
  parentPath: string,
  entries: DirectoryEntry[],
  byPath: Map<string, DirectoryEntry>,
  children: Map<string, string[]>,
  limits: CfbLimits,
  depth: number,
): void {
  if (childId === SECTOR_FREE || childId === SECTOR_END_OF_CHAIN) return;
  if (depth > limits.maxChainHops) {
    throw new CfbLimitError("Directory tree depth limit exceeded");
  }

  // Sibling chain via right sibling pointer.
  const siblings: number[] = [];
  let cur: number | undefined = childId;
  const seen = new Set<number>();
  while (cur !== undefined && cur !== SECTOR_FREE && cur !== SECTOR_END_OF_CHAIN) {
    if (seen.has(cur)) throw new CfbError(`Cyclic sibling chain at ${cur}`);
    seen.add(cur);
    siblings.push(cur);
    cur = entries[cur]?.rightSiblingId;
  }

  for (const id of siblings) {
    const entry = entries[id];
    if (!entry) continue;
    const path = parentPath === "" ? entry.name : `${parentPath}/${entry.name}`;
    byPath.set(path, entry);
    const s = children.get(parentPath) ?? [];
    s.push(entry.name);
    children.set(parentPath, s);
    walkChildren(entry.childId, path, entries, byPath, children, limits, depth + 1);
  }
}

function readEntry(data: Uint8Array, eo: number): DirectoryEntry {
  const nameLength = readU16(data, eo + 64);
  const nameBytes = data.subarray(eo, eo + nameLength - 2);
  const name = decodeUtf16Le(nameBytes);

  const objectType = mapObjectType(readU8(data, eo + 66));
  const colorFlag = readU8(data, eo + 67);
  const leftSiblingId = readU32(data, eo + 68);
  const rightSiblingId = readU32(data, eo + 72);
  const childId = readU32(data, eo + 76);
  const clsid = data.subarray(eo + 80, eo + 96).slice();
  const stateBits = readU32(data, eo + 96);
  const creationTime = readU64(data, eo + 100);
  const modifiedTime = readU64(data, eo + 108);
  const startSector = readU32(data, eo + 116);
  const streamSize = readU32(data, eo + 120);

  return {
    name,
    nameLength,
    objectType,
    colorFlag,
    leftSiblingId,
    rightSiblingId,
    childId,
    clsid,
    stateBits,
    creationTime,
    modifiedTime,
    startSector,
    streamSize,
    entryOffset: eo,
  };
}

export function decodeUtf16Le(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const cp = bytes[i]! | (bytes[i + 1]! << 8);
    if (cp === 0) break;
    out += String.fromCharCode(cp);
  }
  return out;
}

const OBJECT_TYPE_MAP: Record<number, ObjectType> = {
  0: "unknown",
  1: "storage",
  2: "stream",
  5: "root",
};

function mapObjectType(code: number): ObjectType {
  return OBJECT_TYPE_MAP[code] ?? "unknown";
}

function readU8(data: Uint8Array, offset: number): number {
  return data[offset]!;
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

function readU64(data: Uint8Array, offset: number): bigint {
  let lo = 0n;
  let hi = 0n;
  for (let i = 0; i < 4; i++) lo |= BigInt(data[offset + i]!) << BigInt(8 * i);
  for (let i = 0; i < 4; i++) hi |= BigInt(data[offset + 4 + i]!) << BigInt(8 * i);
  return lo | (hi << 32n);
}
