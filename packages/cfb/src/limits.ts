export interface CfbLimits {
  /** Maximum total file size in bytes. */
  maxFileSize: number;
  /** Maximum size of a single stream in bytes. */
  maxStreamSize: number;
  /** Maximum number of directory entries. */
  maxDirectoryEntries: number;
  /** Maximum hops when following a FAT/mini-FAT/DIFAT chain (cycle guard). */
  maxChainHops: number;
}

export const DEFAULT_LIMITS: CfbLimits = {
  maxFileSize: 50 * 1024 * 1024,
  maxStreamSize: 50 * 1024 * 1024,
  maxDirectoryEntries: 4096,
  maxChainHops: 1_000_000,
};

export function resolveLimits(overrides?: Partial<CfbLimits>): CfbLimits {
  return { ...DEFAULT_LIMITS, ...overrides };
}
