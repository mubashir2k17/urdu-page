import { CfbSecurityError } from "./errors.js";
import type { CfbLimits } from "./limits.js";
import { resolveLimits } from "./limits.js";
import { parseHeader } from "./header.js";
import { readFat, readMiniFat, readDifat, readFatChain } from "./fat.js";
import { parseDirectory } from "./directory.js";
import type { DirectoryTree } from "./directory.js";
import { readStream } from "./streams.js";
import type { StreamResult } from "./streams.js";

export interface CfbStream {
  /** Stream name (relative to root, using `/` separators). */
  name: string;
  /** Full path within the container (no leading slash). */
  path: string;
  size: number;
  bytes: Uint8Array;
  /** Byte offsets (in the file) of each sector contributing to this stream. */
  offsets: number[];
}

export interface CfbFile {
  header: ReturnType<typeof parseHeader>;
  directory: DirectoryTree;
  streams: CfbStream[];
  /** Map from normalized path to stream. */
  byPath: Map<string, CfbStream>;
}

export interface CfbReaderOptions {
  limits?: Partial<CfbLimits>;
}

/**
 * Parse an OLE2/CFB container (read-only). Throws on malformed or hostile input.
 */
export function readCfb(data: Uint8Array, options?: CfbReaderOptions): CfbFile {
  const limits = resolveLimits(options?.limits);

  if (data.length < 512) {
    throw new CfbSecurityError(`File too small (${data.length} bytes)`);
  }
  if (data.length > limits.maxFileSize) {
    throw new CfbSecurityError(`File too large (${data.length} bytes)`);
  }

  const header = parseHeader(data, limits);
  const difat = readDifat(data, header, limits);
  const fat = readFat(data, header, difat, limits);
  const miniFat = readMiniFat(data, header, fat, limits);
  const directory = parseDirectory(data, header, fat, limits);

  // The mini-stream container is the root entry's stream.
  const rootStartSector = directory.root.startSector;
  const miniStreamChain = readFatChain(fat, rootStartSector, limits);

  const streams: CfbStream[] = [];
  const byPath = new Map<string, CfbStream>();

  for (const entry of directory.entries) {
    if (entry.objectType !== "stream") continue;
    // Resolve the normalized path from the entry's name via byPath traversal.
    // Directory.byPath already maps storage paths; find the parent storage path.
    const path = findStreamPath(directory, entry);
    if (path === null) continue;

    let result: StreamResult;
    try {
      result = readStream(data, header, fat, miniFat, miniStreamChain, entry, limits);
    } catch (e) {
      // Preserve as much as possible; skip broken stream with a rethrow after wrap.
      throw e;
    }

    const stream: CfbStream = {
      name: entry.name,
      path,
      size: entry.streamSize,
      bytes: result.bytes,
      offsets: result.offsets,
    };
    streams.push(stream);
    byPath.set(path, stream);
  }

  return { header, directory, streams, byPath };
}

function findStreamPath(
  tree: DirectoryTree,
  target: import("./directory.js").DirectoryEntry,
): string | null {
  // Walk byPath (which maps normalized path -> entry) and match by entryOffset.
  for (const [path, entry] of tree.byPath) {
    if (entry.entryOffset === target.entryOffset) {
      return path;
    }
  }
  // Fallback: use entry name only.
  return target.name;
}
